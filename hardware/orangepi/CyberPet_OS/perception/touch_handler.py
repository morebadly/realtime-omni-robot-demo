"""
Touch perception handler -- receives TTP223 touch events from ESP32 via serial bridge.
No direct hardware access; data comes from event bus.
"""

import asyncio
import logging
import time

from core.event_bus import EventBus, Events
from core.shared_state import SharedState

logger = logging.getLogger(__name__)


class TouchHandler:
    def __init__(self, event_bus: EventBus, shared_state: SharedState, config: dict):
        self._bus = event_bus
        self._state = shared_state
        self._cfg = config.get("sensors", {})
        self._debounce_ms = self._cfg.get("touch_debounce_ms", 200)

        self._touch_states: dict[int, bool] = {0: False, 1: False}
        self._touch_start: dict[int, float] = {0: 0.0, 1: 0.0}
        self._last_event_time: dict[int, float] = {0: 0.0, 1: 0.0}

        self._bus.subscribe(Events.TOUCH_EVENT, self.on_touch_raw)

    async def on_touch_raw(self, data: dict) -> None:
        sensor_id = data.get("id", 0)
        touch_state = bool(data.get("state", 0))
        now = time.monotonic()

        if "action" in data:
            return

        if (now - self._last_event_time.get(sensor_id, 0)) * 1000 < self._debounce_ms:
            return
        self._last_event_time[sensor_id] = now

        prev_state = self._touch_states.get(sensor_id, False)
        self._touch_states[sensor_id] = touch_state

        if touch_state and not prev_state:
            self._touch_start[sensor_id] = now
            self._state.update(is_being_touched=True, touch_sensor_id=sensor_id)
            logger.info("Touch START: sensor=%d", sensor_id)
        elif not touch_state and prev_state:
            duration = now - self._touch_start.get(sensor_id, now)
            self._state.update(is_being_touched=False, touch_sensor_id=-1)

            if duration > 1.0:
                action = "pet"
                logger.info("Touch PET: sensor=%d (%.1fs)", sensor_id, duration)
            else:
                action = "tap"
                logger.info("Touch TAP: sensor=%d (%.1fs)", sensor_id, duration)

            await self._bus.publish(Events.TOUCH_EVENT, {
                "id": sensor_id, "action": action, "duration": duration,
            })
