"""
TTS speech output module.

Supports two engines:
  - "minimax": MiniMax speech-2.8-hd API (high quality, requires network)
  - "edge-tts": Microsoft Edge TTS (free, decent quality, fallback)

Falls back to edge-tts if minimax call fails, and to simulation if both unavailable.
"""

import asyncio
import io
import json
import logging
import re
import tempfile
import time as _time
from pathlib import Path

try:
    import httpx
    HAS_HTTPX = True
except Exception:
    HAS_HTTPX = False

try:
    import edge_tts
    HAS_EDGE_TTS = True
except Exception:
    HAS_EDGE_TTS = False

try:
    import pygame
    HAS_PYGAME = True
except Exception:
    HAS_PYGAME = False

try:
    import miniaudio
    HAS_MINIAUDIO = True
except Exception:
    HAS_MINIAUDIO = False

from core.event_bus import EventBus, Events

logger = logging.getLogger(__name__)


class TTSSpeaker:
    def __init__(self, event_bus: EventBus, config: dict, shared_state=None):
        self._bus = event_bus
        self._tts_cfg = config.get("tts", {})
        self._llm_cfg = config.get("llm", {})
        self._shared_state = shared_state

        self._engine = self._tts_cfg.get("engine", "edge-tts")
        self._voice = self._tts_cfg.get("voice", "zh-CN-XiaoxiaoNeural")

        self._minimax_api_key = self._llm_cfg.get("api_key", "")
        self._minimax_model = self._tts_cfg.get("minimax_model", "speech-2.8-hd")
        self._minimax_voice_id = self._tts_cfg.get("minimax_voice_id",
                                                     "Chinese (Mandarin)_Lyrical_Voice")
        self._minimax_speed = self._tts_cfg.get("minimax_speed", 1.0)
        self._minimax_stream = bool(self._tts_cfg.get("minimax_stream", True))
        # MiniMax T2A v2 supports an optional emotion hint that adds a subtle
        # expressive colouring to the synthesised voice. happy = brighter,
        # smilier; neutral = flat. We surface it so the persona (活力邻家
        # 大姐姐) can sound warm by default instead of clinical.
        self._minimax_emotion = self._tts_cfg.get("minimax_emotion", "").strip()

        self._sim_mode = not HAS_PYGAME
        self._is_speaking = False
        self._minimax_vol = 1.0
        # Upstream queue: LLM agent drops (text, source) tuples here.
        self._speak_queue: asyncio.Queue = asyncio.Queue()
        # Playback pipeline: dispatcher kicks off MiniMax TTS fetch for each
        # item as soon as it arrives (in parallel with ongoing playback) and
        # forwards a tuple (item, fetch_task, mode) here. speak_loop only
        # plays, never fetches -- that's what eliminates the 1.2s dead-air
        # gap between segments when a reply has multiple sentences.
        # mode == "stream": play via existing streaming path (first segment
        # only, to preserve first-byte latency).
        # mode == "prefetch": fetch_task resolves to complete MP3 bytes; we
        # just decode+play, which is effectively instant.
        self._prefetch_queue: asyncio.Queue = asyncio.Queue()
        # Per-conversation flag: True from the moment dispatcher accepts the
        # FIRST item of a reply until speak_loop drains both queues and logs
        # "Conversation ended". Used instead of a point-in-time check on
        # (is_speaking AND prefetch_queue.empty()) which is racy: when LLM
        # emits seg1 and seg2 back-to-back, dispatcher can process seg2
        # before speak_loop has actually flipped is_speaking to True for
        # seg1, so seg2 wrongly gets classified as "first" and goes through
        # the slow streaming path too. With this flag the classification is
        # deterministic: only the very first segment after a conversation
        # ends gets mode="stream", every subsequent segment uses prefetch.
        self._pipeline_active = False
        self._bus.subscribe(Events.LLM_RESPONSE, self._on_llm_response)
        self._bus.subscribe(Events.ACTION_REQUEST, self._on_action_request)

    async def initialize(self) -> None:
        if self._sim_mode:
            logger.warning("[SIM] TTS simulation mode (pygame unavailable)")
            return
        try:
            # Match MiniMax stream output (32kHz mono 16-bit). Small buffer for
            # low playback latency across chunk boundaries; SDL resamples if
            # a Sound's native rate differs.
            pygame.mixer.init(frequency=32000, size=-16, channels=1, buffer=512)
            pygame.mixer.set_num_channels(4)
            logger.info("TTS audio player initialized (engine=%s)", self._engine)
        except Exception as e:
            logger.warning("pygame init failed: %s, falling back to simulation", e)
            self._sim_mode = True

    async def _on_action_request(self, data: dict) -> None:
        if data.get("type") != "set_volume":
            return
        vol = data.get("volume", 5)
        vol = max(1, min(10, vol))
        self._minimax_vol = vol * 0.6
        if HAS_PYGAME and not self._sim_mode:
            pygame.mixer.music.set_volume(min(1.0, vol / 8.0))
        logger.info("Volume set to %d/10 (minimax_vol=%.1f, pygame=%.1f)",
                     vol, self._minimax_vol, min(1.0, vol / 8.0))

    async def _on_llm_response(self, data: dict) -> None:
        text = data.get("text", "")
        source = data.get("source", "")
        if not text:
            return
        if source == "speech":
            self._flush_proactive_items()
        await self._speak_queue.put((text, source))

    def _flush_all(self) -> None:
        """Clear both queues (used on barge-in). Also cancels any in-flight
        prefetch fetch tasks so we don't waste bandwidth downloading audio
        the user just told us to shut up about."""
        while not self._speak_queue.empty():
            try:
                self._speak_queue.get_nowait()
            except asyncio.QueueEmpty:
                break
        while not self._prefetch_queue.empty():
            try:
                item, fetch_task, _mode = self._prefetch_queue.get_nowait()
                if fetch_task is not None and not fetch_task.done():
                    fetch_task.cancel()
            except asyncio.QueueEmpty:
                break

    def _flush_proactive_items(self) -> None:
        """Drop any queued proactive (non-speech) items when a user turn
        starts. The user talking to the robot takes priority over whatever
        the proactive loop had queued up. Applies to both the upstream
        speak_queue and the in-flight prefetch_queue."""
        remaining = []
        while not self._speak_queue.empty():
            try:
                item = self._speak_queue.get_nowait()
                if item[1] != "proactive":
                    remaining.append(item)
                else:
                    logger.info("Flushed proactive item from TTS queue")
            except asyncio.QueueEmpty:
                break
        for item in remaining:
            self._speak_queue.put_nowait(item)

        keep = []
        while not self._prefetch_queue.empty():
            try:
                entry = self._prefetch_queue.get_nowait()
            except asyncio.QueueEmpty:
                break
            item, fetch_task, _mode = entry
            if item[1] == "proactive":
                if fetch_task is not None and not fetch_task.done():
                    fetch_task.cancel()
                logger.info("Flushed proactive item from prefetch pipeline")
            else:
                keep.append(entry)
        for entry in keep:
            self._prefetch_queue.put_nowait(entry)

    # Hard cap on a single TTS utterance (HTTP + decode + playback combined).
    # Even a long reply shouldn't exceed this; if it does, something is
    # wedged (network stall, pygame stuck, etc). Flushing and restarting the
    # pipeline is always safer than freezing the main loop.
    _SPEAK_HARD_TIMEOUT_S = 90.0

    async def prefetch_dispatcher_loop(self) -> None:
        """Pulls items off speak_queue and kicks off MiniMax TTS fetches in
        parallel with ongoing playback.

        The ONLY reason mid-reply audio felt "one-two stutter stutter" before
        was that speak_loop was strictly serial: finish playing seg1 -> POST
        MiniMax for seg2 -> wait 1.2s for first byte -> play seg2. That 1.2s
        gap was perceived as "robot ran out of breath".

        With this dispatcher the timeline becomes:

            seg1:  [fetch |======play (3s)======|]
            seg2:       [fetch |===========|            play (3s)]
                                             ^^^ seg2 fetch completes
                                                 DURING seg1 play, so when
                                                 seg1 ends playback we can
                                                 start seg2 immediately.

        First-segment latency is preserved: when the pipeline is empty we
        mark the item as mode="stream" and speak_loop uses the existing
        chunked streaming path (~1.2s first byte). Subsequent segments are
        fetched as full mp3 buffers in the background and the player just
        decodes + plays them when it's ready."""
        while self._shared_state is None or self._shared_state.is_running:
            try:
                item = await asyncio.wait_for(
                    self._speak_queue.get(), timeout=1.0)
            except asyncio.TimeoutError:
                continue

            text, source = item

            # First segment of the reply gets mode="stream" to preserve the
            # existing ~1.2s first-byte latency. All subsequent segments of
            # the same reply get mode="prefetch" -- their MP3 download runs
            # in parallel with the previous segment's playback, so by the
            # time speak_loop is ready for them they're already in memory.
            # Flag is reset by speak_loop when both queues drain.
            is_first = not self._pipeline_active
            self._pipeline_active = True

            fetch_task = None
            mode = "stream"
            if (not is_first
                    and self._engine == "minimax"
                    and HAS_HTTPX and self._minimax_api_key
                    and HAS_MINIAUDIO):
                fetch_task = asyncio.create_task(
                    self._fetch_minimax_mp3_full(text))
                mode = "prefetch"
                logger.info("Prefetch kicked off: %r", text[:40])

            await self._prefetch_queue.put((item, fetch_task, mode))

    async def speak_loop(self) -> None:
        await self.initialize()
        logger.info("TTS speak loop started (pipelined)")
        while self._shared_state is None or self._shared_state.is_running:
            try:
                entry = await asyncio.wait_for(
                    self._prefetch_queue.get(), timeout=1.0)
            except asyncio.TimeoutError:
                continue

            item, fetch_task, mode = entry
            text, source = item
            try:
                if mode == "prefetch" and fetch_task is not None:
                    # Fetch may already be done (overlap worked); await is
                    # then near-instant.
                    try:
                        mp3_bytes = await asyncio.wait_for(
                            fetch_task, timeout=self._SPEAK_HARD_TIMEOUT_S)
                    except asyncio.TimeoutError:
                        logger.error(
                            "TTS prefetch hard-timeout on %r; flushing",
                            text[:40])
                        if not fetch_task.done():
                            fetch_task.cancel()
                        self._flush_all()
                        if self._shared_state:
                            self._shared_state.update(
                                tts_playing=False, barge_in=False,
                                in_conversation=False)
                        continue
                    except asyncio.CancelledError:
                        continue
                    except Exception as e:
                        logger.warning(
                            "Prefetch failed for %r: %s -- falling back to "
                            "streaming play", text[:40], e)
                        mp3_bytes = None

                    if mp3_bytes:
                        try:
                            await asyncio.wait_for(
                                self._speak_prefetched_mp3(mp3_bytes),
                                timeout=self._SPEAK_HARD_TIMEOUT_S)
                        except asyncio.TimeoutError:
                            logger.error(
                                "TTS prefetched play hard-timeout on %r; "
                                "flushing", text[:40])
                            self._flush_all()
                            if self._shared_state:
                                self._shared_state.update(
                                    tts_playing=False, barge_in=False,
                                    in_conversation=False)
                            continue
                    else:
                        # Prefetch failed; fall back to streaming play.
                        try:
                            await asyncio.wait_for(
                                self.speak(text),
                                timeout=self._SPEAK_HARD_TIMEOUT_S)
                        except asyncio.TimeoutError:
                            logger.error(
                                "TTS stream-fallback hard-timeout on %r",
                                text[:40])
                            self._flush_all()
                            if self._shared_state:
                                self._shared_state.update(
                                    tts_playing=False, barge_in=False,
                                    in_conversation=False)
                            continue
                else:
                    # mode == "stream" (first segment, or non-minimax engine)
                    try:
                        await asyncio.wait_for(
                            self.speak(text),
                            timeout=self._SPEAK_HARD_TIMEOUT_S)
                    except asyncio.TimeoutError:
                        logger.error(
                            "TTS speak hard-timeout (%.0fs) on text %r",
                            self._SPEAK_HARD_TIMEOUT_S, text[:40])
                        self._flush_all()
                        if self._shared_state:
                            self._shared_state.update(
                                tts_playing=False, barge_in=False,
                                in_conversation=False)
                        continue

                if self._shared_state and self._shared_state.barge_in:
                    self._flush_all()
                    self._pipeline_active = False
                    self._shared_state.update(
                        barge_in=False, in_conversation=False)
                    logger.info("Barge-in: TTS stopped, queue flushed")
                    continue

                # Conversation end when both queues drained.
                if (self._shared_state
                        and self._speak_queue.empty()
                        and self._prefetch_queue.empty()):
                    await asyncio.sleep(0.3)
                    # Re-check after the grace sleep; if LLM emitted another
                    # segment in that window don't tear the pipeline down.
                    if (self._speak_queue.empty()
                            and self._prefetch_queue.empty()):
                        self._pipeline_active = False
                        self._shared_state.update(in_conversation=False)
                        logger.info(
                            "Conversation ended (TTS queue drained, "
                            "source=%s)", source)
            except Exception as e:
                logger.error("TTS speak failed: %s", e)

    @staticmethod
    def _clean_for_tts(text: str) -> str:
        text = re.sub(
            r'[\U0001F300-\U0001F9FF\U00002702-\U000027B0\U0000FE00-\U0000FE0F'
            r'\U0000200D\U00002600-\U000026FF\U00002700-\U000027BF]+', '', text)
        text = re.sub(r'[（(][^）)]*[・ω▽≧◡ᴗ★☆♥♡✧✨><;；]{2,}[^）)]*[）)]', '', text)
        text = re.sub(r'[✧✨♥♡★☆→←↑↓●○◎◇◆□■△▽⊙⊕⊗♪♫♬]+', '', text)
        text = re.sub(r'\s{2,}', ' ', text)
        return text.strip()

    async def speak(self, text: str) -> None:
        text = self._clean_for_tts(text)
        if not text:
            return
        self._is_speaking = True
        if self._shared_state:
            self._shared_state.update(tts_playing=True, barge_in=False)
        try:
            if self._sim_mode:
                logger.info("[TTS] >>> \"%s\"", text)
                await asyncio.sleep(len(text) * 0.05)
                return

            if self._engine == "minimax" and HAS_HTTPX and self._minimax_api_key:
                ok = await self._speak_minimax(text)
                if ok:
                    return
                logger.warning("MiniMax TTS failed, falling back to edge-tts")

            if HAS_EDGE_TTS:
                await self._speak_edge_tts(text)
            else:
                logger.info("[TTS] >>> \"%s\"", text)
                await asyncio.sleep(len(text) * 0.05)
        finally:
            self._is_speaking = False
            if self._shared_state:
                self._shared_state.update(tts_playing=False)

    # ══════════════════════════════════════════════
    #  MiniMax speech-2.8-hd
    # ══════════════════════════════════════════════

    def _build_minimax_payload(self, text: str, stream: bool) -> dict:
        """Single source of truth for MiniMax T2A v2 request bodies. Used by
        both the live-streaming path (_speak_minimax) and the background
        prefetch path (_fetch_minimax_mp3_full)."""
        payload = {
            "model": self._minimax_model,
            "text": text,
            "stream": stream,
            "language_boost": "Chinese",
            "output_format": "hex",
            "voice_setting": {
                "voice_id": self._minimax_voice_id,
                "speed": self._minimax_speed,
                "vol": self._minimax_vol,
                "pitch": 0,
            },
            "audio_setting": {
                "sample_rate": 32000,
                "bitrate": 128000,
                "format": "mp3",
                "channel": 1,
            },
        }
        if self._minimax_emotion:
            payload["emotion"] = self._minimax_emotion
        if stream:
            payload["force_cbr"] = True
            payload["stream_options"] = {"exclude_aggregated_audio": True}
        return payload

    def _minimax_headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self._minimax_api_key}",
            "Content-Type": "application/json",
        }

    async def _speak_minimax(self, text: str) -> bool:
        """Fetch one MiniMax TTS clip and play it.

        Two paths:
          * stream=false (default + robust): one-shot download, decode the
            whole MP3 with miniaudio (or SDL via music.load if miniaudio is
            missing), play PCM via pygame. No cross-chunk artifacts.
          * stream=true + miniaudio available: real chunk-by-chunk pipeline
            in _speak_minimax_stream_play for ~1.5s first-byte latency.
            Known-fragile with SSE "accumulated snapshot" chunk semantics,
            so only opt in when the trade-off is acceptable.
        """
        payload = self._build_minimax_payload(text, self._minimax_stream)
        headers = {
            "Authorization": f"Bearer {self._minimax_api_key}",
            "Content-Type": "application/json",
        }
        url = "https://api.minimax.chat/v1/t2a_v2"

        if self._minimax_stream and HAS_MINIAUDIO:
            return await self._speak_minimax_stream_play(url, payload, headers)

        # Non-streaming: fetch the entire MP3, then decode+play as a single
        # clean unit. This is the most reliable path -- the MP3 has exactly
        # one header chunk, so no splitting / multi-Xing artifacts.
        oneshot_payload = {**payload, "stream": False}
        try:
            audio_bytes = await self._fetch_minimax_oneshot(
                url, oneshot_payload, headers)
        except Exception as e:
            logger.error("MiniMax TTS request failed: %s", e)
            return False

        if not audio_bytes:
            return False

        loop = asyncio.get_running_loop()

        if HAS_MINIAUDIO:
            # Decode via miniaudio to raw 32kHz mono s16 PCM, then play via
            # pygame.Sound(buffer=). Bypasses SDL_mixer's MP3 decoder
            # entirely, which previously double-played multi-header streams.
            try:
                decoded = await loop.run_in_executor(
                    None, self._decode_mp3_to_pcm, audio_bytes)
            except Exception as e:
                logger.error("miniaudio decode failed, falling back to SDL: %s", e)
                decoded = b""
            if decoded:
                await loop.run_in_executor(
                    None, self._play_pcm_bytes, decoded)
                return True

        # Last-resort path: write to temp file and let SDL_mixer handle MP3.
        with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp:
            tmp.write(audio_bytes)
            tmp_path = tmp.name
        try:
            await loop.run_in_executor(None, self._play_file, tmp_path)
        finally:
            Path(tmp_path).unlink(missing_ok=True)
        return True

    @staticmethod
    def _decode_mp3_to_pcm(mp3_bytes: bytes) -> bytes:
        decoded = miniaudio.decode(
            mp3_bytes,
            output_format=miniaudio.SampleFormat.SIGNED16,
            nchannels=1,
            sample_rate=32000,
        )
        return decoded.samples.tobytes()

    def _play_pcm_bytes(self, pcm_bytes: bytes) -> None:
        """Play raw 32kHz mono s16 PCM via pygame.Sound + Channel, checking
        barge-in flag every 20ms so interrupt is responsive."""
        try:
            sound = pygame.mixer.Sound(buffer=pcm_bytes)
        except Exception as e:
            logger.warning("pygame Sound(buffer=) failed: %s", e)
            return
        channel = sound.play()
        if channel is None:
            return
        while channel.get_busy():
            if self._shared_state and self._shared_state.barge_in:
                channel.stop()
                logger.info("[TTS] Playback interrupted by barge-in")
                return
            _time.sleep(0.02)

    async def _fetch_minimax_oneshot(self, url, payload, headers) -> bytes:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(url, json=payload, headers=headers)
            resp.raise_for_status()
            result = resp.json()
        status_code = result.get("base_resp", {}).get("status_code", -1)
        if status_code != 0:
            msg = result.get("base_resp", {}).get("status_msg", "unknown")
            logger.error("MiniMax TTS error: %s (code=%s)", msg, status_code)
            return b""
        audio_hex = result.get("data", {}).get("audio", "")
        if not audio_hex:
            logger.error("MiniMax TTS returned empty audio")
            return b""
        return bytes.fromhex(audio_hex)

    # ══════════════════════════════════════════════
    #  Prefetch path: download full MP3 in parallel with prior segment's
    #  playback, then decode + play when ready. Eliminates segment-to-
    #  segment dead air that the serial pipeline was introducing.
    # ══════════════════════════════════════════════

    async def _fetch_minimax_mp3_full(self, text: str) -> bytes:
        """Stream MiniMax TTS SSE and accumulate into a complete MP3 buffer.
        Uses stream mode because it starts returning bytes ~1.2s after the
        POST -- if we used stream=false we'd be blocked for the full 2-4s
        synthesis time, which defeats the overlap optimisation."""
        payload = self._build_minimax_payload(text, stream=True)
        headers = self._minimax_headers()
        url = "https://api.minimax.chat/v1/t2a_v2"

        mp3_buf = bytearray()
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                async with client.stream(
                        "POST", url, json=payload, headers=headers) as resp:
                    resp.raise_for_status()
                    async for raw_line in resp.aiter_lines():
                        if (self._shared_state
                                and self._shared_state.barge_in):
                            return b""
                        if not raw_line or not raw_line.startswith("data:"):
                            continue
                        body = raw_line[5:].strip()
                        if not body:
                            continue
                        try:
                            obj = json.loads(body)
                        except Exception:
                            continue
                        data = obj.get("data") or {}
                        hex_seg = data.get("audio", "")
                        if hex_seg:
                            try:
                                mp3_buf.extend(bytes.fromhex(hex_seg))
                            except Exception:
                                continue
                        base_resp = obj.get("base_resp") or {}
                        sc = base_resp.get("status_code", 0)
                        if sc and sc != 0:
                            msg = base_resp.get("status_msg", "unknown")
                            logger.error(
                                "MiniMax TTS prefetch error: %s (code=%s)",
                                msg, sc)
                            return b""
        except asyncio.CancelledError:
            raise
        except Exception as e:
            logger.warning("Prefetch stream failed on %r: %s",
                           text[:40], e)
            return b""
        return bytes(mp3_buf)

    async def _speak_prefetched_mp3(self, mp3_bytes: bytes) -> None:
        """Decode a complete MP3 buffer and play it via pygame. Used when
        the prefetch pipeline has already downloaded the audio during the
        previous segment's playback -- first-byte latency is ~0 because
        the network round-trip happened in parallel with playback."""
        if not mp3_bytes:
            return
        self._is_speaking = True
        if self._shared_state:
            self._shared_state.update(tts_playing=True, barge_in=False)
        try:
            loop = asyncio.get_running_loop()
            try:
                pcm = await loop.run_in_executor(
                    None, self._decode_mp3_to_pcm, mp3_bytes)
            except Exception as e:
                logger.error("Prefetched MP3 decode failed: %s", e)
                return
            if pcm:
                await loop.run_in_executor(
                    None, self._play_pcm_bytes, pcm)
        finally:
            self._is_speaking = False
            if self._shared_state:
                self._shared_state.update(tts_playing=False)

    # ══════════════════════════════════════════════
    #  Real streaming playback: decode MP3 chunks incrementally via miniaudio
    # ══════════════════════════════════════════════

    # Min new bytes since last successful decode before trying again. Decoding
    # the full mp3 buffer repeatedly is wasteful for every tiny chunk, so we
    # wait until at least this many new bytes arrived. 4KB ~= 2-3 MiniMax
    # SSE chunks (~200ms of audio) -- small enough that the first decode
    # happens ~500ms after the request starts, large enough that miniaudio
    # has a valid MP3 frame boundary to work from.
    _STREAM_DECODE_EVERY_BYTES = 4 * 1024

    # Min new PCM bytes we must have before starting a playback segment. Too
    # small => choppy micro-segments. Too large => perceivable first-byte
    # delay. 12800 bytes @ 32kHz mono s16 = 0.2s of audio, which is the
    # sweet spot: well above pygame's ~50ms per-channel overhead, but
    # 2.5x faster to first-sound than the old 0.5s threshold.
    _STREAM_MIN_PCM_PLAY_BYTES = 12800

    # Hard timeout for the whole streaming playback (request + decode + play).
    # Prevents a stuck MiniMax SSE stream from wedging the speak loop.
    _STREAM_HARD_TIMEOUT_S = 60.0

    async def _speak_minimax_stream_play(self, url, payload, headers) -> bool:
        """Real streaming playback: decode & play MP3 chunks as they arrive.

        Architecture:
          * Producer reads SSE, pushes hex-decoded MP3 bytes into a queue.
          * Consumer accumulates them in a bytearray. Every time the buffer
            grows by _STREAM_DECODE_EVERY_BYTES we ask miniaudio to decode
            the full buffer into s16 PCM. miniaudio ignores trailing partial
            MP3 frames cleanly, so repeated decodes are stable -- the PCM
            prefix doesn't change, only the tail grows.
          * We play just the newly produced PCM tail via pygame.Sound(buffer=)
            and advance a cursor. No SDL_mixer MP3 code path is ever used,
            which sidesteps the multi-Xing-header double-play bug.

        Requires miniaudio. If not installed, caller falls back to oneshot.
        """
        if not HAS_MINIAUDIO:
            logger.warning(
                "miniaudio not installed; streaming TTS unavailable, "
                "falling back to non-streaming mode")
            stream_payload = {**payload, "stream": False}
            try:
                audio_bytes = await self._fetch_minimax_oneshot(
                    url, stream_payload, headers)
            except Exception as e:
                logger.error("MiniMax TTS non-stream fallback failed: %s", e)
                return False
            if not audio_bytes:
                return False
            with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp:
                tmp.write(audio_bytes)
                tmp_path = tmp.name
            try:
                loop = asyncio.get_running_loop()
                await loop.run_in_executor(None, self._play_file, tmp_path)
            finally:
                Path(tmp_path).unlink(missing_ok=True)
            return True

        # stream_options.exclude_aggregated_audio=true is the critical fix:
        # by default MiniMax appends a final SSE chunk containing the WHOLE
        # utterance again (the "aggregated" copy, for clients that only read
        # the last event). Our consumer was happily concatenating that final
        # chunk on top of all previous incremental chunks -- result: every
        # reply played twice. Setting this to true makes the server emit
        # only the increments, and the stream ends cleanly at the last one.
        stream_payload = {
            **payload,
            "force_cbr": True,
            "stream_options": {"exclude_aggregated_audio": True},
        }
        chunk_q: asyncio.Queue = asyncio.Queue()
        loop = asyncio.get_running_loop()
        played_any = {"v": False}
        req_start = _time.monotonic()

        async def producer() -> None:
            try:
                async with httpx.AsyncClient(timeout=30.0) as client:
                    async with client.stream(
                            "POST", url, json=stream_payload, headers=headers) as resp:
                        resp.raise_for_status()
                        async for raw_line in resp.aiter_lines():
                            if self._shared_state and self._shared_state.barge_in:
                                return
                            if not raw_line or not raw_line.startswith("data:"):
                                continue
                            body = raw_line[5:].strip()
                            if not body:
                                continue
                            try:
                                obj = json.loads(body)
                            except Exception:
                                continue
                            data = obj.get("data") or {}
                            hex_seg = data.get("audio", "")
                            if hex_seg:
                                try:
                                    chunk_bytes = bytes.fromhex(hex_seg)
                                except Exception:
                                    logger.debug("Bad hex audio chunk, skipping")
                                    continue
                                await chunk_q.put(chunk_bytes)
                            base_resp = obj.get("base_resp") or {}
                            sc = base_resp.get("status_code", 0)
                            if sc not in (0, None):
                                logger.error(
                                    "MiniMax TTS stream error: %s (code=%s)",
                                    base_resp.get("status_msg"), sc)
                                return
            except Exception as e:
                logger.error("MiniMax stream producer error: %s", e)
            finally:
                try:
                    chunk_q.put_nowait(None)
                except Exception:
                    pass  # queue already closed; don't crash

        def play_pcm_blocking(pcm_bytes: bytes) -> bool:
            """Play raw int16 mono 32kHz PCM. Returns False if barge-in."""
            try:
                sound = pygame.mixer.Sound(buffer=pcm_bytes)
            except Exception as e:
                logger.warning("pygame Sound(buffer=) failed: %s", e)
                return True  # skip but don't abort the stream
            channel = sound.play()
            if channel is None:
                return True
            while channel.get_busy():
                if self._shared_state and self._shared_state.barge_in:
                    channel.stop()
                    return False
                _time.sleep(0.02)
            return True

        def decode_full(mp3_buf: bytes):
            """Decode the whole current mp3 buffer to s16 PCM bytes.
            Returns b'' on failure (buffer still too short)."""
            try:
                result = miniaudio.decode(
                    mp3_buf,
                    output_format=miniaudio.SampleFormat.SIGNED16,
                    nchannels=1,
                    sample_rate=32000,
                )
                return result.samples.tobytes()
            except Exception:
                return b""

        async def consumer() -> None:
            mp3_buffer = bytearray()
            last_decoded_mp3_size = 0
            pcm_cursor = 0  # bytes of PCM already played
            logged_first = False

            while True:
                chunk = await chunk_q.get()
                end_of_stream = chunk is None
                if not end_of_stream:
                    if self._shared_state and self._shared_state.barge_in:
                        return
                    mp3_buffer.extend(chunk)

                # Wait for enough fresh MP3 bytes before decoding, unless
                # we're at end-of-stream (must flush whatever's left).
                need_decode = end_of_stream or (
                    len(mp3_buffer) - last_decoded_mp3_size
                    >= self._STREAM_DECODE_EVERY_BYTES)
                if not need_decode:
                    continue

                pcm_bytes = await loop.run_in_executor(
                    None, decode_full, bytes(mp3_buffer))
                if not pcm_bytes:
                    # Buffer not decodable yet -- wait for more chunks.
                    if end_of_stream:
                        logger.warning(
                            "MiniMax stream: final %d bytes undecodable",
                            len(mp3_buffer))
                        return
                    continue
                last_decoded_mp3_size = len(mp3_buffer)

                new_pcm = pcm_bytes[pcm_cursor:]
                # Hold small unplayed PCM tails until we have enough to play
                # a meaningful segment, or until end-of-stream flushes it.
                if (not end_of_stream
                        and len(new_pcm) < self._STREAM_MIN_PCM_PLAY_BYTES):
                    continue
                if not new_pcm:
                    if end_of_stream:
                        return
                    continue

                if not logged_first:
                    logger.info(
                        "MiniMax stream: first playable PCM ready in %.2fs "
                        "(mp3=%d bytes, pcm=%d bytes)",
                        _time.monotonic() - req_start,
                        len(mp3_buffer), len(new_pcm))
                    logged_first = True

                finished = await loop.run_in_executor(
                    None, play_pcm_blocking, new_pcm)
                if not finished:  # barge-in
                    return
                played_any["v"] = True
                pcm_cursor = len(pcm_bytes)

                if end_of_stream:
                    return

        try:
            # return_exceptions=True so that when the outer event loop is
            # torn down (Ctrl+C / shutdown) the CancelledError from either
            # task is surfaced as a value rather than silently orphaning
            # the gather future -- otherwise asyncio logs a noisy
            # "_GatheringFuture exception was never retrieved" on exit.
            await asyncio.wait_for(
                asyncio.gather(producer(), consumer(), return_exceptions=True),
                timeout=self._STREAM_HARD_TIMEOUT_S,
            )
        except asyncio.TimeoutError:
            logger.error(
                "MiniMax stream playback exceeded %.0fs, giving up",
                self._STREAM_HARD_TIMEOUT_S)
        except asyncio.CancelledError:
            # Shutdown path; re-raise so the speak_loop unwinds cleanly.
            raise
        except Exception as e:
            logger.error("MiniMax stream playback error: %s", e)

        if not played_any["v"]:
            logger.error("MiniMax stream yielded no playable audio")
        return played_any["v"]

    # ══════════════════════════════════════════════
    #  Edge-TTS fallback
    # ══════════════════════════════════════════════

    async def _speak_edge_tts(self, text: str) -> None:
        with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp:
            tmp_path = tmp.name
        try:
            communicate = edge_tts.Communicate(
                text=text, voice=self._voice,
                rate=self._tts_cfg.get("rate", "+10%"))
            await communicate.save(tmp_path)
            loop = asyncio.get_running_loop()
            await loop.run_in_executor(None, self._play_file, tmp_path)
        finally:
            Path(tmp_path).unlink(missing_ok=True)

    def _play_file(self, filepath: str) -> None:
        pygame.mixer.music.load(filepath)
        pygame.mixer.music.play()
        while pygame.mixer.music.get_busy():
            if self._shared_state and self._shared_state.barge_in:
                pygame.mixer.music.stop()
                logger.info("[TTS] Playback interrupted by barge-in")
                return
            pygame.time.wait(50)

    @property
    def is_speaking(self) -> bool:
        return self._is_speaking

    async def close(self) -> None:
        if not self._sim_mode and HAS_PYGAME:
            pygame.mixer.quit()
        logger.info("TTS module closed")
