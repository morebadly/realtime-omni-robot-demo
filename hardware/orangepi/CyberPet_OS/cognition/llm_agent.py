"""
LLM chat agent -- the CENTRAL DECISION HUB for all non-safety output.

Architecture:
  - Voice input (SPEECH_TEXT) has highest non-safety priority.
  - proactive_loop polls pending tags: greet > emotion > owner_left > touch (lowest).
  - Touch is only consumed when voice is completely idle.
  - LLM replies can include [EXPR:name] and [ACT:name] directives.
  - LLM can reply [WAIT] to signal "user hasn't finished speaking".
  - _voice_processing flag + _llm_lock prevent concurrent LLM calls.
"""

import asyncio
import logging
import random
import re
import time

try:
    from openai import AsyncOpenAI
    HAS_OPENAI = True
except Exception:
    HAS_OPENAI = False

from core.event_bus import EventBus, Events
from core.shared_state import SharedState

logger = logging.getLogger(__name__)

MOCK_REPLIES = {
    "default": [
        "嗯嗯，人家在听呢～",
        "好的好的，主人说什么都对～",
        "嘿嘿，我喜欢和主人聊天～",
        "哇，真的吗？好有意思噢！",
        "让我想想…想到了！答案是42！",
    ],
    "sad": [
        "主人不要难过，摸摸～",
        "我陪着你呢，要听笑话吗？",
    ],
    "happy": [
        "主人开心我也开心～",
        "嘿嘿，今天真是美好的一天～",
    ],
    "email": [
        "通过OpenClaw发送成功啦～",
    ],
    "greet": [
        "主人回来啦！好想你呀～",
        "欢迎回来主人！今天过得怎么样？",
    ],
    "touch": [
        "咕噜噜～好舒服呀～",
        "嘿嘿，再摸摸嘛～",
    ],
}

_EXPR_ACT_INSTRUCTION = (
    "\n\n[回复格式]\n"
    "必选 [EXPR:X]，X∈{happy,sad,sympathy,surprise,worried,bliss,"
    "attentive,neutral,scared,sleepy,curious,confused}\n"
    "可选 [ACT:Y]，Y∈{nod,shake,tilt_head,approach}\n"
    "标签放在文本最前；之后紧跟话语（不要再出现标签）。\n"
    "示例: [EXPR:happy][ACT:nod]主人开心我也开心～\n"
    "\n[重要] 直接给出最终回复。不要输出 <think> 标签、"
    "不要写思考过程、不要分析、不要自问自答。"
    "一旦开始回复，第一句就必须是给主人听的话。\n"
)

_WAIT_INSTRUCTION = (
    "\n\n[语句完整性判断]\n"
    "如果用户的话明显不完整（被截断、只有半句、语义未结束），"
    "在回复开头加 [WAIT] 表示需要继续听，不要输出其他内容。"
    "否则正常回复。\n"
)

_INTENT_INSTRUCTION = (
    "\n\n[Intent detection]\n"
    "If the user wants to register/enroll their face (e.g. '认识一下我', "
    "'记住我的脸', 'remember my face'), start your reply with exactly "
    "[INTENT:ENROLL] followed by a short cheerful acknowledgement. "
    "Otherwise reply normally."
)

_EMAIL_INSTRUCTION_TEMPLATE = (
    "\n\n[发邮件能力]\n"
    "你可以通过 OpenClaw 网关代主人发邮件。"
    "只在主人明确说'发邮件给 X'、'给 X 发封邮件'之类时触发。\n"
    "可用的联系人（**只能使用这个名单里的名字，不要自己编邮箱**）：\n{contacts}\n"
    "格式（必须严格一行）：\n"
    "[EMAIL:to=<联系人名字>|subject=<主题>|body=<正文>]\n"
    "同一次回复里只能有一个 [EMAIL:]，放在正文前面。\n"
    "示例：[EMAIL:to=Colleague|subject=今日请假|body=我今天身体不舒服，请假一天。]好的主人，邮件已经帮你发啦～\n"
)


class LLMAgent:
    def __init__(self, event_bus, shared_state, config, memory_store=None, gateway=None):
        self._bus = event_bus
        self._state = shared_state
        self._cfg = config.get("llm", {})
        self._memory = memory_store
        self._gateway = gateway
        self._sim_mode = not HAS_OPENAI

        if HAS_OPENAI:
            self._client = AsyncOpenAI(
                base_url=self._cfg.get("api_base", "https://api.minimax.chat/v1"),
                api_key=self._cfg.get("api_key", "no-key"),
            )
        else:
            self._client = None
            logger.warning("[SIM] LLM simulation mode (openai lib unavailable)")

        self._model = self._cfg.get("model", "MiniMax-M2.7-highspeed")
        self._system_prompt = self._cfg.get("system_prompt", "You are a cute desktop pet robot.")
        self._conversation_history: list[dict] = []

        self._voice_processing = False
        self._llm_lock = asyncio.Lock()
        # True when the most recent chat() call already emitted its reply
        # through the streaming path (LLM_RESPONSE / ACTION_REQUEST events
        # published per-segment as tokens arrived). on_speech uses this to
        # avoid double-publishing via _publish_response afterwards.
        self._last_real_chat_streamed = False
        # Same contract for proactive (proactive_loop) replies. Set True when
        # _generate_proactive streams tags/text; in sim-mode (no stream) it
        # stays False and the caller runs _publish_response.
        self._proactive_streamed = False

        # proactive_loop dialog-END cooldown.
        # Symptom we're patching: after a conversation finishes, in_conversation
        # flips True -> False, the proactive_loop sees the gate clear and
        # consumes any pending tag (emotion / owner_left / fatigue) within
        # ~2 s. From the user's perspective this is the robot saying ONE
        # extra unsolicited line right after the real exchange ended ("自言
        # 自语接茬感"). We now require dialog to have been over for at least
        # _post_dialog_cooldown seconds before proactive can fire, giving the
        # user a reasonable window to either start a follow-up turn or just
        # let the silence settle.
        self._last_in_conversation = False
        self._dialog_end_ts = 0.0
        self._post_dialog_cooldown = float(
            self._cfg.get("post_dialog_cooldown", 5.0))

        stt_cfg = config.get("audio", {}).get("stt", {})
        self._correction_enabled = bool(stt_cfg.get("enable_correction", True))
        self._correction_max_len = int(stt_cfg.get("correction_max_len", 8))

        self._email_cfg = config.get("email", {}) or {}
        self._email_enabled = bool(self._email_cfg.get("enabled", True))
        self._email_contacts: dict = dict(self._email_cfg.get("contacts", {}))
        self._email_subject_prefix = str(self._email_cfg.get("subject_prefix", ""))

        self._bus.subscribe(Events.SPEECH_TEXT, self.on_speech)

    # ══════════════════════════════════════════════
    #  Voice input -- highest non-safety priority
    # ══════════════════════════════════════════════

    async def on_speech(self, data: dict) -> None:
        text = data.get("text", "")
        if not text:
            return

        if self._state.enrollment_active:
            return

        self._voice_processing = True
        try:
            # Capture pending touch BEFORE wiping pending tags. The user often
            # pets the head WHILE talking; if we drop the touch tag silently
            # the robot loses that context AND proactive_loop would fire a
            # separate stand-alone "嘿你摸我啦" reply the moment the current
            # TTS drains -- the user perceives this as the robot interrupting
            # itself with an unrelated second sentence ("输出混乱").
            #
            # Merging the touch context into THIS turn's prompt lets the LLM
            # weave one coherent reply (e.g. "被你摸着挺舒服的，怎么啦？")
            # instead of two back-to-back replies.
            touch_ctx = self._capture_pending_touch_for_voice()

            # Voice input takes precedence over any other earlier pending tags
            # (stale emotion / owner_left events from before the user spoke
            # should not be replayed after the conversation).
            self._clear_pending_tags()

            emotion_tag = self._capture_realtime_emotion()
            logger.info("Raw STT: \"%s\"%s%s", text,
                        f" [emotion: {emotion_tag}]" if emotion_tag else "",
                        f" [touch: {touch_ctx}]" if touch_ctx else "")

            if self._should_correct_stt(text):
                corrected = await self._correct_stt(text)
                if corrected != text:
                    logger.info("STT corrected: \"%s\" -> \"%s\"", text, corrected)
                    text = corrected

            user_msg = text
            if emotion_tag:
                user_msg = f"{user_msg}\n[说话时的表情: {emotion_tag}]"
            if touch_ctx:
                user_msg = f"{user_msg}\n[说话前主人{touch_ctx}]"

            async with self._llm_lock:
                response = await self.chat(user_msg)

            if not response:
                return

            if response.strip() == "[WAIT]" or response.strip().startswith("[WAIT]"):
                logger.info("LLM says user not finished, continue listening")
                self._state.update(is_listening=True, is_awake=True)
                return

            # Mark conversation active before dispatching the reply. Without
            # this the TTS queue-drained handler may flip in_conversation to
            # False between turns, letting proactive_loop sneak a proactive reply
            # in while the user's own TTS is still playing (user perceives
            # "the pet said two different things in a row").
            self._state.update(in_conversation=True)

            streamed = self._last_real_chat_streamed

            if self._check_enroll_intent(response):
                if not streamed:
                    # Legacy / sim path: strip tags, send text for TTS.
                    clean = self._strip_intent_tag(response)
                    clean = self._strip_all_tags(clean)
                    if clean:
                        await self._bus.publish(Events.LLM_RESPONSE,
                                                {"text": clean, "source": "speech"})
                # Streaming path already emitted all text segments inline
                # while tokens arrived; only trigger the enrollment state.
                await self._bus.publish(Events.ENROLL_START, {})
                return

            if not streamed:
                # Sim / legacy one-shot reply: old-style full-reply dispatch.
                await self._publish_response(response, "speech")
            # Streaming reply: tags + per-sentence LLM_RESPONSE were already
            # published by _real_chat, nothing left to do here.
        finally:
            self._voice_processing = False

    _PENDING_TTL_SECONDS = 10.0
    _PENDING_ATTR_TIMES: dict = {
        "pending_emotion_context": "pending_emotion_time",
        "pending_touch_context": "pending_touch_time",
        "pending_greet": "pending_greet_time",
        "pending_owner_left": "pending_owner_left_time",
        "pending_fatigue_check": "pending_fatigue_time",
    }

    def _clear_pending_tags(self) -> None:
        """Wipe any queued proactive-reply context. Called on new voice input."""
        self._state.update(
            pending_emotion_context="",
            pending_touch_context="",
            pending_greet=False,
            pending_greet_name="",
            pending_owner_left=False,
            pending_fatigue_check=False,
        )

    def _capture_pending_touch_for_voice(self) -> str:
        """Take + clear any fresh pending_touch_context so on_speech can fold
        it into THIS turn's user_msg instead of letting proactive_loop fire a
        separate reply later. Returns "" when nothing fresh is queued."""
        if not self._pending_tag_fresh("pending_touch_time"):
            return ""
        ctx = (self._state.pending_touch_context or "").strip()
        if not ctx:
            return ""
        # Consume so the upcoming _clear_pending_tags is a no-op for touch
        # (and so a hypothetical second on_speech in the same window doesn't
        # double-cite it).
        self._state.update(pending_touch_context="", pending_touch_time=0.0)
        return ctx

    def _pending_tag_fresh(self, time_attr: str) -> bool:
        """Return False if the pending tag was set more than TTL seconds ago."""
        ts = getattr(self._state, time_attr, 0.0)
        if ts <= 0.0:
            return True
        return (time.time() - ts) <= self._PENDING_TTL_SECONDS

    def _should_correct_stt(self, text: str) -> bool:
        """Lazy STT correction: only trigger on short or suspicious results.
        Normal long sentences go straight to the main LLM (LLM is already
        robust to minor STT noise). This saves ~2s of latency per turn."""
        if not self._correction_enabled or self._sim_mode or not self._client:
            return False
        stripped = text.strip()
        if len(stripped) <= self._correction_max_len:
            return True
        if re.search(r"[a-zA-Z]{2,}", stripped) and len(stripped) <= 15:
            return True
        return False

    # ══════════════════════════════════════════════
    #  Chat core
    # ══════════════════════════════════════════════

    async def chat(self, user_input: str) -> str:
        memory_context = ""
        if self._memory:
            memories = await self._memory.recall(
                query=user_input, person_name=self._state.person_info.name)
            if memories:
                logger.info("Recalled %d memories", len(memories))
                memory_context = "\n".join(f"- {m}" for m in memories)

        if self._sim_mode:
            return await self._mock_chat(user_input)
        return await self._real_chat(user_input, memory_context)

    async def _mock_chat(self, user_input: str) -> str:
        self._last_real_chat_streamed = False
        await asyncio.sleep(random.uniform(0.3, 0.8))

        if self._check_enroll_keyword(user_input):
            return "[INTENT:ENROLL]好呀，让我认识你吧！"

        if "email" in user_input.lower() or "邮件" in user_input:
            reply = random.choice(MOCK_REPLIES["email"])
            if self._gateway:
                await self._gateway.send_email(
                    to="boss@example.com", subject="Test from CyberPet", body=user_input)
        elif self._state.current_emotion == "sad":
            reply = "[EXPR:sympathy][ACT:tilt_head]" + random.choice(MOCK_REPLIES["sad"])
        elif self._state.current_emotion == "happy":
            reply = "[EXPR:happy][ACT:nod]" + random.choice(MOCK_REPLIES["happy"])
        else:
            reply = "[EXPR:happy][ACT:nod]" + random.choice(MOCK_REPLIES["default"])

        logger.info("LLM reply: \"%s\"", reply)

        if self._memory:
            clean = self._strip_all_tags(reply)
            await self._memory.store(
                user_input=user_input, assistant_reply=clean,
                person_name=self._state.person_info.name,
                emotion=self._state.current_emotion,
            )
        return reply

    # Sentence-end punctuation used to split streamed reply into TTS-sized
    # segments. Comma-level split is deliberately excluded -- too choppy.
    _STREAM_SENTENCE_END = set("。！？.!?\n")
    # Minimum characters in a segment before we emit it. This used to be 5
    # which turned replies like "主人好呀。真棒哦。" into two separate TTS
    # round-trips, with ~1.2s of dead air between them because MiniMax TTS
    # first-byte is ~1.2s and the speak loop is strictly serial. Bumping
    # to 28 makes the post-first segments coalesce several short sentences
    # into one TTS request, so the robot no longer "stutters" mid-reply.
    # Downside: for very long replies the second segment starts a bit
    # later, but that's masked because the first loose-split segment is
    # already playing.
    _STREAM_MIN_SEGMENT_LEN = 28

    # First segment uses a LOOSER boundary rule so the robot starts speaking
    # sooner. Typical proactive reply is "[EXPR:X][ACT:Y]主人好呀～小云在呢！":
    # with only the strict ruleset, we'd wait for the final 。/！ before any
    # TTS fires, which means first-audio-byte lags by the FULL LLM generation
    # time (2-3s on MiniMax). The looser first-segment rule lets us fire at
    # 主人好呀～ (~0.5s of tokens after the first one arrives), cutting 1-2s
    # off perceived latency while keeping later segments at the stricter
    # full-sentence boundary so we don't end up machine-gunning TTS clips.
    _STREAM_SENTENCE_END_FIRST = set("。！？.!?，,～~;；\n")
    _STREAM_MIN_SEGMENT_LEN_FIRST = 3

    async def _real_chat(self, user_input: str, memory_context: str = "") -> str:
        """Streaming LLM path for voice replies.

        We request stream=true and decode tokens as they arrive, splitting
        on sentence-end punctuation. Each complete sentence is published
        immediately as an LLM_RESPONSE event so TTS can start synthesizing
        the first sentence while the LLM is still generating later tokens.
        End-to-end first-audio-byte latency drops from ~4s (wait for full
        reply + TTS) to ~1.5s (first sentence's ~0.3s + TTS first byte).

        Tags ([EXPR:X], [ACT:Y], [VOL:N], [EMAIL:...]) are dispatched as
        side-effects the moment their closing ']' is seen. [WAIT] aborts
        all text emission (caller retries listening). [INTENT:ENROLL] is
        left to on_speech for enrollment handshake.

        Sets `self._last_real_chat_streamed = True` so on_speech does NOT
        run _publish_response afterwards (tags/text already emitted).
        """
        self._last_real_chat_streamed = False

        if self._check_enroll_keyword(user_input):
            return "[INTENT:ENROLL]好呀，让我认识你吧！"

        extra = self._consume_pending_tag()
        context = self._build_context(extra)
        system_msg = (self._system_prompt + _EXPR_ACT_INSTRUCTION
                      + _WAIT_INSTRUCTION + _INTENT_INSTRUCTION)
        email_instr = self._build_email_instruction()
        if email_instr:
            system_msg += email_instr
        if context:
            system_msg += f"\n\n[当前感知状态]\n{context}"
        if memory_context:
            system_msg += f"\n\n[相关记忆]\n{memory_context}"

        self._conversation_history.append({"role": "user", "content": user_input})
        if len(self._conversation_history) > 20:
            self._conversation_history = self._conversation_history[-20:]

        messages = [{"role": "system", "content": system_msg}, *self._conversation_history]

        try:
            stream = await self._client.chat.completions.create(
                model=self._model, messages=messages,
                temperature=self._cfg.get("temperature", 0.8),
                max_tokens=self._cfg.get("max_tokens", 512),
                stream=True,
            )
        except Exception as e:
            logger.error("LLM call failed: %s", e)
            return "[EXPR:worried]嗯…人家脑袋卡卡的 >_<"

        full_reply = ""
        pending = ""          # text chars accumulated since last segment emit
        in_tag = False        # inside a [EXPR:..]/[ACT:..] square-bracket tag
        tag_buf = ""
        in_think = False      # inside <think>...</think> (reasoning trace)
        in_angle = False      # accumulating an <xxx> angle tag
        angle_buf = ""
        wait_flag = False
        enroll_flag = False
        source = "speech"
        stream_start_ts = time.time()
        first_segment_logged = False
        # Track TTS emission count. See FALLBACK 2 in _generate_proactive
        # for rationale: zero emissions with in_conversation=True deadlocks
        # Dialog Manager until Ctrl+C, because TTS queue never drains.
        emit_count = [0]

        async def emit_segment(text: str) -> None:
            nonlocal first_segment_logged
            text = text.strip()
            if not text:
                return
            # Drop segments that are only punctuation / whitespace. MiniMax
            # TTS returns undecodable audio for pure "..." or "。", and
            # edge-tts refuses to synthesize them at all -- a single bad
            # tail segment used to kill the whole reply. Keep a char in the
            # segment only if it's alphanumeric, a CJK character, or any
            # non-ASCII non-punctuation symbol.
            if not any(
                ch.isalnum()
                or ('\u4e00' <= ch <= '\u9fff')
                or ('\u3040' <= ch <= '\u30ff')
                for ch in text
            ):
                logger.debug("Skipping punctuation-only segment: %r", text)
                return
            if not first_segment_logged:
                logger.info("LLM stream first segment in %.2fs: %r",
                            time.time() - stream_start_ts, text[:40])
                first_segment_logged = True
            emit_count[0] += 1
            await self._bus.publish(Events.LLM_RESPONSE, {
                "text": text, "source": source,
            })

        try:
            async for chunk in stream:
                if self._state.barge_in:
                    break
                try:
                    delta = chunk.choices[0].delta.content or ""
                except (AttributeError, IndexError):
                    continue
                if not delta:
                    continue
                for ch in delta:
                    full_reply += ch

                    # === <think>...</think> filter ===================
                    # MiniMax M2.x emits its chain-of-thought reasoning
                    # inside <think>...</think>. Without this filter the
                    # reasoning would be split into sentences and spoken
                    # out loud by TTS. We track angle-bracket tags and
                    # drop everything while in_think is True.
                    if in_angle:
                        angle_buf += ch
                        if ch == '>':
                            tag = angle_buf
                            angle_buf = ""
                            in_angle = False
                            if tag == "<think>":
                                in_think = True
                            elif tag == "</think>":
                                in_think = False
                            # Any other <xxx> tag is silently dropped --
                            # LLM replies shouldn't contain raw HTML/XML.
                        continue

                    if ch == '<':
                        in_angle = True
                        angle_buf = "<"
                        continue

                    if in_think:
                        # Inside reasoning block: discard everything until
                        # '<' (which begins a closing </think>).
                        continue
                    # === end think filter ============================

                    if in_tag:
                        tag_buf += ch
                        if ch == ']':
                            await self._dispatch_stream_tag(tag_buf, source)
                            if tag_buf == '[WAIT]':
                                wait_flag = True
                            elif tag_buf.startswith('[INTENT:ENROLL'):
                                enroll_flag = True
                            in_tag = False
                            tag_buf = ""
                        continue

                    if ch == '[':
                        # Opening a tag: flush anything accumulated so that
                        # text already in `pending` reaches TTS in order.
                        if pending.strip() and not wait_flag:
                            await emit_segment(pending)
                            pending = ""
                        in_tag = True
                        tag_buf = "["
                        continue

                    pending += ch
                    if wait_flag:
                        continue  # [WAIT] aborts all TTS output

                    # First segment: looser rule (commas + tildes OK, >=3 chars)
                    # to fire TTS earlier. Subsequent segments: strict rule.
                    if not first_segment_logged:
                        sentence_end = self._STREAM_SENTENCE_END_FIRST
                        min_len = self._STREAM_MIN_SEGMENT_LEN_FIRST
                    else:
                        sentence_end = self._STREAM_SENTENCE_END
                        min_len = self._STREAM_MIN_SEGMENT_LEN
                    if (ch in sentence_end
                            and len(pending.strip()) >= min_len):
                        await emit_segment(pending)
                        pending = ""
        except Exception as e:
            logger.error("LLM stream iteration failed: %s", e)

        # Discard unterminated tag buffer. The old code "rescued" half-a-tag
        # by prepending it to pending (`pending = tag_buf + pending`), which
        # meant TTS literally read "[EXPR:" aloud when the LLM ran out of
        # tokens mid-tag (reasoning models often burn 300+ tokens on
        # <think>, leaving no budget to close the tag). Dropping it lets
        # FALLBACK 2 emit a graceful "嗯？" instead.
        if in_tag and tag_buf:
            logger.warning("Stream ended with unclosed tag %r -- discarded",
                           tag_buf[:40])
            tag_buf = ""
            in_tag = False

        # FALLBACK 1: stream ended inside unclosed <think>. Salvage any real
        # text hidden after an opening <think> if the model mixed modes.
        if in_think:
            logger.warning(
                "Real chat stream ended inside <think> (len=%d, likely "
                "max_tokens mid-thought). Salvaging via post-strip.",
                len(full_reply))
            salvage = self._strip_think_tags(full_reply)
            salvage = re.sub(r"\[[^\]]+\]", "", salvage).strip()
            if salvage:
                pending = salvage

        if not wait_flag and pending.strip():
            await emit_segment(pending)

        # FALLBACK 2: zero TTS segments emitted -> force a minimal fallback
        # so TTS queue drains and Dialog lifecycle completes. Without this,
        # mic is gated until Ctrl+C. Skip if [WAIT] deliberately aborted.
        if not wait_flag and emit_count[0] == 0:
            logger.warning(
                "Real chat produced 0 TTS segments (likely all-think or "
                "empty). Emitting fallback. raw=%r", full_reply[:120])
            await self._bus.publish(Events.LLM_RESPONSE, {
                "text": "嗯？", "source": source,
            })

        full_reply = self._strip_think_tags(full_reply)
        logger.info("LLM reply: \"%s\"", full_reply)

        self._conversation_history.append(
            {"role": "assistant", "content": full_reply})

        if self._memory:
            clean = self._strip_all_tags(full_reply)
            try:
                await self._memory.store(
                    user_input=user_input, assistant_reply=clean,
                    person_name=self._state.person_info.name,
                    emotion=self._state.current_emotion,
                )
            except Exception:
                logger.exception("Memory store failed (non-fatal)")

        self._last_real_chat_streamed = True
        return full_reply

    async def _dispatch_stream_tag(self, tag: str, source: str) -> None:
        """Execute tag side-effects as soon as the closing ']' arrives.

        Tags are idempotent on the ESP32/eye_display side (duplicate EXPR
        is deduped), so partial-stream dispatch is safe. [WAIT] and
        [INTENT:ENROLL] produce no side effects here -- the outer loop
        sets flags that on_speech uses to branch accordingly.
        """
        priority = 1 if source == "speech" else 2

        m_expr = self._RE_EXPR.fullmatch(tag)
        if m_expr:
            await self._bus.publish(Events.ACTION_REQUEST, {
                "type": "set_expression", "expression": m_expr.group(1),
                "priority": priority,
            })
            return

        m_act = self._RE_ACT.fullmatch(tag)
        if m_act:
            await self._bus.publish(Events.ACTION_REQUEST, {
                "type": "servo_action", "action": m_act.group(1),
            })
            return

        m_vol = self._RE_VOL.fullmatch(tag)
        if m_vol:
            await self._bus.publish(Events.ACTION_REQUEST, {
                "type": "set_volume", "volume": int(m_vol.group(1)),
            })
            return

        m_email = self._RE_EMAIL.fullmatch(tag)
        if m_email and self._email_enabled and self._gateway:
            asyncio.create_task(self._handle_email_tag(m_email))
            return
        # Unknown tags / [WAIT] / [INTENT:ENROLL] fall through silently.

    # ══════════════════════════════════════════════
    #  Enrollment keyword detection
    # ══════════════════════════════════════════════

    _ENROLL_KEYWORDS = [
        "认识一下我",
        "记住我的脸", "记住我", "注册人脸", "记得我的脸",
        "认识我", "认一下我",
        "remember my face", "memorize my face", "register my face",
        "enroll my face", "learn my face",
    ]

    def _check_enroll_intent(self, llm_reply: str) -> bool:
        return "[INTENT:ENROLL]" in llm_reply

    @staticmethod
    def _strip_intent_tag(text: str) -> str:
        return text.replace("[INTENT:ENROLL]", "").strip()

    def _check_enroll_keyword(self, text: str) -> bool:
        lower = text.lower()
        return any(kw in lower for kw in self._ENROLL_KEYWORDS)

    # ══════════════════════════════════════════════
    #  Tag parsing: [EXPR:xxx] [ACT:xxx]
    # ══════════════════════════════════════════════

    _RE_EXPR = re.compile(r"\[EXPR:(\w+)\]")
    _RE_ACT = re.compile(r"\[ACT:(\w+)\]")
    _RE_VOL = re.compile(r"\[VOL:(\d+)\]")
    _RE_EMAIL = re.compile(
        r"\[EMAIL:to=([^|\]]+)\|subject=([^|\]]+)\|body=([^\]]+)\]",
        flags=re.DOTALL,
    )

    @classmethod
    def _extract_tag(cls, text: str, tag: str) -> str:
        patterns = {"EXPR": cls._RE_EXPR, "ACT": cls._RE_ACT, "VOL": cls._RE_VOL}
        m = patterns.get(tag, cls._RE_EXPR).search(text)
        return m.group(1) if m else ""

    @classmethod
    def _strip_all_tags(cls, text: str) -> str:
        text = cls._RE_EXPR.sub("", text)
        text = cls._RE_ACT.sub("", text)
        text = cls._RE_VOL.sub("", text)
        text = cls._RE_EMAIL.sub("", text)
        text = text.replace("[INTENT:ENROLL]", "")
        text = text.replace("[WAIT]", "")
        return text.strip()

    def _build_email_instruction(self) -> str:
        if (not self._email_enabled
                or not self._email_contacts
                or self._gateway is None):
            return ""
        lines = [f"  - {name}: {addr}" for name, addr in self._email_contacts.items()]
        return _EMAIL_INSTRUCTION_TEMPLATE.format(contacts="\n".join(lines))

    @staticmethod
    def _strip_think_tags(text: str) -> str:
        # First drop well-formed <think>...</think> blocks.
        text = re.sub(r"<think>.*?</think>\s*", "", text, flags=re.DOTALL)
        # Then drop any UNCLOSED <think>... run (can happen when MiniMax
        # hits max_tokens mid-thought). Without this the caller sees the
        # think text as if it were a real reply and sends it to TTS,
        # reading the robot's inner monologue out loud.
        text = re.sub(r"<think>.*$", "", text, flags=re.DOTALL)
        return text.strip()

    async def _publish_response(self, raw_reply: str, source: str) -> None:
        """Parse EXPR/ACT/VOL/EMAIL tags from LLM reply, then publish events."""
        expr = self._extract_tag(raw_reply, "EXPR")
        action = self._extract_tag(raw_reply, "ACT")
        vol = self._extract_tag(raw_reply, "VOL")
        email_m = self._RE_EMAIL.search(raw_reply)
        text = self._strip_all_tags(raw_reply)

        priority = 1 if source == "speech" else 2

        if expr:
            await self._bus.publish(Events.ACTION_REQUEST, {
                "type": "set_expression", "expression": expr, "priority": priority,
            })

        if action:
            await self._bus.publish(Events.ACTION_REQUEST, {
                "type": "servo_action", "action": action,
            })

        if vol:
            await self._bus.publish(Events.ACTION_REQUEST, {
                "type": "set_volume", "volume": int(vol),
            })

        if email_m and self._email_enabled and self._gateway:
            asyncio.create_task(self._handle_email_tag(email_m))

        if text:
            await self._bus.publish(Events.LLM_RESPONSE, {
                "text": text, "source": source,
            })

    async def _handle_email_tag(self, match) -> None:
        """Resolve contact name -> email, call gateway.send_email (fire-and-forget)."""
        gateway = self._gateway
        if gateway is None:
            return
        to_name, subject, body = (s.strip() for s in match.groups())
        address = self._email_contacts.get(to_name)
        if not address:
            logger.warning("Email tag: unknown contact '%s', skipping send", to_name)
            return
        final_subject = f"{self._email_subject_prefix}{subject}" if self._email_subject_prefix else subject
        try:
            ok = await gateway.send_email(
                to=address, subject=final_subject, body=body)
            if ok:
                logger.info("Email sent via OpenClaw: to=%s subject=%s", address, final_subject)
            else:
                logger.warning("Email send failed: to=%s subject=%s", address, final_subject)
        except Exception:
            logger.exception("Email send raised exception")

    # ══════════════════════════════════════════════
    #  Context builder
    # ══════════════════════════════════════════════

    _STT_CORRECT_PROMPT = (
        "你是语音识别纠错助手。用户通过低质量USB麦克风对桌面宠物机器人'小云'说话。"
        "（唤醒词是'小云小云'，'小林小林'是旧版本仍然兼容。）"
        "语音识别结果可能有严重错误。请根据上下文推测用户真正想说什么。\n"
        "只输出纠正后的文本，不要加任何解释或引号。"
        "如果原文看起来正确就原样输出。\n\n"
        "常见错误模式：\n"
        "- 同音字替换（小云→小运/小韵/晓云/小雲/小允/小元）\n"
        "- 语速快导致吞字漏字（'把声音调大'→'声调大'）\n"
        "- 连读粘连（'你好小云'→'你好笑运'）\n"
        "- 前缀丢失（'小云小云认识一下我'→'云认识一下我'）\n"
        "- 数字误识别（'把'→'八'→'二零一八'）\n\n"
        "用户常说的话：小云小云（唤醒词）、你好小云、认识一下我、你叫什么名字、"
        "看我什么表情、记住我的脸、帮我发邮件、声音大一点、声音小一点、"
        "今天怎么样、讲个笑话。"
    )

    async def _correct_stt(self, raw_text: str) -> str:
        """Use LLM to correct likely STT errors, with conversation context."""
        if self._sim_mode or not self._client:
            return raw_text
        if len(raw_text) > 100:
            return raw_text

        context_msgs = []
        if self._conversation_history:
            recent = self._conversation_history[-4:]
            context_hint = "\n".join(
                f"{'用户' if m['role']=='user' else '小云'}: {m['content'][:50]}"
                for m in recent)
            context_msgs.append({
                "role": "system",
                "content": self._STT_CORRECT_PROMPT
                           + f"\n\n[最近对话上下文]\n{context_hint}",
            })
        else:
            context_msgs.append({
                "role": "system", "content": self._STT_CORRECT_PROMPT,
            })
        context_msgs.append({"role": "user", "content": raw_text})

        try:
            response = await asyncio.wait_for(
                self._client.chat.completions.create(
                    model=self._model,
                    messages=context_msgs,
                    temperature=0.1,
                    max_tokens=60,
                ),
                timeout=5.0,
            )
            corrected = response.choices[0].message.content or raw_text
            corrected = self._strip_think_tags(corrected).strip().strip('"\'')
            return corrected if corrected else raw_text
        except Exception as e:
            logger.debug("STT correction failed, using raw: %s", e)
            return raw_text

    def _capture_realtime_emotion(self) -> str:
        """Grab the current detected emotion from camera, if a person is present."""
        if not self._state.person_present:
            return ""
        emotion = self._state.current_emotion
        confidence = self._state.emotion_confidence
        if emotion == "neutral" and confidence < 0.5:
            return ""
        return f"{emotion}({confidence:.0%})"

    def _build_context(self, extra_context: str = "") -> str:
        snap = self._state.snapshot()
        lines = []
        if snap["person_present"]:
            conf = snap["emotion_confidence"]
            emo_desc = snap["emotion"]
            if conf < 0.5:
                emo_desc += "（不太确定）"
            if snap["is_owner"]:
                lines.append(
                    f"主人 [{snap['person_name']}] 在面前！"
                    f"检测到情绪: {emo_desc} (置信度{conf:.0%})")
            elif snap["person_name"] != "unknown":
                lines.append(f"陌生人 [{snap['person_name']}] 在视野中，情绪: {emo_desc}")
            else:
                lines.append(f"未知人在视野中，情绪: {emo_desc}")
            if snap["owner_present"]:
                lines.append("主人在场——你应该关注主人的感受")
            lines.append("注意：你只能通过情绪标签感知表情，不能看到画面细节，不要编造面部细节描述")
        else:
            lines.append("视野中没有人")
        if snap["is_being_touched"]:
            lines.append("正在被摸头")
        if snap["is_listening"]:
            lines.append("正在听主人说话")
        if extra_context:
            lines.append(extra_context)
        return "\n".join(lines)

    # ══════════════════════════════════════════════
    #  Proactive loop -- polls pending tags by priority
    #  greet > emotion > owner_left > touch (lowest)
    #
    # NOTE: Previously named `think_loop`, renamed to eliminate confusion
    # with `<think>` tags that LLMs sometimes emit as chain-of-thought.
    # "Proactive" better describes what this loop actually does: generate
    # replies without being asked (owner arrived, emotion shift, etc.).
    # ══════════════════════════════════════════════

    async def proactive_loop(self) -> None:
        logger.info("Proactive loop started")
        while self._state.is_running:
            await asyncio.sleep(2.0)

            # Edge-detect dialog END so we can enforce a cooldown before the
            # next proactive reply. Without this, the moment in_conversation
            # flips False the loop sees its gate clear and consumes whatever
            # ambient tag is pending -- producing the unsolicited "你看起来
            # 不太顺心" reply on top of the real conversation ("输出混乱").
            in_conv_now = self._state.in_conversation
            if self._last_in_conversation and not in_conv_now:
                self._dialog_end_ts = time.monotonic()
            self._last_in_conversation = in_conv_now

            # Gate proactive replies whenever a real conversation turn is
            # active or the user is currently being listened to. Each flag
            # covers a different window:
            #   - enrollment_active: face enrollment handshake in progress
            #   - in_conversation: a voice turn has started
            #   - tts_playing: the robot is currently speaking a reply
            #   - is_listening: mic is recording, user about to answer
            #   - _voice_processing: on_speech is inside the LLM call
            # Forgetting is_listening lets proactive_loop grab the LLM lock
            # in the brief window between wake-word and speech finalization,
            # which serialized a ~4s proactive call in front of the user's
            # reply and effectively doubled perceived latency.
            if (self._state.enrollment_active
                    or self._state.in_conversation
                    or self._state.tts_playing
                    or self._state.is_listening
                    or self._voice_processing):
                continue

            # Post-dialog cooldown: even though every gate above has cleared,
            # don't fire if the conversation only just ended.
            if (self._dialog_end_ts
                    and (time.monotonic() - self._dialog_end_ts)
                        < self._post_dialog_cooldown):
                continue

            prompt = self._consume_pending_tag()
            if not prompt:
                continue

            logger.info("Proactive loop processing: %s", prompt[:80])
            try:
                async with self._llm_lock:
                    response = await self._generate_proactive(prompt)
                if not response:
                    continue
                stripped = self._strip_all_tags(response).strip()
                if stripped.upper().startswith("[NONE]") or stripped == "[NONE]":
                    logger.info("Proactive loop: LLM chose [NONE], skipping output")
                    continue
                self._state.update(in_conversation=True)
                # Real-mode streaming path already published tags+segments
                # during _generate_proactive; double-publishing would cause
                # the final sentence to TTS twice. Only fall back to
                # _publish_response when the reply came from the sim-mode
                # branch (which returns a full string all at once).
                if not self._proactive_streamed:
                    await self._publish_response(response, "proactive")
            except Exception as e:
                logger.error("Proactive loop LLM call failed: %s", e)

    def _consume_pending_tag(self) -> str:
        """Collect ALL fresh pending events and merge them into one unified
        prompt. Returns empty string if nothing is pending.

        Historical behavior was one-tag-at-a-time in strict priority order,
        which caused problems when multiple events fired in the same 1-2s
        window (very common: owner face detected -> owner_arrived fires AND
        emotion vote settles -> emotion fires AND fatigue sensor ticks ->
        fatigue fires). The robot would then produce 3 back-to-back
        replies, each 5-10s long, and they'd often CONTRADICT each other
        (greet-happy then sympathy-sad, within 15s).

        Merging keeps the robot feeling like one unified personality: it
        sees the owner arrive while looking sad, and responds once with a
        single warm "welcome back, are you okay?" style reply.

        Conflict resolution rules:
          - owner_left + any arrival-era signal  -> drop owner_left (likely
            FER detector blip during head turn, not a real leave)
          - fatigue + emotion                     -> fatigue subsumes, because
            its prompt already tells LLM to judge emotion and bail with
            [NONE] if wrong
          - touch only fires when voice is idle, as before
        Tags older than _PENDING_TTL_SECONDS are silently dropped.
        """
        signals: list[str] = []
        consumed: dict = {}

        greet_active = (self._state.pending_greet
                        and self._pending_tag_fresh("pending_greet_time"))
        left_active = (self._state.pending_owner_left
                       and self._pending_tag_fresh("pending_owner_left_time"))
        emo_val = self._state.pending_emotion_context
        emo_active = bool(emo_val) and self._pending_tag_fresh("pending_emotion_time")
        fatigue_active = (self._state.pending_fatigue_check
                          and self._pending_tag_fresh("pending_fatigue_time"))
        # NOTE: touch is intentionally NOT a standalone proactive trigger.
        # on_speech folds any fresh pending_touch_context directly into the
        # next user message via _capture_pending_touch_for_voice(). Letting
        # proactive also fire on touch produced the "robot replies twice in
        # a row" pattern: first the dialog reply finishes, then 1-2 s later
        # a surprise "嘿你摸我啦" reply rolls in over what felt like a
        # complete exchange ("输出混乱"). Stale touch tags age out via
        # _drop_stale_pending_tags below.

        # Conflict resolution: if the owner just arrived OR we just saw an
        # emotion / fatigue cue, ignore a simultaneous "owner_left" -- it's
        # almost always a spurious single-frame detector miss.
        if greet_active or emo_active or fatigue_active:
            if left_active:
                consumed["pending_owner_left"] = False
                left_active = False

        # Fatigue prompt used to include a "return [NONE] if you judge this
        # isn't actually fatigue" opt-out. That conditional branch reliably
        # triggers MiniMax to emit a long <think> reasoning block before
        # replying, and if max_tokens runs out mid-think the reply is empty
        # and Dialog deadlocks (see llm_agent.py FALLBACK 2). In the merged
        # multi-signal prompt we drop the opt-out -- other signals already
        # give the LLM enough context to reply naturally, and a bad fatigue
        # guess just produces "主人累啦？" which is harmless.
        if fatigue_active and emo_active:
            consumed["pending_emotion_context"] = ""
            emo_active = False

        if greet_active:
            name = self._state.pending_greet_name or "master"
            signals.append(f"主人'{name}'刚出现在视野里")
            consumed["pending_greet"] = False
            consumed["pending_greet_name"] = ""

        if fatigue_active:
            signals.append("主人可能辛苦了一天刚回来（晚间返回+负面情绪多）")
            consumed["pending_fatigue_check"] = False
            consumed["last_fatigue_greeting_time"] = time.time()

        if emo_active:
            signals.append(f"主人的表情是 {emo_val}")
            consumed["pending_emotion_context"] = ""

        if left_active:
            signals.append("主人离开了视野")
            consumed["pending_owner_left"] = False

        # Touch is folded into the next on_speech turn instead of producing a
        # standalone proactive reply (see touch_active assignment above).

        if not signals:
            self._drop_stale_pending_tags()
            return ""

        if consumed:
            self._state.update(**consumed)

        if len(signals) == 1:
            # Preserve the simple single-signal style -- no need to enumerate.
            core = signals[0]
        else:
            core = "同时发生了这些事：\n- " + "\n- ".join(signals)

        return (
            f"[事件] {core}。\n"
            "请用自然的口语综合回应（一两句话即可，不必刻意求短），"
            "表情和动作要和整体情境一致，不要把每个事件分开说。"
            "选择合适的 [EXPR:] 和 [ACT:]。"
        )

    def _drop_stale_pending_tags(self) -> None:
        updates: dict = {}
        for attr, time_attr in self._PENDING_ATTR_TIMES.items():
            if not self._pending_tag_fresh(time_attr):
                val = getattr(self._state, attr, None)
                if isinstance(val, str) and val:
                    updates[attr] = ""
                elif val is True:
                    updates[attr] = False
        if updates:
            self._state.update(**updates)

    # ══════════════════════════════════════════════
    #  Helpers for other modules (enrollment etc.)
    # ══════════════════════════════════════════════

    _EXTRACT_NAME_PROMPT = (
        "你是名字提取助手。用户对桌面宠物机器人小云说了一句自我介绍，"
        "请提取用户希望被称呼的**名字本体**（1-5 个汉字或英文单词）。\n"
        "规则：\n"
        "- 去掉语气词（嗯、呃、那、吧、啦、哦）\n"
        "- 去掉前缀（叫我、我叫、我的名字是、你可以叫我、你要叫我、就叫我、请叫我、称呼我、call me、my name is）\n"
        "- 去掉末尾的语气（吧、啦、哦、呀、呢）\n"
        "- 只输出名字本身，不加任何引号、标点、解释\n"
        "- 如果根本不是自我介绍（比如'我想喝水'、'你好'），输出 NONE"
    )

    _OWNER_CONFIRM_PROMPT = (
        "你是意图判断助手。用户刚被问'你是我的主人吗？'，判断 ta 的回答属于哪类：\n"
        "- YES: 明确肯定（是、对、嗯、是的、没错、对呀、yes、yeah、yep、是啊、当然）\n"
        "- NO: 明确否定（不是、不、不对、no、不对吧、不是的）\n"
        "- UNCLEAR: 答非所问、含糊、中断、跟主题无关\n"
        "只输出一个大写词：YES / NO / UNCLEAR"
    )

    async def extract_name(self, text: str) -> str:
        """LLM fallback for robust name extraction.
        Returns the cleaned name, or empty string if LLM says NONE."""
        if self._sim_mode or not self._client:
            return ""
        messages: list[dict] = [
            {"role": "system", "content": self._EXTRACT_NAME_PROMPT},
            {"role": "user", "content": text},
        ]
        try:
            response = await asyncio.wait_for(
                self._client.chat.completions.create(
                    model=self._model, messages=messages,
                    temperature=0.0, max_tokens=20,
                ),
                timeout=5.0,
            )
            raw = (response.choices[0].message.content or "").strip()
            raw = self._strip_think_tags(raw).strip().strip('"\'。，！？')
            if raw.upper() == "NONE" or not raw:
                return ""
            return raw
        except Exception as e:
            logger.debug("extract_name failed: %s", e)
            return ""

    async def judge_owner_confirm(self, text: str) -> str:
        """Classify the user reply to '你是我的主人吗？'.
        Returns 'YES', 'NO', or 'UNCLEAR'."""
        if self._sim_mode or not self._client:
            return "UNCLEAR"
        messages: list[dict] = [
            {"role": "system", "content": self._OWNER_CONFIRM_PROMPT},
            {"role": "user", "content": text},
        ]
        try:
            response = await asyncio.wait_for(
                self._client.chat.completions.create(
                    model=self._model, messages=messages,
                    temperature=0.0, max_tokens=8,
                ),
                timeout=5.0,
            )
            raw = (response.choices[0].message.content or "").strip().upper()
            raw = self._strip_think_tags(raw).strip()
            if raw.startswith("YES"):
                return "YES"
            if raw.startswith("NO"):
                return "NO"
            return "UNCLEAR"
        except Exception as e:
            logger.debug("judge_owner_confirm failed: %s", e)
            return "UNCLEAR"

    async def _generate_proactive(self, event_prompt: str) -> str:
        """Streaming proactive reply.

        Same architecture as `_real_chat`: stream tokens, dispatch tags on
        closing `]`, emit text segments on sentence boundaries. The first
        TTS segment can start synthesizing 1-3s before the LLM finishes the
        full reply, which on these short proactive turns is almost the
        entire perceived latency. Returns the full reply text; callers
        MUST NOT run `_publish_response` on it because tags+segments have
        already been published during streaming. Returns "[NONE]" if the
        model opted out (fatigue-check path).
        """
        self._proactive_streamed = False

        if self._sim_mode:
            await asyncio.sleep(0.3)
            if "打招呼" in event_prompt or "出现" in event_prompt:
                return "[EXPR:happy][ACT:nod]" + random.choice(MOCK_REPLIES["greet"])
            if "摸" in event_prompt or "touch" in event_prompt.lower():
                return "[EXPR:bliss][ACT:nod]" + random.choice(MOCK_REPLIES["touch"])
            if "离开" in event_prompt:
                return "[EXPR:sad]主人走了…好想你呀～"
            if "sad" in event_prompt:
                return "[EXPR:sympathy][ACT:tilt_head]" + random.choice(MOCK_REPLIES["sad"])
            if "happy" in event_prompt:
                return "[EXPR:happy][ACT:nod]" + random.choice(MOCK_REPLIES["happy"])
            return "[EXPR:happy]" + random.choice(MOCK_REPLIES["default"])

        context = self._build_context(event_prompt)
        system_msg = self._system_prompt + _EXPR_ACT_INSTRUCTION
        if context:
            system_msg += f"\n\n[当前状态+事件]\n{context}"
        system_msg += ("\n\n这是主动触发的回应，保持自然轻盈即可，"
                       "一般一两句话，不需要长篇大论。不要用 [INTENT:ENROLL]。")

        messages = [
            {"role": "system", "content": system_msg},
            {"role": "user", "content": event_prompt},
        ]

        source = "proactive"
        try:
            stream = await self._client.chat.completions.create(
                model=self._model, messages=messages,
                # Reasoning models (MiniMax-M2.x family) spend 150-300
                # tokens on the <think> chain-of-thought before the actual
                # reply even starts. Old cap of 150 hit EOS mid-thought and
                # truncated replies at "[EXPR:" because the visible reply
                # literally had no budget. 400 leaves ~200 tokens of think
                # plus ~50 chars of Chinese reply, which is plenty for the
                # "≤20 字" proactive style we ask for.
                temperature=0.7, max_tokens=400,
                stream=True,
            )
        except Exception as e:
            logger.error("Proactive LLM stream failed: %s", e)
            return ""

        full_reply = ""
        pending = ""
        in_tag = False
        tag_buf = ""
        in_think = False
        in_angle = False
        angle_buf = ""
        none_detected = False
        stream_start_ts = time.time()
        first_segment_logged = False
        # Track whether we actually emitted text to TTS. If we didn't (e.g.
        # LLM went into <think> mode and hit max_tokens before closing it,
        # producing an entire reply of inner monologue), the caller MUST
        # know so it can refrain from flipping in_conversation=True -- which
        # would start a Dialog that never ends because TTS has nothing to
        # drain. This single-element list lets the inner closure mutate it.
        emit_count = [0]

        async def emit_segment(text: str) -> None:
            nonlocal first_segment_logged
            if none_detected:
                return
            text = text.strip()
            if not text:
                return
            # Punctuation-only filter (same rule as _real_chat).
            if not any(
                ch.isalnum()
                or ('\u4e00' <= ch <= '\u9fff')
                or ('\u3040' <= ch <= '\u30ff')
                for ch in text
            ):
                return
            if not first_segment_logged:
                logger.info("Proactive stream first segment in %.2fs: %r",
                            time.time() - stream_start_ts, text[:40])
                first_segment_logged = True
            emit_count[0] += 1
            await self._bus.publish(Events.LLM_RESPONSE, {
                "text": text, "source": source,
            })

        try:
            async for chunk in stream:
                if self._state.barge_in:
                    break
                try:
                    delta = chunk.choices[0].delta.content or ""
                except (AttributeError, IndexError):
                    continue
                if not delta:
                    continue
                for ch in delta:
                    full_reply += ch

                    if in_angle:
                        angle_buf += ch
                        if ch == '>':
                            tag = angle_buf
                            angle_buf = ""
                            in_angle = False
                            if tag == "<think>":
                                in_think = True
                            elif tag == "</think>":
                                in_think = False
                        continue

                    if ch == '<':
                        in_angle = True
                        angle_buf = "<"
                        continue

                    if in_think:
                        continue

                    if in_tag:
                        tag_buf += ch
                        if ch == ']':
                            if tag_buf.upper().startswith('[NONE'):
                                none_detected = True
                            else:
                                await self._dispatch_stream_tag(tag_buf, source)
                            in_tag = False
                            tag_buf = ""
                        continue

                    if ch == '[':
                        if pending.strip() and not none_detected:
                            await emit_segment(pending)
                            pending = ""
                        in_tag = True
                        tag_buf = "["
                        continue

                    pending += ch
                    if none_detected:
                        continue

                    # First segment: looser rule (commas + tildes OK, >=3 chars)
                    # to fire TTS earlier. Subsequent segments: strict rule.
                    if not first_segment_logged:
                        sentence_end = self._STREAM_SENTENCE_END_FIRST
                        min_len = self._STREAM_MIN_SEGMENT_LEN_FIRST
                    else:
                        sentence_end = self._STREAM_SENTENCE_END
                        min_len = self._STREAM_MIN_SEGMENT_LEN
                    if (ch in sentence_end
                            and len(pending.strip()) >= min_len):
                        await emit_segment(pending)
                        pending = ""
        except Exception as e:
            logger.error("Proactive stream iteration failed: %s", e)

        # Discard unterminated tag buffer. See _real_chat for rationale --
        # "[EXPR:" was being spoken aloud when reasoning models ran out of
        # token budget mid-tag. Now we drop it and let FALLBACK 2 kick in.
        if in_tag and tag_buf:
            logger.warning("Proactive stream ended with unclosed tag %r -- "
                           "discarded", tag_buf[:40])
            tag_buf = ""
            in_tag = False

        # FALLBACK 1: stream ended but we're still inside an unclosed <think>.
        # Everything we consumed is inner monologue. Try to salvage any real
        # reply text by stripping think tags from the raw buffer and using
        # whatever remains as a last-chance pending segment.
        if in_think:
            logger.warning(
                "Proactive stream ended inside <think> (len=%d, likely "
                "max_tokens mid-thought). Salvaging via post-strip.",
                len(full_reply))
            salvage = self._strip_think_tags(full_reply)
            salvage = re.sub(r"\[[^\]]+\]", "", salvage).strip()
            if salvage:
                pending = salvage

        if not none_detected and pending.strip():
            await emit_segment(pending)

        full_reply = self._strip_think_tags(full_reply)
        if none_detected:
            logger.info("Proactive: LLM chose [NONE], skipping output")
            self._proactive_streamed = True
            return "[NONE]"
        # FALLBACK 2: after all salvage attempts, we literally emitted zero
        # TTS segments. If we just silently returned, proactive_loop would still
        # set in_conversation=True (Dialog START), but the TTS queue would
        # stay empty forever -- Dialog END never fires, mic is gated, user's
        # voice is ignored. Force-emit a minimal "嗯？" so the queue drains
        # and Dialog completes its lifecycle even when the LLM misbehaved.
        if emit_count[0] == 0:
            logger.warning(
                "Proactive reply produced 0 TTS segments (likely all-think "
                "or empty). Emitting fallback to avoid Dialog deadlock. "
                "raw=%r", full_reply[:120])
            await self._bus.publish(Events.LLM_RESPONSE, {
                "text": "嗯？", "source": source,
            })
        logger.info("Proactive reply (streamed): \"%s\"", full_reply)
        self._proactive_streamed = True
        return full_reply
