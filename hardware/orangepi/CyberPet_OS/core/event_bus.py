"""
Async event bus -- all modules communicate via publish/subscribe, zero direct deps.

CRITICAL DESIGN: publish() is FIRE-AND-FORGET.
  - Callbacks are dispatched as independent asyncio Tasks.
  - Publisher returns IMMEDIATELY, never blocks waiting for subscribers.
  - Task references held in _background_tasks set to prevent GC.
  - This prevents the deadlock scenario where:
      camera.publish(EMOTION) -> behavior.on_emotion() sleeps 2s -> camera blocked 2s
"""

import asyncio
import logging
from collections import defaultdict
from typing import Any, Callable, Coroutine

logger = logging.getLogger(__name__)


class Events:
    EMOTION_DETECTED = "emotion_detected"
    PERSON_IDENTIFIED = "person_identified"
    PERSON_LOST = "person_lost"
    SPEECH_TEXT = "speech_text"
    WAKE_WORD = "wake_word"
    TOUCH_EVENT = "touch_event"
    EDGE_ALERT = "edge_alert"
    OBSTACLE_DETECTED = "obstacle_detected"
    BUMP_DETECTED = "bump_detected"
    LLM_RESPONSE = "llm_response"
    ACTION_REQUEST = "action_request"
    OWNER_ARRIVED = "owner_arrived"
    OWNER_LEFT = "owner_left"
    ENROLL_START = "enroll_start"
    ENROLL_COMPLETE = "enroll_complete"
    SPEECH_PARTIAL = "speech_partial"
    SYSTEM_SHUTDOWN = "system_shutdown"


class EventBus:
    def __init__(self):
        self._subscribers: dict[str, list[Callable]] = defaultdict(list)
        self._background_tasks: set[asyncio.Task] = set()

    def subscribe(self, event_type: str, callback: Callable) -> None:
        self._subscribers[event_type].append(callback)
        logger.debug("Subscribe %s -> %s", event_type, callback.__qualname__)

    def unsubscribe(self, event_type: str, callback: Callable) -> None:
        try:
            self._subscribers[event_type].remove(callback)
        except ValueError:
            pass

    async def publish(self, event_type: str, data: Any = None) -> None:
        """
        Fire-and-forget event dispatch.
        Each subscriber callback is launched as an independent Task.
        Publisher returns immediately -- NEVER blocks on subscriber execution.
        """
        subscribers = self._subscribers.get(event_type, [])
        if not subscribers:
            return

        logger.debug("Publish %s (%d subscribers)", event_type, len(subscribers))

        for cb in subscribers:
            if asyncio.iscoroutinefunction(cb):
                task = asyncio.create_task(self._safe_async(cb, data))
            else:
                loop = asyncio.get_running_loop()
                task = asyncio.ensure_future(
                    loop.run_in_executor(None, self._safe_sync, cb, data)
                )
            self._background_tasks.add(task)
            task.add_done_callback(self._background_tasks.discard)

    def publish_threadsafe(self, event_type: str, data: Any, loop: asyncio.AbstractEventLoop) -> None:
        """
        Thread-safe publish -- call this from background threads (audio callback, cv thread).
        Schedules publish() onto the main event loop without blocking the calling thread.
        """
        asyncio.run_coroutine_threadsafe(self.publish(event_type, data), loop)

    async def _safe_async(self, cb: Callable[..., Coroutine], data: Any) -> None:
        try:
            await cb(data)
        except Exception:
            logger.exception("Event callback error: %s", cb.__qualname__)

    def _safe_sync(self, cb: Callable, data: Any) -> None:
        try:
            cb(data)
        except Exception:
            logger.exception("Event callback error: %s", cb.__qualname__)

    async def drain(self) -> None:
        """Wait for all in-flight callbacks to complete (for graceful shutdown)."""
        if self._background_tasks:
            await asyncio.gather(*self._background_tasks, return_exceptions=True)
