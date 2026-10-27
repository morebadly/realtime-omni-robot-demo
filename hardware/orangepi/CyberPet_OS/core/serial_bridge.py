"""
Orange Pi <-> ESP32 bidirectional serial bridge.

Protocol: one JSON object per line, terminated by '\\n'.

Connection strategy (in order, first hit wins):
  1. The port from config.yaml (works if user pinned a /dev/serial/by-id/...
     path, which is recommended).
  2. Auto-discovery: enumerate /dev/serial/by-id/*, /dev/ttyUSB*,
     /dev/ttyACM*, open each, write PING, sniff for any ESP32 cerebellum
     marker (PONG / HEARTBEAT / BOOT / SENSOR_DATA) within 2s.
  3. If none responds, log a giant red banner and KEEP RUNNING with all
     hardware commands logged as "[NO HW] dropped: ..." (rate-limited).
     A background reconnect attempt fires every 5s in receive_loop, so
     hot-plugging the ESP32 mid-session recovers automatically.

Simulation mode (`[SIM] TX -> ...`) is reserved STRICTLY for the case
where the pyserial library itself is missing. We never silently
fall back to SIM when the hardware is just unplugged -- doing that
hides real bugs (LLM looks fine, robot does nothing) for hours.
"""

import asyncio
import glob
import json
import logging
import os
import random
import time
from typing import Optional

try:
    import serial
    HAS_SERIAL = True
except Exception:
    HAS_SERIAL = False

from core.event_bus import EventBus, Events

logger = logging.getLogger(__name__)


# Any one of these substrings in a received line is enough to claim a port
# is the ESP32 cerebellum. Order doesn't matter:
#   - PONG          : reply to our handshake PING (best signal, comes within ~50ms)
#   - HEARTBEAT     : firmware emits every ~1s unconditionally
#   - BOOT          : sent once on power-up; useful when DTR-toggle on open
#                     accidentally resets the ESP32
#   - SENSOR_DATA   : reply to QUERY (not used in handshake but still proof)
_HANDSHAKE_MARKERS = (
    '"evt":"PONG"',
    '"evt":"HEARTBEAT"',
    '"evt":"BOOT"',
    '"evt":"SENSOR_DATA"',
)
_HANDSHAKE_TIMEOUT_S = 2.0
_RECONNECT_INTERVAL_S = 5.0
_NO_HW_WARN_INTERVAL_S = 2.0


class SerialBridge:
    def __init__(self, port: str, baud: int, event_bus: EventBus,
                 sim_events: bool = False):
        self._configured_port = port
        self._port = port
        self._baud = baud
        self._bus = event_bus
        self._ser: Optional["serial.Serial"] = None
        self._connected = False
        # Two distinct "no real hardware" modes -- DO NOT confuse:
        #   _sim_mode = True  : pyserial unavailable, every command logged
        #                       [SIM]; optional fake events on RX side.
        #   _connected = False, _sim_mode = False : hardware unreachable
        #                       RIGHT NOW. Commands logged [NO HW] (rate-limited),
        #                       background reconnect retries every 5s.
        self._sim_mode = not HAS_SERIAL
        self._sim_events = bool(sim_events)
        self._last_no_hw_warn = 0.0
        self._dropped_since_warn = 0
        self._last_reconnect_try = 0.0

    # ──────────────────────────────────────────────────────────────────
    #  Connection
    # ──────────────────────────────────────────────────────────────────

    async def connect(self) -> bool:
        """Try the configured port first; fall back to auto-discovery.

        Always returns True so main_brain can start its other subsystems.
        If no hardware is found we still return True but stay disconnected;
        receive_loop's background reconnect handles recovery."""
        if self._sim_mode:
            logger.warning("[SIM] Serial simulation mode (pyserial unavailable)")
            self._connected = True
            return True

        if await self._try_open(self._configured_port):
            return True

        logger.warning(
            "Configured port %s did not respond as ESP32. "
            "Starting auto-discovery (USB may have shifted to a different node)...",
            self._configured_port,
        )

        if await self._auto_discover():
            return True

        self._print_no_hardware_banner()
        return True

    async def _try_open(self, port: str) -> bool:
        """Open `port`, write PING, sniff for ESP32 marker.
        On success keeps self._ser open and sets self._connected = True."""
        if not port:
            return False
        if not os.path.exists(port):
            logger.debug("Skipping %s (does not exist)", port)
            return False

        try:
            ser = serial.Serial(port, self._baud, timeout=0.05, write_timeout=0.5)
        except Exception as e:
            logger.debug("Open %s failed: %s", port, e)
            return False

        ok = False
        try:
            # Brief settle: opening a CH340 can pulse DTR which resets the
            # ESP32; give the firmware a moment to come up before judging
            # silence as "wrong device". The BOOT marker also catches this.
            await asyncio.sleep(0.2)
            try:
                ser.reset_input_buffer()
            except Exception:
                pass
            try:
                ser.write(b'{"cmd":"PING"}\n')
            except Exception as e:
                logger.debug("Write PING to %s failed: %s", port, e)
                ser.close()
                return False
            ok = await self._sniff_for_marker(ser, _HANDSHAKE_TIMEOUT_S)
        except Exception as e:
            logger.debug("Probe %s raised: %s", port, e)

        if ok:
            self._ser = ser
            self._port = port
            self._connected = True
            if port == self._configured_port:
                logger.info("Serial connected: %s @ %d", port, self._baud)
            else:
                logger.warning(
                    "Serial connected via auto-discovery: %s @ %d "
                    "(configured was %s -- consider updating config.yaml)",
                    port, self._baud, self._configured_port,
                )
            return True

        try:
            ser.close()
        except Exception:
            pass
        return False

    @staticmethod
    async def _sniff_for_marker(ser, timeout_s: float) -> bool:
        """Read for up to timeout_s seconds; True if any line contains a
        known ESP32 event marker."""
        deadline = time.monotonic() + timeout_s
        buf = b""
        while time.monotonic() < deadline:
            try:
                chunk = ser.read(256)
            except Exception:
                return False
            if chunk:
                buf += chunk
                while b"\n" in buf:
                    line, buf = buf.split(b"\n", 1)
                    text = line.decode("utf-8", errors="ignore").strip()
                    if not text:
                        continue
                    if any(m in text for m in _HANDSHAKE_MARKERS):
                        return True
            await asyncio.sleep(0.02)
        return False

    async def _auto_discover(self) -> bool:
        """Probe every plausible USB-serial node until one talks like ESP32."""
        candidates = self._candidate_ports()
        seen = set()
        unique = []
        for p in candidates:
            try:
                real = os.path.realpath(p)
            except Exception:
                real = p
            if real in seen:
                continue
            seen.add(real)
            unique.append(p)

        if not unique:
            logger.error(
                "Auto-discovery: no USB-serial candidates under "
                "/dev/serial/by-id/, /dev/ttyUSB*, /dev/ttyACM*"
            )
            return False

        logger.info("Auto-discovery probing %d candidate(s): %s",
                    len(unique), ", ".join(unique))
        for port in unique:
            if port == self._configured_port:
                continue  # already tried in the caller path
            if await self._try_open(port):
                return True
        return False

    def _candidate_ports(self) -> list:
        cands: list = []
        cands.extend(sorted(glob.glob("/dev/serial/by-id/*")))
        cands.extend(sorted(glob.glob("/dev/ttyUSB*")))
        cands.extend(sorted(glob.glob("/dev/ttyACM*")))
        if self._configured_port and self._configured_port not in cands:
            cands.insert(0, self._configured_port)
        return cands

    def _print_no_hardware_banner(self) -> None:
        # Triple-printed in red so it cannot be missed when scrolling logs.
        red = "\033[31;1m"
        rst = "\033[0m"
        line = (
            "ESP32 NOT FOUND on any USB-serial port. "
            "Hardware commands will be DROPPED until reconnect."
        )
        for _ in range(3):
            logger.error("%s!!! %s !!!%s", red, line, rst)
        logger.error(
            "%sHint: check `ls /dev/ttyUSB* /dev/ttyACM*` and `dmesg | tail`. "
            "Receive loop will keep retrying every %.0fs.%s",
            red, rst, _RECONNECT_INTERVAL_S,
        )

    def _mark_disconnected(self) -> None:
        if self._ser is not None:
            try:
                self._ser.close()
            except Exception:
                pass
        self._ser = None
        self._connected = False

    # ──────────────────────────────────────────────────────────────────
    #  TX
    # ──────────────────────────────────────────────────────────────────

    def send_command(self, cmd: str, **params) -> None:
        msg = json.dumps({"cmd": cmd, **params}, separators=(",", ":"))

        if self._sim_mode:
            logger.info("[SIM] TX -> ESP32: %s", msg)
            return

        if not self._connected or self._ser is None:
            self._note_dropped(msg)
            return

        try:
            self._ser.write((msg + "\n").encode("utf-8"))
            # INFO so the operator can confirm at a glance that LLM actions
            # actually leave the Pi. If this floods the log, gate it behind a
            # config flag instead of demoting to debug -- silent success was
            # what hid the SIM-fallback bug for hours.
            logger.info("TX -> ESP32: %s", msg)
        except Exception as e:
            logger.error(
                "Serial write failed (%s): %s -- marking disconnected, "
                "background reconnect will retry", e, msg,
            )
            self._mark_disconnected()
            self._note_dropped(msg)

    def _note_dropped(self, msg: str) -> None:
        """Rate-limited 'no hardware, dropped command' warning so we don't
        flood the log when the LLM keeps emitting tags while ESP32 is down."""
        self._dropped_since_warn += 1
        now = time.monotonic()
        if now - self._last_no_hw_warn < _NO_HW_WARN_INTERVAL_S:
            return
        self._last_no_hw_warn = now
        logger.warning(
            "[NO HW] dropped %d command(s) since last warn; latest: %s",
            self._dropped_since_warn, msg[:120],
        )
        self._dropped_since_warn = 0

    def set_motor(self, left: int, right: int) -> None:
        self.send_command("SET_MOTOR", left=left, right=right)

    def set_servo(self, servo_id: int, angle: int) -> None:
        self.send_command("SET_SERVO", id=servo_id, angle=angle)

    def servo_sequence(self, seq_name: str) -> None:
        self.send_command("SERVO_SEQ", seq=seq_name)

    def stop_all(self) -> None:
        self.send_command("STOP_ALL")

    def resume_safety(self) -> None:
        """Clear ESP32-side safetyLockout latched by EDGE. Firmware will
        ignore the request unless the down IRs no longer report a cliff
        (see esp32_cerebellum.ino CMD_RESUME branch), which is the
        intended safety guarantee -- the host can ASK to resume but only
        the sensors decide whether it's actually safe."""
        self.send_command("RESUME")

    def set_expression(self, expr: str, priority: int = 3) -> None:
        """Tell ESP32 to render an eye expression on its locally-driven dual LCDs."""
        self.send_command("SET_EXPR", expr=expr, priority=priority)

    def set_reflex(self, sensor_id: int, expr: str) -> None:
        """Configure ESP32's local touch reflex mapping.
        expr = one of the 14 expression names, or 'off' to disable that
        sensor's local reflex entirely, or 'default' to reset to ESP32
        firmware defaults (id=0 -> bliss, id=1 -> curious)."""
        self.send_command("SET_REFLEX", id=sensor_id, expr=expr)

    # ──────────────────────────────────────────────────────────────────
    #  RX + background reconnect
    # ──────────────────────────────────────────────────────────────────

    async def receive_loop(self) -> None:
        if self._sim_mode:
            await self._sim_receive_loop()
            return

        logger.info("Serial receive loop started")
        while True:
            if not self._connected or self._ser is None:
                await self._maybe_reconnect()
                await asyncio.sleep(0.1)
                continue
            try:
                if self._ser.in_waiting:
                    raw = self._ser.readline()
                    if raw:
                        line = raw.decode("utf-8", errors="ignore").strip()
                        if line:
                            await self._dispatch(line)
            except Exception as e:
                logger.error("Serial read error: %s -- marking disconnected", e)
                self._mark_disconnected()
            await asyncio.sleep(0.005)

    async def _maybe_reconnect(self) -> None:
        now = time.monotonic()
        if now - self._last_reconnect_try < _RECONNECT_INTERVAL_S:
            return
        self._last_reconnect_try = now
        logger.info("Attempting serial reconnect...")
        if await self._try_open(self._configured_port):
            return
        # Probe every other candidate but suppress the per-attempt INFO line
        # to avoid flooding the log when ESP32 is unplugged for minutes.
        await self._auto_discover()

    async def _sim_receive_loop(self) -> None:
        if not self._sim_events:
            logger.info("[SIM] Serial sim-receive loop started (quiet, no fake events). "
                        "Set serial.sim_events=true in config to enable.")
            while True:
                await asyncio.sleep(60.0)
            return

        logger.info("[SIM] Serial sim-receive loop started (periodic fake events)")
        cycle = 0
        while True:
            await asyncio.sleep(6.0 + random.uniform(-1, 1))
            cycle += 1

            if cycle % 3 == 0:
                sid = random.choice([0, 1])
                logger.info("[SIM] ESP32 reports: touch sensor %d triggered", sid)
                await self._bus.publish(Events.TOUCH_EVENT, {"evt": "TOUCH", "id": sid, "state": 1})
                await asyncio.sleep(random.uniform(0.8, 2.5))
                await self._bus.publish(Events.TOUCH_EVENT, {"evt": "TOUCH", "id": sid, "state": 0})

            if cycle % 5 == 0:
                dist = random.randint(5, 30)
                logger.info("[SIM] ESP32 reports: ultrasonic distance %dcm", dist)
                await self._bus.publish(Events.OBSTACLE_DETECTED, {"evt": "OBSTACLE", "dist_cm": dist})

            if cycle % 8 == 0:
                sensors = [random.choice([0, 1]) for _ in range(5)]
                logger.info("[SIM] ESP32 reports: line-track sensors %s", sensors)
                await self._bus.publish(Events.EDGE_ALERT, {"evt": "EDGE", "sensors": sensors})

    async def _dispatch(self, line: str) -> None:
        try:
            data = json.loads(line)
        except json.JSONDecodeError:
            return
        evt = data.get("evt")
        event_map = {
            "TOUCH":    Events.TOUCH_EVENT,
            "EDGE":     Events.EDGE_ALERT,
            "OBSTACLE": Events.OBSTACLE_DETECTED,
            "BUMP":     Events.BUMP_DETECTED,
        }
        event_type = event_map.get(evt)
        if event_type:
            await self._bus.publish(event_type, data)

    async def close(self) -> None:
        self._connected = False
        if self._ser is not None and hasattr(self._ser, "is_open") and self._ser.is_open:
            self._ser.close()
        logger.info("Serial closed")
