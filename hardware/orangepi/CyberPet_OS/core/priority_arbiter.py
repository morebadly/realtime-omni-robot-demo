"""
Action priority arbiter -- ensures high-priority actions can preempt lower ones.

Priority (lower number = higher priority):
  SAFETY(0)      -> edge detection, obstacle emergency stop
  INTERACTION(1) -> approach, head tilt, nod
  IDLE(2)        -> random wandering, looking around
"""

import asyncio
import logging
import time
from enum import IntEnum

logger = logging.getLogger(__name__)


class Priority(IntEnum):
    SAFETY = 0
    INTERACTION = 1
    IDLE = 2


class PriorityArbiter:
    def __init__(self, timeout: float = 5.0):
        self._current_priority: Priority = Priority.IDLE
        self._lock = asyncio.Lock()
        self._owner: str = ""
        self._acquire_time: float = 0.0
        self._timeout = timeout

    async def request(self, priority: Priority, owner: str = "") -> bool:
        async with self._lock:
            now = time.monotonic()
            timed_out = (now - self._acquire_time) > self._timeout
            if priority <= self._current_priority or timed_out:
                if timed_out and self._owner:
                    logger.warning("Control timeout reclaimed from: %s", self._owner)
                self._current_priority = priority
                self._owner = owner
                self._acquire_time = now
                logger.debug("Control granted: %s (priority=%s)", owner, priority.name)
                return True
            logger.debug("Control denied: %s(p=%s) blocked by %s(p=%s)",
                         owner, priority.name, self._owner, self._current_priority.name)
            return False

    async def release(self, priority: Priority) -> None:
        async with self._lock:
            if self._current_priority == priority:
                logger.debug("Control released: %s", self._owner)
                self._current_priority = Priority.IDLE
                self._owner = ""

    @property
    def current_priority(self) -> Priority:
        return self._current_priority

    @property
    def current_owner(self) -> str:
        return self._owner
