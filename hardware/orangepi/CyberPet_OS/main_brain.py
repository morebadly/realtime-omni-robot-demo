"""
CyberPet OS - Main Entry Point

Launches all subsystems as concurrent asyncio tasks.
Modules communicate via EventBus and share state via SharedState.

Every subsystem init and loop is individually guarded with try/except.
A single module crash will NEVER bring down the whole system.
"""

import asyncio
import logging
import sys
import traceback
from pathlib import Path

import yaml

from core.event_bus import EventBus, Events
from core.shared_state import SharedState
from core.serial_bridge import SerialBridge
from core.priority_arbiter import PriorityArbiter

from perception.camera_vision import CameraVision
from perception.audio_input import AudioInput
from perception.touch_handler import TouchHandler

from cognition.llm_agent import LLMAgent
from cognition.behavior_engine import BehaviorEngine
from cognition.memory_store import MemoryStore
from cognition.gateway_openclaw import GatewayOpenClaw
from cognition.enrollment_service import EnrollmentService
from cognition.dialog_manager import DialogManager
from cognition.fatigue_sensor import FatigueSensor

from expression.eye_display import EyeDisplay
from expression.tts_speaker import TTSSpeaker
from expression.motion_command import MotionCommand


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(name)-28s | %(levelname)-5s | %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("main_brain")


def load_config(path: str = "config.yaml") -> dict:
    config_path = Path(path)
    if not config_path.exists():
        logger.error("Config file not found: %s", path)
        sys.exit(1)
    with open(config_path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


async def _guarded_loop(name: str, coro) -> None:
    """Run a subsystem loop forever. If it crashes, log and exit quietly."""
    try:
        await coro
    except asyncio.CancelledError:
        logger.info("[STOP] %s cancelled", name)
    except Exception:
        logger.error("[CRASH] %s died -- other subsystems keep running\n%s",
                     name, traceback.format_exc())


async def _safe_close(name: str, obj, method: str = "close") -> None:
    """Call obj.close() without ever raising."""
    fn = getattr(obj, method, None)
    if fn is None:
        return
    try:
        result = fn()
        if asyncio.iscoroutine(result):
            await result
    except Exception:
        logger.warning("[CLOSE] %s.%s() failed: %s", name, method, traceback.format_exc())


async def main():
    config = load_config()

    print("")
    print("==================================================")
    print("          CyberPet OS  v0.1")
    print("          Starting all subsystems...")
    print("==================================================")
    print("")

    # -- 1. Core infrastructure (must succeed) --
    logger.info("Initializing core infrastructure...")
    bus = EventBus()
    state = SharedState()
    arbiter = PriorityArbiter()

    serial_cfg = config.get("serial", {})
    bridge = SerialBridge(
        port=serial_cfg.get("port", "/dev/ttyUSB0"),
        baud=serial_cfg.get("baud_rate", 115200),
        event_bus=bus,
        sim_events=bool(serial_cfg.get("sim_events", False)),
    )
    try:
        await bridge.connect()
    except Exception as e:
        logger.error("SerialBridge connect failed (sim mode): %s", e)

    # -- 2. Perception layer --
    logger.info("Initializing perception layer...")
    camera = None
    try:
        camera = CameraVision(bus, state, config)
    except Exception as e:
        logger.error("[INIT] CameraVision failed: %s", e)

    audio = None
    try:
        audio = AudioInput(bus, state, config)
    except Exception as e:
        logger.error("[INIT] AudioInput failed: %s", e)

    touch = None
    try:
        touch = TouchHandler(bus, state, config)
    except Exception as e:
        logger.error("[INIT] TouchHandler failed: %s", e)

    # -- 3. Cognition layer --
    logger.info("Initializing cognition layer...")
    memory = None
    try:
        memory = MemoryStore(config)
        await memory.initialize()
    except Exception as e:
        logger.error("[INIT] MemoryStore failed: %s", e)
        memory = None

    gateway = None
    try:
        gateway = GatewayOpenClaw(config)
        await gateway.connect()
    except Exception as e:
        logger.error("[INIT] GatewayOpenClaw failed: %s", e)
        gateway = None

    llm = None
    try:
        llm = LLMAgent(bus, state, config, memory_store=memory, gateway=gateway)
    except Exception as e:
        logger.error("[INIT] LLMAgent failed: %s", e)

    behavior = None
    try:
        behavior = BehaviorEngine(
            event_bus=bus, shared_state=state,
            serial_bridge=bridge, arbiter=arbiter, config=config,
        )
    except Exception as e:
        logger.error("[INIT] BehaviorEngine failed: %s", e)

    enrollment = None
    try:
        enrollment = EnrollmentService(
            bus, state, config, camera_vision=camera, llm_agent=llm)
    except Exception as e:
        logger.error("[INIT] EnrollmentService failed: %s", e)

    dialog_mgr = None
    try:
        dialog_mgr = DialogManager(bus, state, serial_bridge=bridge, config=config)
    except Exception as e:
        logger.error("[INIT] DialogManager failed: %s", e)

    fatigue = None
    try:
        fatigue = FatigueSensor(bus, state, config)
    except Exception as e:
        logger.error("[INIT] FatigueSensor failed: %s", e)

    # -- 4. Expression layer --
    logger.info("Initializing expression layer...")
    eyes = None
    try:
        eyes = EyeDisplay(bus, config, serial_bridge=bridge, shared_state=state)
    except Exception as e:
        logger.error("[INIT] EyeDisplay failed: %s", e)

    tts = None
    try:
        tts = TTSSpeaker(bus, config, shared_state=state)
    except Exception as e:
        logger.error("[INIT] TTSSpeaker failed: %s", e)

    motion = None
    try:
        motion = MotionCommand(bridge, arbiter)
    except Exception as e:
        logger.error("[INIT] MotionCommand failed: %s", e)

    # -- 5. Shutdown handler --
    shutdown_triggered = False

    async def shutdown():
        nonlocal shutdown_triggered
        if shutdown_triggered:
            return
        shutdown_triggered = True
        print("")
        logger.info("Shutting down all subsystems...")
        state.is_running = False
        try:
            await bus.publish(Events.SYSTEM_SHUTDOWN, {})
            await bus.drain()
        except Exception:
            pass
        try:
            bridge.stop_all()
        except Exception:
            pass
        await _safe_close("camera",  camera)
        await _safe_close("audio",   audio)
        await _safe_close("eyes",    eyes)
        await _safe_close("tts",     tts)
        await _safe_close("gateway", gateway)
        await _safe_close("bridge",  bridge)
        logger.info("CyberPet OS shutdown complete. Bye!")

    # -- 6. Build task list (skip modules that failed init) --
    tasks = []
    tasks.append(("SerialBridge",    bridge.receive_loop()))
    if camera:
        tasks.append(("CameraVision",   camera.perception_loop()))
    if audio:
        tasks.append(("AudioInput",     audio.listen_loop()))
    if eyes:
        tasks.append(("EyeDisplay",     eyes.render_loop()))
    if tts:
        # The dispatcher pulls new TTS items off the upstream queue and
        # kicks off MiniMax fetches IN PARALLEL with whatever speak_loop is
        # currently playing. Without it, a multi-sentence reply would play
        # seg1 → wait 1.2s for seg2's first byte → play seg2 → ... (serial
        # HTTP round-trips audible as "stutter"). With both tasks running,
        # seg2's bytes land while seg1 is still playing, so seg2 starts
        # immediately when seg1 ends.
        tasks.append(("TTSPrefetch",    tts.prefetch_dispatcher_loop()))
        tasks.append(("TTSSpeaker",     tts.speak_loop()))
    if behavior:
        tasks.append(("BehaviorEngine", behavior.idle_behavior_loop()))
    if llm:
        tasks.append(("LLMProactiveLoop", llm.proactive_loop()))
    if dialog_mgr:
        tasks.append(("DialogManager", dialog_mgr.run_loop()))
    if fatigue:
        tasks.append(("FatigueSensor", fatigue.run_loop()))

    alive = len(tasks)
    logger.info("--------------------------------------------------")
    logger.info("[OK] %d/%d subsystems ready, starting main loop!", alive, 9)
    logger.info("     Press Ctrl+C to shutdown gracefully")
    logger.info("--------------------------------------------------")

    # -- 7. Launch with per-task crash guard --
    try:
        await asyncio.gather(*[_guarded_loop(name, coro) for name, coro in tasks])
    except (asyncio.CancelledError, KeyboardInterrupt):
        pass
    finally:
        await shutdown()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n[Ctrl+C] Stopped.")
