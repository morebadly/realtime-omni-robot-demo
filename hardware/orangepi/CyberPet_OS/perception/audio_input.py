"""
Audio perception -- USB mic + wake word (sherpa-onnx KWS) + offline STT (sense-voice).

Pipeline:
  1. KWS always-on listening for "小林小林" wake word.
  2. On wake: accumulate audio chunks in a buffer during LISTENING state.
  3. Voice activity detection (VAD) in preference order:
       a) Silero VAD if `assets/vad_model/silero_vad.onnx` exists -- neural VAD,
          robust to keyboard/fan/background noise.
       b) Adaptive amplitude VAD otherwise -- noise floor is continuously
          tracked during IDLE state (EMA) and the voice/silence thresholds
          are snapshotted per-utterance from that rolling noise floor.
     Endpoint declared after `silence_ms` of continuous silence, provided
     at least one loud chunk (= "voice seen") was observed.
  4. Run sherpa-onnx sense-voice offline recognition on the buffered audio.
  5. Hallucination filter: tiny text / long audio OR single-char repetition
     are rejected to prevent "小小小小" style noise artifacts.
  6. Publish SPEECH_TEXT. No SPEECH_PARTIAL (offline recognizer has no partials).

Real mode: sounddevice InputStream runs audio callback in a SEPARATE THREAD.
           Events must be published via bus.publish_threadsafe(event, data, self._loop).
           NEVER call await or asyncio.get_event_loop() from the audio callback thread!
Sim mode:  periodic fake wake-word and speech events.
"""

import asyncio
import logging
import random
import time
from enum import Enum, auto
from pathlib import Path
from typing import Optional

try:
    import numpy as np
    HAS_NUMPY = True
except Exception:
    HAS_NUMPY = False

try:
    import sounddevice as sd
    HAS_AUDIO = True
except Exception:
    HAS_AUDIO = False

try:
    import sherpa_onnx
    HAS_SHERPA = True
except Exception:
    HAS_SHERPA = False

try:
    import noisereduce as nr
    HAS_NOISEREDUCE = True
except Exception:
    HAS_NOISEREDUCE = False

HAS_WHISPER = False

from core.event_bus import EventBus, Events
from core.shared_state import SharedState

logger = logging.getLogger(__name__)

# Characters that commonly appear when sense-voice hallucinates our wake
# phrase ("小云小云" / "小林小林") — either as-is or as homophone garble.
# Used by _strip_wake_residue to detect short outputs that are really just
# the wake word leaking into the STT window.
_WAKE_RESIDUE_CHARS = set(
    "小"  # both wake words start with 小
    "云芸雲允韵运源愠恽晕郧员"  # 云 + sense-voice's usual misreads
    "林琳凌玲陵翎邻"  # 林 + misreads
    "笑孝肖销啸"  # "小/笑" bleed
)
# Also catch a few whole-word artifacts the model likes to emit
_WAKE_RESIDUE_WHOLE = (
    "小云小云", "小林小林", "小云", "小林",
    "云云", "林林", "小運", "小雲", "小源",
    "好笑晕", "笑晕", "笑云", "晓云",
)

SIM_SENTENCES = [
    "Hello, how's your day going?",
    "Help me send an email to the boss",
    "What's your name?",
    "I'm so tired today...",
    "Tell me a joke please",
    "Remember I like strawberry cake",
    "What's the weather outside?",
    "What's your favorite color?",
]


class ListenState(Enum):
    IDLE = auto()
    LISTENING = auto()
    PROCESSING = auto()


class AudioInput:
    def __init__(self, event_bus: EventBus, shared_state: SharedState, config: dict,
                 camera_vision=None):
        self._bus = event_bus
        self._state = shared_state
        self._cfg = config.get("audio", {})
        self._camera = camera_vision

        self._target_rate = self._cfg.get("sample_rate", 16000)
        self._sample_rate = self._target_rate
        self._channels = self._cfg.get("channels", 1)
        self._chunk_size = self._cfg.get("chunk_size", 1024)
        self._silence_timeout = self._cfg.get("silence_timeout", 2.0)

        stt_cfg = self._cfg.get("stt", {})
        # Fallback baseline thresholds if adaptive calibration hasn't populated yet.
        self._voice_threshold_cfg = int(stt_cfg.get("voice_threshold", 2500))
        self._silence_peak_cfg = int(stt_cfg.get("silence_peak", 1500))
        self._voice_threshold = self._voice_threshold_cfg
        self._silence_peak = self._silence_peak_cfg
        self._silence_ms = int(stt_cfg.get("silence_ms", 1000))
        self._stt_language = stt_cfg.get("language", "zh")
        self._stt_use_itn = bool(stt_cfg.get("use_itn", True))

        # Adaptive noise floor (EMA of chunk peak while IDLE)
        self._noise_floor = float(self._silence_peak_cfg)
        self._noise_samples_seen = 0

        # Silero VAD (optional; auto-loaded if the onnx model is present)
        self._vad = None  # sherpa_onnx.VoiceActivityDetector instance
        self._vad_buffer_sec = 30.0
        self._vad_speech_state = False

        # Hallucination filter knobs (see _is_hallucination for semantics)
        self._min_chars_per_sec = float(stt_cfg.get("min_chars_per_sec", 0.15))
        self._max_single_char_ratio = float(stt_cfg.get("max_single_char_ratio", 0.6))

        self._listen_state = ListenState.IDLE
        self._recording_start_time = 0.0
        self._stt_endpoint_detected = False

        # TTS self-echo guard: after tts_playing flips to False we still treat
        # the mic as "TTS-contaminated" for `_tts_tail_grace_s` seconds so
        # residual audio in the pygame buffer doesn't retrigger wake word.
        self._tts_tail_grace_s = float(self._cfg.get("tts_tail_grace_seconds", 0.8))
        self._tts_tail_until = 0.0

        self._stt_buffer: list = []
        self._voice_seen = False
        self._last_voice_time = 0.0
        self._listen_duration_s = 0.0
        # Diagnostic: highest sample peak seen during the current LISTENING
        # window. Printed on finalize when we decided no speech was present,
        # so the user can tell "mic volume too low" from "VAD threshold too
        # strict" at a glance.
        self._listen_max_peak = 0

        self._sim_mode = not HAS_AUDIO
        self._kws = None
        self._kws_stream = None
        self._stt_recognizer = None
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._mic_device = self._cfg.get("device", None)
        self._hw_sample_rate = self._target_rate
        self._resample_ratio = 1

    async def start(self) -> None:
        self._loop = asyncio.get_running_loop()

        if self._sim_mode:
            logger.warning("[SIM] Microphone simulation mode (sounddevice unavailable)")
            return

        self._detect_mic_device()
        self._load_wake_word_engine()
        self._load_stt_model()
        self._load_vad_model()

    def _load_vad_model(self) -> None:
        """Try to load Silero VAD from assets/vad_model/silero_vad.onnx.
        If not present, silently fall through to adaptive amplitude VAD."""
        if not HAS_SHERPA:
            return
        vad_cfg = self._cfg.get("vad", {}) or {}
        model_path = Path(vad_cfg.get("silero_model",
            "assets/vad_model/silero_vad.onnx"))
        if not model_path.exists():
            logger.info("Silero VAD model not found (%s); using adaptive amplitude VAD",
                        model_path.name)
            return
        try:
            config = sherpa_onnx.VadModelConfig()
            config.silero_vad.model = str(model_path)
            # 0.55 threshold: tight enough to not fire on keyboard/fan noise
            # with noise floors up to ~4k, still accepts clear speech.
            config.silero_vad.threshold = float(vad_cfg.get("threshold", 0.55))
            # Silero's own silence hysteresis before it closes a segment.
            config.silero_vad.min_silence_duration = float(
                vad_cfg.get("min_silence_duration", 0.6))
            config.silero_vad.min_speech_duration = float(
                vad_cfg.get("min_speech_duration", 0.2))
            config.silero_vad.max_speech_duration = float(
                vad_cfg.get("max_speech_duration", 10.0))
            config.sample_rate = self._target_rate
            config.num_threads = 1
            config.provider = "cpu"
            self._vad = sherpa_onnx.VoiceActivityDetector(
                config, buffer_size_in_seconds=self._vad_buffer_sec)
            logger.info("Silero VAD loaded (%s)", model_path.name)
        except Exception as e:
            logger.warning("Silero VAD load failed, falling back: %s", e)
            self._vad = None

    def _detect_mic_device(self) -> None:
        """Find USB mic and determine its native sample rate."""
        if self._mic_device is not None:
            try:
                info = sd.query_devices(self._mic_device)
                self._hw_sample_rate = int(info["default_samplerate"])
                logger.info("Using configured mic device %s (%s, %dHz)",
                            self._mic_device, info["name"], self._hw_sample_rate)
            except Exception as e:
                logger.warning("Configured mic device %s failed: %s", self._mic_device, e)
                self._mic_device = None

        if self._mic_device is None:
            for i, d in enumerate(sd.query_devices()):
                if d["max_input_channels"] > 0 and "usb" in d["name"].lower():
                    self._mic_device = i
                    self._hw_sample_rate = int(d["default_samplerate"])
                    logger.info("USB mic auto-detected: [%d] %s (%dHz)",
                                i, d["name"], self._hw_sample_rate)
                    break

        if self._mic_device is None:
            logger.warning("No USB mic found, using system default")
            info = sd.query_devices(kind="input")
            self._hw_sample_rate = int(info["default_samplerate"])

        if self._hw_sample_rate != self._target_rate:
            self._resample_ratio = self._hw_sample_rate / self._target_rate
            logger.info("Will resample %d -> %d Hz (ratio=%.2f)",
                        self._hw_sample_rate, self._target_rate, self._resample_ratio)

    def _load_wake_word_engine(self) -> None:
        if not HAS_SHERPA:
            logger.warning("sherpa-onnx unavailable, wake word uses volume fallback")
            return

        kws_cfg = self._cfg.get("kws", {})
        model_dir = Path(kws_cfg.get("model_dir",
            "assets/wake_word/sherpa-onnx-kws-zipformer-wenetspeech-3.3M-2024-01-01"))
        keywords_file = Path(kws_cfg.get("keywords_file",
            "assets/wake_word/my_keywords.txt"))

        if not model_dir.exists() or not keywords_file.exists():
            logger.warning("KWS model or keywords file not found: %s", model_dir)
            return

        try:
            self._kws = sherpa_onnx.KeywordSpotter(
                tokens=str(model_dir / "tokens.txt"),
                encoder=str(model_dir / "encoder-epoch-12-avg-2-chunk-16-left-64.onnx"),
                decoder=str(model_dir / "decoder-epoch-12-avg-2-chunk-16-left-64.onnx"),
                joiner=str(model_dir / "joiner-epoch-12-avg-2-chunk-16-left-64.onnx"),
                keywords_file=str(keywords_file),
                num_threads=2,
                keywords_score=2.0,
                keywords_threshold=0.15,
                provider="cpu",
            )
            self._kws_stream = self._kws.create_stream()
            logger.info("Wake word engine loaded (sherpa-onnx KWS, keywords: %s)",
                        keywords_file.name)
        except Exception as e:
            logger.warning("Wake word engine load failed: %s", e)
            self._kws = None

    def _load_stt_model(self) -> None:
        """Load the offline STT recognizer. Supports two engines via
        `audio.stt.engine` in config:
          - "sense-voice" (default): multi-lingual, supports language tag
            and ITN flag. Uses sherpa_onnx.OfflineRecognizer.from_sense_voice.
          - "paraformer": Chinese-specialized, slightly better accuracy on
            colloquial Mandarin. Uses .from_paraformer; language/use_itn
            are unused.
        """
        if not HAS_SHERPA:
            logger.warning("sherpa-onnx unavailable, STT disabled")
            return

        stt_cfg = self._cfg.get("stt", {})
        engine = stt_cfg.get("engine", "sense-voice").lower()
        default_dir = (
            "assets/stt_model/sherpa-onnx-paraformer-zh-2024-03-09"
            if engine == "paraformer"
            else "assets/stt_model/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17"
        )
        model_dir = Path(stt_cfg.get("model_dir", default_dir))

        if not model_dir.exists():
            logger.warning("Offline STT (%s) model dir not found: %s",
                           engine, model_dir)
            return

        # Both engines ship as model.int8.onnx preferred, model.onnx fallback.
        model_file = model_dir / "model.int8.onnx"
        if not model_file.exists():
            alt = model_dir / "model.onnx"
            if alt.exists():
                model_file = alt
            else:
                logger.warning("%s model file missing in %s", engine, model_dir)
                return

        tokens_file = model_dir / "tokens.txt"
        try:
            if engine == "paraformer":
                self._stt_recognizer = sherpa_onnx.OfflineRecognizer.from_paraformer(
                    paraformer=str(model_file),
                    tokens=str(tokens_file),
                    num_threads=2,
                    sample_rate=self._target_rate,
                    feature_dim=80,
                    debug=False,
                    provider="cpu",
                )
                logger.info("Offline STT loaded (sherpa-onnx paraformer-zh, %s)",
                            model_file.name)
            else:
                self._stt_recognizer = sherpa_onnx.OfflineRecognizer.from_sense_voice(
                    model=str(model_file),
                    tokens=str(tokens_file),
                    num_threads=2,
                    use_itn=self._stt_use_itn,
                    language=self._stt_language,
                    debug=False,
                    provider="cpu",
                )
                logger.info("Offline STT loaded (sherpa-onnx sense-voice, lang=%s)",
                            self._stt_language)
        except Exception as e:
            logger.warning("STT model load failed (%s): %s", engine, e)

    async def listen_loop(self) -> None:
        await self.start()
        if self._sim_mode:
            await self._sim_listen_loop()
            return
        await self._real_listen_loop()

    # ══════════════════════════════════════════════
    #  REAL MODE -- hardware skeleton
    # ══════════════════════════════════════════════

    async def _real_listen_loop(self) -> None:
        """
        Real mode: sounddevice InputStream fires audio_callback in a BACKGROUND THREAD.
        We use bus.publish_threadsafe() from that thread to safely post events.
        The main async loop here monitors listening state and triggers STT.
        """
        logger.info("Audio perception loop started (real mode)")

        def audio_callback(indata, frames, time_info, status):
            """
            WARNING: This runs in sounddevice's audio thread, NOT the asyncio thread.
            NEVER use 'await' here. NEVER call asyncio.get_event_loop() here.
            Use bus.publish_threadsafe() to safely cross the thread boundary.
            """
            if status:
                logger.debug("Audio status: %s", status)
            self._process_audio_chunk_threaded(indata.copy())

        hw_blocksize = int(self._chunk_size * self._resample_ratio)
        try:
            with sd.InputStream(
                device=self._mic_device,
                samplerate=self._hw_sample_rate,
                channels=self._channels,
                dtype="int16",
                blocksize=hw_blocksize,
                callback=audio_callback,
            ):
                while self._state.is_running:
                    if self._listen_state == ListenState.LISTENING:
                        now = time.monotonic()
                        duration = now - self._recording_start_time
                        max_dur = self._cfg.get("max_record_seconds", 15.0)
                        # Grace period after wake: we don't honor the VAD
                        # endpoint for the first `min_record_seconds`, so
                        # the user can say "小林小林 ... 讲个笑话" with a
                        # natural pause between wake word and the rest of
                        # their sentence without the recording closing
                        # prematurely.
                        min_dur = self._cfg.get("min_record_seconds", 1.5)
                        endpoint_allowed = duration >= min_dur
                        should_finalize = (
                            (self._stt_endpoint_detected and endpoint_allowed)
                            or duration >= max_dur
                        )
                        if should_finalize:
                            reason = "endpoint" if self._stt_endpoint_detected else "max_duration"
                            logger.info("[LISTEN] Finalizing (%s, %.1fs)", reason, duration)
                            await self._finalize_offline()
                    elif (self._listen_state == ListenState.IDLE
                          and self._state.is_listening):
                        logger.info("[RESUME] LLM requested continue listening via is_listening flag")
                        self._start_listening()
                    await asyncio.sleep(0.05)
        except Exception as e:
            logger.error("Audio stream error: %s", e)

    def _start_listening(self) -> None:
        """Enter LISTENING state and reset buffers. Called from main loop."""
        self._listen_state = ListenState.LISTENING
        self._recording_start_time = time.monotonic()
        self._stt_endpoint_detected = False
        self._stt_buffer = []
        self._voice_seen = False
        self._last_voice_time = 0.0
        self._listen_max_peak = 0

        # Snapshot adaptive amplitude thresholds from current noise floor.
        # Logic: threshold := max(baseline_from_config, noise_floor * multiplier)
        # so a quiet room stays at the config baseline, a noisy room auto-raises.
        # Multiplier was 3.0, but that made far-field speech (peak ~6-8k)
        # fail the voice test whenever noise_floor was typical (3-4k) -- the
        # resulting threshold (~12k) only near-field speech could clear.
        # With Silero VAD handling voice/non-voice classification anyway,
        # the amplitude check only needs to reject obvious noise (breathing,
        # hum), not every quiet voice, so 2.0x is safer.
        nf = self._noise_floor
        self._voice_threshold = max(self._voice_threshold_cfg, int(nf * 2.0))
        self._silence_peak = max(self._silence_peak_cfg, int(nf * 1.3))
        logger.info(
            "[LISTEN] thresholds: voice>%d, silence<%d, silence_ms=%d, noise_floor=%.0f%s",
            self._voice_threshold, self._silence_peak, self._silence_ms, nf,
            " (silero)" if self._vad is not None else "")

        if self._vad is not None:
            try:
                self._vad.reset()
            except Exception:
                pass
            self._vad_speech_state = False

    def _resample_chunk(self, chunk):
        """Downsample from hw_sample_rate to target_rate (16kHz) via linear interpolation."""
        gain = self._cfg.get("software_gain", 8.0)
        flat = chunk.flatten().astype(np.float64) * gain
        flat = np.clip(flat, -32768, 32767)

        if self._resample_ratio <= 1:
            return flat.astype(np.int16).reshape(-1, 1)

        n_out = int(len(flat) / self._resample_ratio)
        if n_out < 1:
            return chunk
        x_old = np.linspace(0, 1, len(flat))
        x_new = np.linspace(0, 1, n_out)
        resampled = np.interp(x_new, x_old, flat)
        return resampled.astype(np.int16).reshape(-1, 1)

    _audio_log_counter = 0

    def _process_audio_chunk_threaded(self, chunk) -> None:
        """Runs in sounddevice's audio thread. Thread-safe operations only.

        Mic gating rules (strict, to prevent TTS self-echo feedback loop):
          1. PROCESSING state: drop chunk.
          2. tts_playing OR recent TTS tail (grace period): ONLY route to
             barge-in KWS detector. Never run wake-word or STT accumulation
             on these chunks -- they contain the robot's own voice.
          3. In-conversation but not listening: same gate as #2.
          4. Otherwise: normal wake-word + listening pipeline.
        """
        if self._listen_state == ListenState.PROCESSING:
            return

        now_mono = time.monotonic()
        if self._state.tts_playing:
            self._tts_tail_until = now_mono + self._tts_tail_grace_s

        tts_active = self._state.tts_playing or now_mono < self._tts_tail_until

        if tts_active:
            if (self._listen_state == ListenState.IDLE
                    and not self._state.is_listening
                    and not self._state.enrollment_active
                    and HAS_NUMPY):
                self._check_barge_in(self._resample_chunk(chunk))
            return

        if (self._state.in_conversation
                and self._listen_state == ListenState.IDLE
                and not self._state.is_listening
                and not self._state.enrollment_active):
            return

        chunk_16k = self._resample_chunk(chunk)

        self._audio_log_counter += 1
        if self._audio_log_counter % 500 == 1 and HAS_NUMPY:
            vol = np.abs(chunk_16k).mean()
            peak = np.abs(chunk_16k).max()
            logger.info("[MIC] vol=%.0f peak=%d state=%s (chunks=%d)",
                        vol, peak, self._listen_state.name, self._audio_log_counter)

        if self._listen_state == ListenState.IDLE:
            self._check_wake_word_threaded(chunk_16k)
        elif self._listen_state == ListenState.LISTENING:
            self._accumulate_with_vad(chunk_16k)

    _barge_in_kws = None
    _barge_in_kws_stream = None

    _barge_in_chunk_count = 0

    def _check_barge_in(self, chunk) -> None:
        """During TTS playback, detect user calling wake word to interrupt.

        KWS-only: TTS's own voice won't match '小林小林', while user clearly
        calling wake word will. Loud-volume fallback is deliberately disabled
        here because TTS playback itself routinely peaks at 32767 (speaker
        coupling) and would produce false barge-ins, creating an AI-talking-
        to-itself loop. If KWS model unavailable, barge-in is simply off.
        """
        if not (self._kws and self._kws_stream):
            return

        peak = int(np.abs(chunk).max())
        self._barge_in_chunk_count += 1
        if self._barge_in_chunk_count % 80 == 0:
            self._kws.reset_stream(self._kws_stream)

        samples = chunk.flatten().astype(np.float32) / 32768.0
        self._kws_stream.accept_waveform(self._sample_rate, samples)
        detected = False
        while self._kws.is_ready(self._kws_stream):
            self._kws.decode_stream(self._kws_stream)
            result = self._kws.get_result(self._kws_stream)
            if result != "":
                self._kws.reset_stream(self._kws_stream)
                self._barge_in_chunk_count = 0
                detected = True
                logger.info("[BARGE-IN] KWS keyword detected during TTS: %s",
                            result.strip())
                break

        if detected:
            logger.info("[BARGE-IN] User interrupted TTS (peak=%d)", peak)
            self._state.update(barge_in=True)
            self._start_listening()
            self._state.update(is_awake=True, is_listening=True)
            self._bus.publish_threadsafe(Events.WAKE_WORD, {"barge_in": True}, self._loop)

    _kws_chunk_count = 0

    def _check_wake_word_threaded(self, chunk) -> None:
        """Dual trigger: KWS keyword OR loud volume spike. Either wakes the system.
        Also continuously updates the adaptive noise floor EMA with quiet samples."""
        detected = False
        keyword = ""

        if not HAS_NUMPY:
            return

        peak = int(np.abs(chunk).max())
        vol_trigger = self._cfg.get("wake_volume_trigger", 12000)

        # Track ambient noise floor when the environment is quiet.
        # We only consider samples that are clearly not voice -- peak below
        # the current EMA * 2 -- so a loud clap doesn't poison the estimate.
        if peak < max(self._noise_floor * 2.0, 500):
            alpha = 0.05 if self._noise_samples_seen > 20 else 0.2
            self._noise_floor = (1 - alpha) * self._noise_floor + alpha * peak
            self._noise_samples_seen += 1

        if self._kws and self._kws_stream:
            self._kws_chunk_count += 1
            if self._kws_chunk_count % 80 == 0:
                self._kws.reset_stream(self._kws_stream)

            samples = chunk.flatten().astype(np.float32) / 32768.0
            self._kws_stream.accept_waveform(self._sample_rate, samples)
            while self._kws.is_ready(self._kws_stream):
                self._kws.decode_stream(self._kws_stream)
                result = self._kws.get_result(self._kws_stream)
                if result != "":
                    self._kws.reset_stream(self._kws_stream)
                    self._kws_chunk_count = 0
                    detected = True
                    keyword = result.strip()
                    break

        if not detected and peak > vol_trigger:
            detected = True
            keyword = "(loud voice)"

        if detected:
            logger.info("Wake word detected: %s (peak=%d)", keyword, peak)
            self._start_listening()
            self._state.update(is_awake=True, is_listening=True, in_conversation=True)
            self._bus.publish_threadsafe(Events.WAKE_WORD, {}, self._loop)

    def _accumulate_with_vad(self, chunk) -> None:
        """Append chunk to STT buffer, then ask VAD whether speech has ended.
        Silero path if available, adaptive amplitude path otherwise."""
        if not HAS_NUMPY:
            return
        self._stt_buffer.append(chunk.flatten().copy())

        peak = int(np.abs(chunk).max())
        if peak > self._listen_max_peak:
            self._listen_max_peak = peak

        now = time.monotonic()
        if self._vad is not None:
            self._accumulate_vad_silero(chunk, now)
        else:
            self._accumulate_vad_amplitude(chunk, now)

    def _accumulate_vad_silero(self, chunk, now: float) -> None:
        """Use sherpa-onnx Silero VAD to decide speech/silence per chunk.

        Design note: Silero exposes both `is_speech_detected()` (live
        boolean) and a `vad.pop()` segment queue. We used to also use
        pop() to REPLACE the raw _stt_buffer with Silero's trimmed
        segments -- but that sliced utterances at every short inter-
        syllable pause and handed STT only the first segment, so
        "小林小林讲个笑话" became "音。" (~1.8s of speech). Now we:

          - Feed chunks to Silero only to read is_speech_detected()
          - Ignore the segment queue's content, just drain it so its
            internal buffer doesn't grow unbounded on long utterances
          - Let _accumulate_with_vad's raw buffer be the STT input

        Voice-seen gating is DUAL for robustness:
          - Silero says "speech" -> voice_seen
          - OR amplitude peak clearly exceeds voice_threshold -> voice_seen
            (saves us when Silero misjudges normal speech as non-speech
            in moderate ambient noise)

        Endpoint: classic silence-timer. Once we've seen voice, any
        `silence_ms` of continuous non-voice chunks closes the utterance.
        """
        vad = self._vad
        if vad is None:
            self._accumulate_vad_amplitude(chunk, now)
            return
        try:
            samples = chunk.flatten().astype(np.float32) / 32768.0
            vad.accept_waveform(samples)
            speech_now = vad.is_speech_detected()
        except Exception as e:
            logger.debug("Silero VAD feed error, falling back: %s", e)
            self._accumulate_vad_amplitude(chunk, now)
            return

        # Amplitude backup: treat clearly-loud chunks as voice even if
        # Silero doesn't flip. Used ONLY as a one-shot rescue when Silero
        # never agrees; see branch ordering below.
        peak = int(np.abs(chunk).max()) if HAS_NUMPY else 0
        amplitude_voice = peak > self._voice_threshold

        if speech_now:
            # Silero is confident this chunk is speech: arm voice_seen and
            # keep the silence-timer clock zeroed.
            self._voice_seen = True
            self._last_voice_time = now
            self._vad_speech_state = True
        elif self._voice_seen:
            # We've already heard voice. Silero now says silent -- start
            # counting. Endpoint fires after silence_ms of continuous
            # non-speech. This branch MUST come before the amplitude
            # rescue below; otherwise every small ambient noise spike
            # that happened to exceed voice_threshold would re-arm
            # last_voice_time and the silence timer would never expire,
            # pinning every utterance to max_record_seconds (~15s).
            if (now - self._last_voice_time) * 1000 >= self._silence_ms:
                self._stt_endpoint_detected = True
        elif amplitude_voice:
            # Silero never agreed, but a clearly-loud chunk arrived.
            # One-shot rescue: arm voice_seen so later silence chunks
            # flow into the elif-voice_seen branch above and drive
            # endpointing normally.
            self._voice_seen = True
            self._last_voice_time = now

        # Drain Silero's internal segment queue without using the segments.
        # This keeps its buffer bounded but leaves the raw _stt_buffer
        # intact so STT sees the full utterance, not a sliced fragment.
        try:
            while not vad.empty():
                vad.pop()
        except Exception:
            pass

    def _accumulate_vad_amplitude(self, chunk, now: float) -> None:
        peak = int(np.abs(chunk).max())
        if peak > self._voice_threshold:
            self._voice_seen = True
            self._last_voice_time = now
            return
        if self._voice_seen and peak < self._silence_peak:
            if (now - self._last_voice_time) * 1000 >= self._silence_ms:
                self._stt_endpoint_detected = True

    async def _finalize_offline(self) -> None:
        """Run offline sense-voice recognition on the buffered audio, publish text."""
        self._listen_state = ListenState.PROCESSING
        buffered = self._stt_buffer
        self._stt_buffer = []
        voice_seen = self._voice_seen
        speech_start = self._recording_start_time
        speech_end = self._last_voice_time
        self._voice_seen = False

        audio_seconds = 0.0
        if buffered and HAS_NUMPY:
            audio_seconds = sum(len(b) for b in buffered) / float(self._target_rate)

        # Density denominator = actual speech window when we can measure it,
        # else total audio duration. This prevents short utterances padded by
        # silence from being falsely flagged as hallucinations.
        if speech_end > speech_start:
            effective_seconds = max(0.3, speech_end - speech_start)
        else:
            effective_seconds = max(0.3, audio_seconds)

        # Last-chance rescue: if Silero AND amplitude both declined this
        # clip but the recording still shows a clearly loud peak (>=1.1x
        # voice_threshold), run STT anyway. Saves us from dropping real
        # speech that just happened to sit below the VAD threshold.
        # Threshold was 1.5x but that locked out anyone speaking from >0.5m
        # away (their peaks are typically 1.0-1.3x of the adaptive voice
        # threshold). 1.1x is still clearly above the silence floor so
        # noise/breathing won't trigger this rescue path.
        if (not voice_seen
                and self._listen_max_peak >= int(self._voice_threshold * 1.1)
                and buffered):
            logger.info(
                "VAD missed speech but max_peak=%d >= 1.1x threshold(%d), "
                "forcing STT",
                self._listen_max_peak, self._voice_threshold)
            voice_seen = True

        text = ""
        if voice_seen and buffered and self._stt_recognizer and HAS_NUMPY:
            try:
                samples = np.concatenate(buffered).astype(np.float32) / 32768.0
                loop = self._loop

                # Noise reduction: run spectral subtraction over the full
                # utterance before handing it to sense-voice. Removes
                # steady fan / AC / hum, improves recognition on weak
                # speech and lets the user talk at normal volume rather
                # than shout. Non-stationary mode tracks slowly-varying
                # noise without needing a pre-recorded noise profile.
                # Skipped for very short clips where the STFT window is
                # too small to estimate the noise floor reliably.
                if (HAS_NOISEREDUCE
                        and len(samples) >= int(self._target_rate * 0.5)
                        and loop is not None):
                    t0 = time.monotonic()
                    try:
                        samples = await loop.run_in_executor(
                            None, self._denoise_samples, samples)
                        logger.debug(
                            "Noise reduction: %d samples in %.2fs",
                            len(samples), time.monotonic() - t0)
                    except Exception as e:
                        logger.debug("Noise reduction failed, using raw: %s", e)

                if loop is not None:
                    text = await loop.run_in_executor(
                        None, self._run_offline_recognizer, samples)
                else:
                    text = self._run_offline_recognizer(samples)
            except Exception as e:
                logger.debug("Offline STT error: %s", e)

        if text and self._is_hallucination(text, effective_seconds):
            logger.info("STT: rejected hallucination \"%s\" "
                        "(audio=%.1fs, active=%.1fs)",
                        text, audio_seconds, effective_seconds)
            text = ""

        # Skip wake-residue scrub during enrollment: one-word answers
        # like "是" / "不" / "郭" would never contain residue chars, but
        # the user's chosen *name* might (e.g. "小云" itself) and we
        # don't want to silently eat it.
        if text and not getattr(self._state, "enrollment_active", False):
            cleaned = self._strip_wake_residue(text)
            if cleaned != text:
                if cleaned:
                    logger.info(
                        "STT: stripped wake residue \"%s\" -> \"%s\"",
                        text, cleaned)
                else:
                    logger.info(
                        "STT: dropped wake-residue-only result \"%s\"",
                        text)
                text = cleaned

        if text:
            logger.info("STT result: \"%s\"", text)
            self._state.update(last_speech_text=text, is_listening=False)
            await self._bus.publish(Events.SPEECH_TEXT, {
                "text": text, "lang": self._stt_language,
            })
        else:
            # Diagnostic: distinguish "mic volume too low" from "VAD was
            # too strict and rejected audible speech" from "user actually
            # said nothing". max_peak below voice_threshold ≈ silence /
            # weak signal; well above it but voice_seen=False ≈ VAD miss.
            hint = ""
            if self._listen_max_peak < max(self._voice_threshold, 1500):
                hint = " (mic input too quiet; try speaking louder or raising software_gain)"
            elif not voice_seen:
                hint = " (VAD rejected audio; consider lowering audio.vad.threshold)"
            logger.info(
                "STT: no speech detected (max_peak=%d, voice_seen=%s, "
                "audio=%.1fs)%s",
                self._listen_max_peak, voice_seen, audio_seconds, hint)

            # Critical: when no speech was captured, NOBODY downstream will
            # run through TTS -> queue_drained -> in_conversation=False, so
            # in_conversation would stay True forever and the mic gating in
            # _process_audio_chunk_threaded would silently block every
            # subsequent wake word. Clear it here so the next wake actually
            # fires.
            self._state.update(in_conversation=False)

        self._listen_state = ListenState.IDLE
        self._state.update(is_awake=False, is_listening=False)

    def _strip_wake_residue(self, text: str) -> str:
        """Remove wake-word fragments that sense-voice hallucinates.

        When sherpa KWS misses the actual keyword and we fall back to
        the "loud voice" wake path, the wake phrase itself ends up in
        the STT window and comes out as garbled characters (e.g.
        "好笑晕" from "小云小云", "云。" as a pure leak). Those residues
        then pollute the LLM input. This function applies two layered
        rules that preserve real speech:

          Rule A — Peel leading residue: if the first 2+ characters are
            all from the residue set, drop that run. Example:
            "小云小云你好" -> "你好". A single leading "云" or "林" is
            kept (could be legit, like "林黛玉").

          Rule B — Whole-string garble: if the full text is <=3 chars
            and contains ANY residue character, drop everything. That
            kills "好笑晕", "云。", "笑晕" without hurting "嗯嗯" or
            "对" (no residue chars).

        Returns the cleaned text; empty string means "discard entirely,
        re-listen" from the caller's POV.
        """
        if not text:
            return ""

        trimmed = text.strip(" \t\u3000，。、！？,.!?~～")
        if not trimmed:
            return ""

        # Whole-word exact-match shortcut (catches e.g. "好笑晕。")
        bare = "".join(ch for ch in trimmed
                       if ch not in "，。、！？,.!?~～ \t\u3000")
        if bare in _WAKE_RESIDUE_WHOLE:
            return ""

        # Rule A: peel a leading run of residue chars (>=2).
        leading_run = 0
        for ch in trimmed:
            if ch in _WAKE_RESIDUE_CHARS:
                leading_run += 1
            else:
                break
        if leading_run >= 2:
            trimmed = trimmed[leading_run:].lstrip(
                " \t\u3000，。、！？,.!?~～")

        # Rule B: very short + any residue char -> garble.
        compact = "".join(ch for ch in trimmed
                          if ch not in "，。、！？,.!?~～ \t\u3000")
        if len(compact) <= 3 and any(ch in _WAKE_RESIDUE_CHARS
                                     for ch in compact):
            return ""

        return trimmed

    def _is_hallucination(self, text: str, effective_seconds: float) -> bool:
        """Reject sense-voice outputs that look like noise-driven hallucinations.
        Two independent heuristics:
          1. Density: if the *active speech window* is long yet the text is
             only a handful of unique characters, it's likely noise. Threshold
             default is deliberately loose (0.15 chars/s) to avoid killing
             legit short phrases; real hallucinations tend to be far below it
             or caught by #2.
          2. Repetition: a single character dominates ("小小小小", "啊啊啊啊").

        During face enrollment the user's replies are deliberately short
        ("是" / "不是" / their name), so the density check would routinely
        mislabel legitimate one-word answers as hallucinations and block
        the whole handshake. Skip density checks in that phase; repetition
        check still runs.
        """
        stripped = "".join(ch for ch in text if not ch.isspace()
                           and ch not in "。，、！？,.!?")
        if not stripped:
            return True

        enrollment_active = getattr(self._state, "enrollment_active", False)

        # Density check only meaningful for long active windows, and never
        # during enrollment where single-word answers are expected.
        if not enrollment_active and effective_seconds >= 3.0:
            density = len(stripped) / effective_seconds
            if density < self._min_chars_per_sec:
                return True

        # Single-character dominance catches "小小小小" style regardless of duration.
        if len(stripped) >= 3:
            from collections import Counter
            _, top_count = Counter(stripped).most_common(1)[0]
            if top_count / len(stripped) > self._max_single_char_ratio:
                return True

        return False

    def _denoise_samples(self, samples):
        """Run noisereduce spectral subtraction on a float32 sample array.

        Non-stationary mode ("time varying") estimates a moving noise
        profile over the clip -- no calibration sample needed. prop_decrease
        is kept at a conservative 0.75 so we don't over-suppress and
        introduce the metallic artifacts that hurt ASR more than noise
        does. Runs synchronously here; callers invoke it via
        run_in_executor so the main event loop stays responsive.
        """
        return nr.reduce_noise(
            y=samples,
            sr=self._target_rate,
            stationary=False,
            prop_decrease=0.75,
        )

    def _run_offline_recognizer(self, samples) -> str:
        """Synchronous recognition call (invoked from executor)."""
        recognizer = self._stt_recognizer
        if recognizer is None:
            return ""
        try:
            stream = recognizer.create_stream()
            stream.accept_waveform(self._target_rate, samples)
            recognizer.decode_stream(stream)
            result = stream.result
            text = getattr(result, "text", "") or ""
            return text.strip()
        except Exception as e:
            logger.debug("Offline recognize exception: %s", e)
            return ""

    # ══════════════════════════════════════════════
    #  SIMULATION MODE
    # ══════════════════════════════════════════════

    async def _sim_listen_loop(self) -> None:
        logger.info("[SIM] Audio perception loop started (simulated speech every ~12s)")
        while self._state.is_running:
            await asyncio.sleep(12.0 + random.uniform(-2, 3))

            logger.info("[SIM] ** Wake word detected! **")
            self._state.update(is_awake=True, is_listening=True, in_conversation=True)
            await self._bus.publish(Events.WAKE_WORD, {})

            await asyncio.sleep(1.5)

            text = random.choice(SIM_SENTENCES)
            logger.info("[SIM] STT result: \"%s\"", text)
            self._state.update(last_speech_text=text, is_listening=False)
            await self._bus.publish(Events.SPEECH_TEXT, {"text": text, "lang": "zh"})

    async def close(self) -> None:
        self._kws = None
        self._kws_stream = None
        logger.info("Audio module closed")
