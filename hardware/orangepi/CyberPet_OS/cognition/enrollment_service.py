"""
Voice-triggered face enrollment service.

State machine:
  IDLE
    -> WAITING_NAME           (ask "怎么称呼你" / user replies)
    -> CAPTURING              (take 10 face samples)
    -> WAITING_OWNER_CONFIRM  (ask "你是主人吗" / user replies)
    -> IDLE

Name extraction is a two-stage cascade:
  1. Fast regex path that strips common prefixes ("叫我X", "我叫X"...).
  2. LLM fallback (`LLMAgent.extract_name`) when the regex output looks
     suspect (too long, empty, or still contains obvious filler).

Owner confirmation is also two-stage:
  1. Fast regex yes/no keyword match.
  2. LLM fallback (`LLMAgent.judge_owner_confirm`) for ambiguous replies.

On confirmation, the chosen name is persisted to:
  assets/faces_db/OWNER.txt
CameraVision reads this file at startup (overriding config.owner.name), so
the identification pipeline immediately starts recognizing the user as the
owner. Removing the file falls back to the config default.
"""

import asyncio
import logging
import re
import time
from enum import Enum, auto
from pathlib import Path

try:
    import numpy as np
    HAS_NUMPY = True
except Exception:
    HAS_NUMPY = False

from core.event_bus import EventBus, Events
from core.shared_state import SharedState

logger = logging.getLogger(__name__)

ENROLL_TIMEOUT = 30.0
CAPTURE_SAMPLES = 10
CAPTURE_INTERVAL = 0.4
MAX_CONFIRM_RETRIES = 1


class EnrollState(Enum):
    IDLE = auto()
    WAITING_NAME = auto()
    CAPTURING = auto()
    WAITING_OWNER_CONFIRM = auto()


_NAME_PREFIXES = [
    # Chinese — longest first so "你可以叫我" matches before "叫我"
    "你可以叫我", "你可以称呼我", "你就叫我", "你要叫我", "你叫我",
    "可以叫我", "就叫我", "要叫我", "请叫我",
    "我的名字是", "我的名字叫", "我的名字叫作",
    "我名字是", "我名字叫",
    "我叫", "我是", "称呼我", "叫我",
    # English
    "you can just call me ", "you can call me ", "just call me ",
    "my name is ", "call me ", "i'm called ", "i'm ", "i am ",
]
_NAME_SUFFIXES = ["吧", "啦", "哦", "呀", "呢", "了", "。", "，", ".", ","]
_NAME_FILLER_PREFIX = re.compile(r"^[嗯呃那就哦啊呀吧哈唔，、。\s]+", flags=re.UNICODE)

_YES_KEYWORDS = {"是", "是的", "对", "对的", "对呀", "是啊", "嗯", "嗯对", "当然",
                 "没错", "是呢", "嗯嗯", "yes", "yeah", "yep", "yup"}
_NO_KEYWORDS = {"不是", "不", "不对", "no", "nope", "不是的", "不对吧"}


class EnrollmentService:
    def __init__(self, event_bus: EventBus, shared_state: SharedState,
                 config: dict, camera_vision, llm_agent=None):
        self._bus = event_bus
        self._state = shared_state
        self._camera = camera_vision
        self._llm = llm_agent
        self._cfg = config.get("vision", {})
        self._face_db_path = Path(self._cfg.get("face_db_path", "assets/faces_db"))

        self._enroll_state = EnrollState.IDLE
        self._enroll_name = ""
        self._state_entered_at = 0.0
        self._owner_retries = 0

        self._bus.subscribe(Events.ENROLL_START, self._on_enroll_start)
        self._bus.subscribe(Events.SPEECH_TEXT, self._on_speech_text)

    # ══════════════════════════════════════════════
    #  Entry
    # ══════════════════════════════════════════════

    async def _on_enroll_start(self, data: dict) -> None:
        if self._enroll_state != EnrollState.IDLE:
            logger.warning("Enrollment already in progress, ignoring")
            return

        logger.info("Enrollment mode activated")
        self._enter_state(EnrollState.WAITING_NAME)
        self._state.update(enrollment_active=True)

        await self._bus.publish(Events.ACTION_REQUEST, {
            "type": "set_expression", "expression": "attentive", "priority": 1,
        })
        await self._say_then_listen("好的！主人我要怎么称呼你呢？")

    async def _on_speech_text(self, data: dict) -> None:
        if self._enroll_state == EnrollState.IDLE:
            return

        if self._is_timed_out():
            await self._abort("注册超时了，下次再试吧～")
            return

        text = data.get("text", "").strip()
        if not text:
            return

        if self._enroll_state == EnrollState.WAITING_NAME:
            await self._handle_waiting_name(text)
        elif self._enroll_state == EnrollState.WAITING_OWNER_CONFIRM:
            await self._handle_waiting_owner_confirm(text)

    # ══════════════════════════════════════════════
    #  State: WAITING_NAME
    # ══════════════════════════════════════════════

    async def _handle_waiting_name(self, raw_name: str) -> None:
        if len(raw_name) > 30:
            logger.info("Enrollment: rejected over-long text as name: \"%s\"", raw_name)
            await self._say_then_listen("名字太长了，请只告诉我名字就好，比如小明。")
            return

        name = self._parse_name(raw_name)

        # LLM cleanup happens in two cases:
        #   1. Regex found nothing.
        #   2. Regex returned something that still looks like a leaked
        #      pronoun / filler ("我小明", "是小明", "那就叫我小明" after a
        #      partial prefix strip, etc). Regex can't know that STT
        #      dropped the actual introducer word; LLM can see through it.
        _PRONOUN_PREFIX_CHARS = "我你他她是有那就"
        needs_llm = (
            not name
            or len(name) > 4
            or (name and name[0] in _PRONOUN_PREFIX_CHARS)
        )
        if needs_llm and self._llm is not None:
            logger.info(
                "Enrollment: regex gave %r, asking LLM to clean %r", name, raw_name)
            try:
                llm_name = await self._llm.extract_name(raw_name)
            except Exception as e:
                logger.debug("LLM extract_name failed: %s", e)
                llm_name = ""
            if llm_name and 1 <= len(llm_name) <= 10:
                if llm_name != name:
                    logger.info(
                        "Enrollment: LLM cleaned %r -> %r", name, llm_name)
                name = llm_name

        if not name or self._looks_unusable_name(name):
            await self._say_then_listen("抱歉没听清，你叫什么名字呀？")
            return

        self._enroll_name = name
        logger.info("Enrollment name resolved: \"%s\" -> \"%s\"", raw_name, name)
        await self._do_capture()

    def _parse_name(self, text: str) -> str:
        """Fast regex-based name extraction. Returns '' on failure."""
        text = text.strip()
        text = _NAME_FILLER_PREFIX.sub("", text)
        for punct in "。，、！？.,!?~":
            text = text.rstrip(punct)
        text = text.strip()
        lower = text.lower()

        stripped = text
        for prefix in _NAME_PREFIXES:
            if prefix.endswith(" "):
                if lower.startswith(prefix):
                    stripped = text[len(prefix):].strip()
                    break
            else:
                if text.startswith(prefix):
                    stripped = text[len(prefix):].strip()
                    break

        for suf in _NAME_SUFFIXES:
            while stripped.endswith(suf):
                stripped = stripped[: -len(suf)].strip()

        if 1 <= len(stripped) <= 10:
            return stripped
        return ""

    @staticmethod
    def _looks_unusable_name(name: str) -> bool:
        if not name:
            return True
        if len(name) > 10:
            return True
        if name.upper() == "NONE":
            return True
        return False

    # ══════════════════════════════════════════════
    #  State: CAPTURING
    # ══════════════════════════════════════════════

    async def _do_capture(self) -> None:
        name = self._enroll_name
        self._enter_state(EnrollState.CAPTURING)

        if not self._camera or not self._camera.can_enroll:
            await self._say(
                f"认识你很高兴{name}！"
                "人脸识别模型还没装好，暂时不能记住你的脸，"
                "但我记住你的名字啦！")
            self._state.update_person(name=name, is_owner=False)
            await self._finish_enrollment(success=True)
            return

        await self._say(f"{name}你好！请看着摄像头，我正在记住你的脸…")
        await self._bus.publish(Events.ACTION_REQUEST, {
            "type": "set_expression", "expression": "attentive", "priority": 1,
        })

        self._camera.pause()
        try:
            embeddings = await self._camera.capture_embeddings(
                num_samples=CAPTURE_SAMPLES, interval=CAPTURE_INTERVAL)
        finally:
            self._camera.resume()

        if not embeddings or not HAS_NUMPY:
            await self._say("嗯…没有看清你的脸，下次再试试吧～")
            await self._finish_enrollment(success=False)
            return

        avg_embedding = np.mean(embeddings, axis=0)
        norm = np.linalg.norm(avg_embedding)
        if norm > 0:
            avg_embedding = avg_embedding / norm

        self._face_db_path.mkdir(parents=True, exist_ok=True)
        save_path = self._face_db_path / f"{name}.npy"
        np.save(str(save_path), avg_embedding)
        logger.info("Face saved: %s (%d samples)", save_path, len(embeddings))

        self._camera.reload_face_db()

        # Move on to owner confirmation instead of finishing immediately.
        self._owner_retries = 0
        self._enter_state(EnrollState.WAITING_OWNER_CONFIRM)
        await self._say_then_listen(f"记住你啦{name}！嘿嘿，请问你是我的主人吗？")

    # ══════════════════════════════════════════════
    #  State: WAITING_OWNER_CONFIRM
    # ══════════════════════════════════════════════

    async def _handle_waiting_owner_confirm(self, text: str) -> None:
        verdict = self._parse_yes_no(text)
        if verdict == "UNCLEAR" and self._llm is not None:
            logger.info("Enrollment: regex Y/N unclear on \"%s\", asking LLM", text)
            verdict = await self._llm.judge_owner_confirm(text)

        logger.info("Enrollment: owner-confirm verdict=%s (reply=\"%s\")", verdict, text)

        if verdict == "YES":
            ok = self._persist_owner(self._enroll_name)
            if ok and self._camera is not None:
                try:
                    self._camera.reload_owner()
                except Exception:
                    logger.exception("reload_owner failed")
            await self._say(
                f"欢迎主人{self._enroll_name}！小云以后一眼就能认出你啦～")
            await self._bus.publish(Events.ACTION_REQUEST, {
                "type": "set_expression", "expression": "happy", "priority": 1,
            })
            await self._finish_enrollment(success=True)
            return

        if verdict == "NO":
            await self._say(
                f"好呀{self._enroll_name}！虽然你不是主人，"
                "不过以后见到我也要记得打招呼哦～")
            await self._bus.publish(Events.ACTION_REQUEST, {
                "type": "set_expression", "expression": "happy", "priority": 1,
            })
            await self._finish_enrollment(success=True)
            return

        # UNCLEAR
        if self._owner_retries >= MAX_CONFIRM_RETRIES:
            await self._say(
                "好吧，我暂时把你当成朋友，"
                "下次想让我叫你主人再跟我说哦～")
            await self._finish_enrollment(success=True)
            return
        self._owner_retries += 1
        await self._say_then_listen(
            "诶？我没听懂呢。你是我的主人吗？可以说是或者不是。")

    @staticmethod
    def _parse_yes_no(text: str) -> str:
        t = text.strip().strip("。，.,!?！？~ ").lower()
        if not t:
            return "UNCLEAR"
        if t in _YES_KEYWORDS:
            return "YES"
        if t in _NO_KEYWORDS:
            return "NO"
        # Partial start-with match for common polite answers
        if t.startswith(("是", "对", "嗯", "yes", "yeah", "yep")):
            return "YES"
        if t.startswith(("不", "no")):
            return "NO"
        return "UNCLEAR"

    def _persist_owner(self, name: str) -> bool:
        """Write OWNER.txt containing the owner name. Camera reads this at init."""
        try:
            self._face_db_path.mkdir(parents=True, exist_ok=True)
            owner_file = self._face_db_path / "OWNER.txt"
            owner_file.write_text(name.strip() + "\n", encoding="utf-8")
            logger.info("Owner persisted: %s -> %s", name, owner_file)
            return True
        except Exception:
            logger.exception("Failed to persist OWNER.txt")
            return False

    # ══════════════════════════════════════════════
    #  Common
    # ══════════════════════════════════════════════

    async def _finish_enrollment(self, success: bool) -> None:
        name = self._enroll_name
        self._enroll_state = EnrollState.IDLE
        self._enroll_name = ""
        self._owner_retries = 0
        self._state.update(enrollment_active=False, in_conversation=False)
        await self._bus.publish(Events.ENROLL_COMPLETE, {
            "success": success, "name": name,
        })
        logger.info("Enrollment finished: success=%s name=%s", success, name)

    async def _abort(self, message: str) -> None:
        logger.warning("Enrollment aborted: %s", message)
        await self._say(message)
        await self._bus.publish(Events.ACTION_REQUEST, {
            "type": "set_expression", "expression": "neutral", "priority": 1,
        })
        await self._finish_enrollment(success=False)

    async def _say(self, text: str) -> None:
        """Publish text to TTS and wait until TTS finishes playing."""
        await self._bus.publish(Events.LLM_RESPONSE, {
            "text": text, "source": "enrollment",
        })
        await asyncio.sleep(0.5)
        for _ in range(120):
            await asyncio.sleep(0.1)
            if not self._state.in_conversation:
                break

    async def _say_then_listen(self, text: str) -> None:
        """Say something, wait for TTS to finish + echo buffer, then start listening."""
        await self._say(text)
        await asyncio.sleep(1.0)
        self._state.update(is_awake=True, is_listening=True, in_conversation=True)
        logger.info("Enrollment: listening for user response...")

    def _enter_state(self, new_state: EnrollState) -> None:
        self._enroll_state = new_state
        self._state_entered_at = time.monotonic()

    def _is_timed_out(self) -> bool:
        return (time.monotonic() - self._state_entered_at) > ENROLL_TIMEOUT
