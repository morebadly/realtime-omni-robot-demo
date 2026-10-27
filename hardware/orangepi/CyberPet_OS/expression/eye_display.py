"""
Eye display (thin proxy).

Rendering is offloaded to ESP32 (TFT_eSPI + DMA on two ST7789 LCDs).
This module only:
  * receives ACTION_REQUEST(type=set_expression, ...) from behavior/LLM
  * enforces expression priority + min-hold semantics
  * forwards the current expression to ESP32 via SerialBridge (SET_EXPR)

ESP32-side protocol:
    {"cmd": "SET_EXPR", "expr": "<name>", "priority": <0-3>}

Changing the expression too often wastes serial bandwidth, so we only
TX when the target name changes (ESP32 holds the previous frame/animation
locally until a new name arrives).
"""

import asyncio
import logging
import time
from typing import Optional

from core.event_bus import EventBus, Events

logger = logging.getLogger(__name__)

EXPR_PRIORITY = {
    "scared": 0,
    "attentive": 1,
    "happy": 2, "sad": 2, "sympathy": 2, "surprise": 2,
    "worried": 2, "bliss": 2, "angry": 2, "confused": 2, "curious": 2,
    "neutral": 3, "sleepy": 3, "blink": 3,
}
EXPR_HOLD_TIME = {0: 1.5, 1: 1.0, 2: 0.5, 3: 0.0}

EXPRESSION_TAG = {
    "neutral":   "[--]", "happy":     "[:)]", "sad":       "[:(]",
    "angry":     "[>:(]", "surprise": "[O_O]", "sympathy":  "[;(]",
    "worried":   "[._.]", "confused": "[?_?]", "curious":   "[?.?]", "bliss":     "[^w^]",
    "scared":    "[!!!]", "attentive":"[o_o]", "sleepy":    "[-_-]",
    "blink":     "[___]",
}


class EyeDisplay:
    def __init__(self, event_bus: EventBus, config: dict,
                 serial_bridge=None, shared_state=None):
        self._bus = event_bus
        self._cfg = config.get("eye_display", {})
        self._bridge = serial_bridge
        self._shared_state = shared_state

        self._current_expression = "neutral"
        self._expr_priority = 3
        self._expr_set_time = 0.0
        self._last_sent_expression: Optional[str] = None

        self._sim_mode = serial_bridge is None

        self._bus.subscribe(Events.ACTION_REQUEST, self._on_action_request)

    async def initialize(self) -> None:
        if self._sim_mode:
            logger.warning("[SIM] EyeDisplay: no SerialBridge, expressions will be logged only")
            return
        logger.info("EyeDisplay ready: expressions forwarded to ESP32 via SerialBridge")
        self._send_to_esp32(self._current_expression, self._expr_priority)

    def _is_running(self) -> bool:
        if self._shared_state is not None:
            return self._shared_state.is_running
        return True

    async def _on_action_request(self, data: dict) -> None:
        if data.get("type") != "set_expression":
            return
        expression = data.get("expression", "neutral")
        priority = data.get("priority", EXPR_PRIORITY.get(expression, 3))
        await self.set_expression(expression, priority)

    async def set_expression(self, expression: str, priority: int = 3) -> None:
        now = time.monotonic()
        hold = EXPR_HOLD_TIME.get(self._expr_priority, 0.0)
        if priority > self._expr_priority and (now - self._expr_set_time) < hold:
            logger.debug("Expression %s (p=%d) rejected: %s (p=%d) still held",
                         expression, priority, self._current_expression, self._expr_priority)
            return

        if expression == self._current_expression and priority == self._expr_priority:
            return

        old_tag = EXPRESSION_TAG.get(self._current_expression, "[??]")
        new_tag = EXPRESSION_TAG.get(expression, "[??]")
        logger.info("Expression: %s %s -> %s %s (p=%d)",
                    old_tag, self._current_expression, new_tag, expression, priority)

        self._current_expression = expression
        self._expr_priority = priority
        self._expr_set_time = now

        self._send_to_esp32(expression, priority)

    def _send_to_esp32(self, expression: str, priority: int) -> None:
        if expression == self._last_sent_expression:
            return
        self._last_sent_expression = expression

        if self._sim_mode or self._bridge is None:
            logger.info("[SIM] SET_EXPR -> %s (p=%d)", expression, priority)
            return
        try:
            self._bridge.set_expression(expression, priority)
        except Exception:
            logger.exception("Failed to forward expression to ESP32")

    async def render_loop(self) -> None:
        """Kept for API compatibility with main_brain's task list.

        We don't need a real render loop: ESP32 owns the pixel pipeline.
        This coroutine just idles until shutdown so the task gather stays alive.
        """
        await self.initialize()
        while self._is_running():
            await asyncio.sleep(1.0)

    async def close(self) -> None:
        logger.info("Eye display closed")
