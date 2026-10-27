"""
运动指令封装模块 — 将高层运动意图转为串口指令发送给 ESP32。

本模块不直接依赖硬件库，通过 serial_bridge 间接通信。
"""

import asyncio
import logging

from core.serial_bridge import SerialBridge
from core.priority_arbiter import PriorityArbiter, Priority

logger = logging.getLogger(__name__)


class MotionCommand:
    def __init__(self, serial_bridge: SerialBridge, arbiter: PriorityArbiter):
        self._bridge = serial_bridge
        self._arbiter = arbiter

    async def move_forward(self, speed: int = 80, duration: float = 1.0) -> bool:
        if not await self._arbiter.request(Priority.INTERACTION, "move_forward"):
            return False
        self._bridge.set_motor(speed, speed)
        await asyncio.sleep(duration)
        self._bridge.set_motor(0, 0)
        await self._arbiter.release(Priority.INTERACTION)
        return True

    async def move_backward(self, speed: int = 80, duration: float = 0.5) -> bool:
        if not await self._arbiter.request(Priority.INTERACTION, "move_backward"):
            return False
        self._bridge.set_motor(-speed, -speed)
        await asyncio.sleep(duration)
        self._bridge.set_motor(0, 0)
        await self._arbiter.release(Priority.INTERACTION)
        return True

    async def turn_left(self, speed: int = 60, duration: float = 0.5) -> bool:
        if not await self._arbiter.request(Priority.INTERACTION, "turn_left"):
            return False
        self._bridge.set_motor(-speed, speed)
        await asyncio.sleep(duration)
        self._bridge.set_motor(0, 0)
        await self._arbiter.release(Priority.INTERACTION)
        return True

    async def turn_right(self, speed: int = 60, duration: float = 0.5) -> bool:
        if not await self._arbiter.request(Priority.INTERACTION, "turn_right"):
            return False
        self._bridge.set_motor(speed, -speed)
        await asyncio.sleep(duration)
        self._bridge.set_motor(0, 0)
        await self._arbiter.release(Priority.INTERACTION)
        return True

    async def stop(self) -> None:
        self._bridge.set_motor(0, 0)

    async def nod(self) -> bool:
        if not await self._arbiter.request(Priority.INTERACTION, "nod"):
            return False
        self._bridge.servo_sequence("nod")
        await asyncio.sleep(1.0)
        await self._arbiter.release(Priority.INTERACTION)
        return True

    async def shake_head(self) -> bool:
        if not await self._arbiter.request(Priority.INTERACTION, "shake"):
            return False
        self._bridge.servo_sequence("shake")
        await asyncio.sleep(1.2)
        await self._arbiter.release(Priority.INTERACTION)
        return True

    async def tilt_head(self) -> bool:
        if not await self._arbiter.request(Priority.INTERACTION, "tilt"):
            return False
        self._bridge.servo_sequence("tilt_head")
        await asyncio.sleep(1.0)
        await self._arbiter.release(Priority.INTERACTION)
        return True

    async def look_at(self, pan_angle: int = 90, tilt_angle: int = 90) -> None:
        self._bridge.set_servo(0, max(0, min(180, pan_angle)))
        self._bridge.set_servo(1, max(0, min(180, tilt_angle)))

    async def center_head(self) -> None:
        self._bridge.set_servo(0, 90)
        self._bridge.set_servo(1, 90)
