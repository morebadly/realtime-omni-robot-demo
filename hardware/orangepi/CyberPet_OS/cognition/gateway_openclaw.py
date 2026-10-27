"""
OpenClaw gateway -- HTTP connection to OpenClaw service for PC control.
Simulation mode: logs all actions when aiohttp is unavailable.
"""

import asyncio
import logging

try:
    import aiohttp
    HAS_AIOHTTP = True
except Exception:
    HAS_AIOHTTP = False

logger = logging.getLogger(__name__)


class GatewayOpenClaw:
    def __init__(self, config: dict):
        self._cfg = config.get("gateway", {})
        self._base_url = self._cfg.get("openclaw_url", "http://localhost:8080")
        self._enabled = self._cfg.get("enabled", True)
        self._sim_mode = not HAS_AIOHTTP
        self._session = None

    async def connect(self) -> bool:
        if not self._enabled:
            logger.info("OpenClaw gateway disabled")
            return False
        if self._sim_mode:
            logger.warning("[SIM] OpenClaw gateway simulation mode (aiohttp unavailable)")
            return True
        try:
            self._session = aiohttp.ClientSession()
            async with self._session.get(f"{self._base_url}/health") as resp:
                if resp.status == 200:
                    logger.info("OpenClaw gateway connected: %s", self._base_url)
                    return True
        except Exception as e:
            logger.warning("OpenClaw connect failed, falling back to simulation: %s", e)
            self._sim_mode = True
        return True

    async def send_email(self, to: str, subject: str, body: str) -> bool:
        logger.info("OpenClaw send_email -> to=%s, subject=%s", to, subject)
        if self._sim_mode:
            logger.info("[SIM] Email \"sent\" OK")
            return True
        return await self._execute_action("send_email", {"to": to, "subject": subject, "body": body})

    async def open_application(self, app_name: str) -> bool:
        logger.info("OpenClaw open_app -> %s", app_name)
        if self._sim_mode:
            logger.info("[SIM] App \"opened\" OK")
            return True
        return await self._execute_action("open_app", {"app_name": app_name})

    async def _execute_action(self, action: str, params: dict) -> bool:
        if not self._session:
            return False
        try:
            async with self._session.post(f"{self._base_url}/api/action", json={"action": action, "params": params}, timeout=aiohttp.ClientTimeout(total=30)) as resp:
                return resp.status == 200
        except Exception as e:
            logger.error("OpenClaw request error: %s", e)
            return False

    async def close(self) -> None:
        if self._session:
            await self._session.close()
        logger.info("OpenClaw gateway closed")
