"""
Dialog state manager -- bridges in_conversation transitions into
ESP32 reflex config.

Responsibilities:
  * dialog_start: fired when in_conversation flips False -> True
      -> SET_REFLEX id=0 expr=off
      -> SET_REFLEX id=1 expr=off
    (locks out touch reflexes so they don't overrule LLM-chosen expressions)

  * dialog_end: fired when in_conversation flips True -> False
      -> SET_REFLEX id=0 expr=default
      -> SET_REFLEX id=1 expr=default
    (restores ESP32's built-in default reflex mapping)

We detect transitions by polling SharedState at a short interval. The two
legitimate setters of in_conversation are:
  - AudioInput (wake word): sets True
  - TTSSpeaker (queue drained / barge-in): sets False
Neither of them should have to know about reflex logic — DialogManager
centralizes it here.

DialogManager also listens to EMOTION_DETECTED and uses consecutive non-owner
detections to flip the reflex to 'scared' for stranger interactions.
"""

import asyncio
import logging

from core.event_bus import EventBus, Events
from core.shared_state import SharedState

logger = logging.getLogger(__name__)


class DialogManager:
    def __init__(self, event_bus: EventBus, shared_state: SharedState,
                 serial_bridge, config: dict):
        self._bus = event_bus
        self._state = shared_state
        self._bridge = serial_bridge
        beh_cfg = config.get("behavior", {}) or {}
        self._stranger_streak_threshold = int(
            beh_cfg.get("stranger_reflex_streak", 4))

        self._last_in_conversation = False
        self._stranger_streak = 0
        self._stranger_reflex_on = False

        self._bus.subscribe(Events.EMOTION_DETECTED, self._on_emotion)
        self._bus.subscribe(Events.PERSON_LOST, self._on_person_lost)

    async def run_loop(self) -> None:
        logger.info("Dialog manager loop started")
        while self._state.is_running:
            try:
                self._check_conversation_transition()
            except Exception:
                logger.exception("DialogManager transition check failed")
            await asyncio.sleep(0.1)

    def _check_conversation_transition(self) -> None:
        in_conv = self._state.in_conversation
        if in_conv == self._last_in_conversation:
            return
        self._last_in_conversation = in_conv
        if in_conv:
            self._dialog_start()
        else:
            self._dialog_end()

    def _dialog_start(self) -> None:
        logger.info("Dialog START -> disable touch reflexes")
        self._send_reflex(0, "off")
        self._send_reflex(1, "off")

    def _dialog_end(self) -> None:
        logger.info("Dialog END -> restore default reflexes")
        # If a stranger is still around, keep the scared reflex; otherwise reset.
        if self._stranger_reflex_on:
            self._send_reflex(0, "scared")
            self._send_reflex(1, "scared")
        else:
            self._send_reflex(0, "default")
            self._send_reflex(1, "default")

    # ══════════════════════════════════════════════
    #  Stranger detection
    # ══════════════════════════════════════════════

    async def _on_emotion(self, data: dict) -> None:
        is_owner = bool(data.get("is_owner", False))
        name = data.get("person_name", "unknown")

        if is_owner:
            self._stranger_streak = 0
            if self._stranger_reflex_on:
                self._stranger_reflex_on = False
                logger.info("Owner returned -> restore default reflexes")
                if not self._state.in_conversation:
                    self._send_reflex(0, "default")
                    self._send_reflex(1, "default")
            return

        # Non-owner face seen.
        self._stranger_streak += 1
        if (self._stranger_streak >= self._stranger_streak_threshold
                and not self._stranger_reflex_on):
            self._stranger_reflex_on = True
            logger.info("Stranger '%s' persistent (%d frames) -> scared reflex",
                        name, self._stranger_streak)
            if not self._state.in_conversation:
                self._send_reflex(0, "scared")
                self._send_reflex(1, "scared")

    async def _on_person_lost(self, _data: dict) -> None:
        self._stranger_streak = 0
        if self._stranger_reflex_on:
            self._stranger_reflex_on = False
            logger.info("Person left -> restore default reflexes")
            if not self._state.in_conversation:
                self._send_reflex(0, "default")
                self._send_reflex(1, "default")

    # ══════════════════════════════════════════════
    #  Bridge helper
    # ══════════════════════════════════════════════

    def _send_reflex(self, sensor_id: int, expr: str) -> None:
        if self._bridge is None:
            return
        try:
            self._bridge.set_reflex(sensor_id, expr)
        except Exception:
            logger.exception("set_reflex dispatch failed")
