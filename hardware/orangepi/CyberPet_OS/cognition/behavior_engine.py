"""
Behavior decision engine -- owner-aware emotional intelligence center.

LLM-central architecture:
  - Ambient non-safety events (emotion, owner_arrived, owner_left) ONLY
    write pending tags to SharedState. LLMAgent's proactive_loop picks
    them up and decides output.
  - SAFETY events (edge, obstacle) execute IMMEDIATELY and are NEVER blocked.
  - During enrollment OR an active dialog, ambient handlers are silenced
    via _is_blocked(). Letting them keep tagging produced the "robot says
    one extra unrelated line right after the conversation ends" symptom
    (输出混乱) -- proactive_loop would consume the pile of tags within a
    couple of seconds of dialog END.
  - Touch is special: on_touch uses the looser _is_touch_blocked() and
    keeps tagging during dialog. on_speech consumes the pending touch
    context via _capture_pending_touch_for_voice() and folds it into THIS
    turn's user message, so it never produces a stand-alone proactive turn.
  - idle_behavior_loop uses _action_lock + _cancel_event for safe preemption,
    and inherits the dialog-aware gate from _is_blocked().

_cancel_event protocol (REVISED 2026-04-26):
  - This is now strictly a SAFETY-preempt signal.
  - Only on_edge_alert and on_obstacle (Priority.SAFETY) may SET it.
  - INTERACTION handlers (wake word, talk_nod, llm_approach, llm_<seq>) MUST
    NOT set it -- they relied on it to evict the idle loop, but doing so
    also evicted any other in-flight INTERACTION handler that was using
    _interruptible_sleep, e.g. approach getting cut off by talk_nod.
  - INTERACTION handlers preempt IDLE through the arbiter alone; the idle
    loop's currently-running short sleep finishes naturally (~1-2 s max,
    different actuator most of the time) and then sees the arbiter is no
    longer IDLE and skips its release.
  - idle_behavior_loop CLEARs it at the start of each cycle.
"""

import asyncio
import logging
import random
import time

from core.event_bus import EventBus, Events
from core.shared_state import SharedState
from core.priority_arbiter import PriorityArbiter, Priority
from core.serial_bridge import SerialBridge

logger = logging.getLogger(__name__)

IDLE_ACTIONS = ["look_around", "blink", "tilt_head", "small_nod", "yawn"]


class BehaviorEngine:
    def __init__(self, event_bus, shared_state, serial_bridge, arbiter, config):
        self._bus = event_bus
        self._state = shared_state
        self._bridge = serial_bridge
        self._arbiter = arbiter
        self._cfg = config.get("behavior", {})
        self._owner_cfg = config.get("owner", {})

        self._approach_speed = self._cfg.get("approach_speed", 60)
        self._approach_duration = self._cfg.get("approach_duration", 1.5)
        self._idle_interval = self._cfg.get("idle_interval", 10.0)

        self._emotion_focus = self._owner_cfg.get("emotion_focus", True)
        self._stranger_react = self._owner_cfg.get("stranger_emotion_react", False)
        self._greet_on_arrive = self._owner_cfg.get("greet_on_arrive", True)
        self._greet_cooldown = self._owner_cfg.get("greet_cooldown", 300)

        self._last_emotion = "neutral"
        self._last_emotion_time = 0.0
        self._emotion_cooldown = 3.0
        self._last_greet_time = 0.0

        # talk_nod throttle. _real_chat publishes LLM_RESPONSE per streamed
        # segment, and on_llm_response used to fire a SERVO_SEQ:nod for every
        # one of them -- a 3-segment reply becomes 3 nods within 1 second
        # (visible in the log as back-to-back TX -> ESP32 SERVO_SEQ:nod
        # entries on the same timestamp). We only want one nod per turn.
        self._last_talk_nod_time = 0.0
        self._talk_nod_cooldown = 4.0

        self._action_lock = asyncio.Lock()
        self._cancel_event = asyncio.Event()

        self._bus.subscribe(Events.EMOTION_DETECTED, self.on_emotion)
        self._bus.subscribe(Events.OWNER_ARRIVED, self.on_owner_arrived)
        self._bus.subscribe(Events.OWNER_LEFT, self.on_owner_left)
        self._bus.subscribe(Events.TOUCH_EVENT, self.on_touch)
        self._bus.subscribe(Events.EDGE_ALERT, self.on_edge_alert)
        self._bus.subscribe(Events.OBSTACLE_DETECTED, self.on_obstacle)
        self._bus.subscribe(Events.BUMP_DETECTED, self.on_bump)

        # Edge-trigger guard for BUMP: the firmware already debounces and
        # only re-emits when the sensor toggles back to "no bump" then
        # triggers again, but a stuck reflective object (table leg, hand
        # held next to the side) would otherwise keep generating BUMP every
        # loop tick once we add a re-arm window. Track last-bump time so
        # repeated BUMPs within the cooldown produce no extra retreat.
        self._last_bump_time = 0.0
        self._bump_cooldown = 1.5
        self._bus.subscribe(Events.WAKE_WORD, self.on_wake_word)
        self._bus.subscribe(Events.LLM_RESPONSE, self.on_llm_response)
        self._bus.subscribe(Events.ACTION_REQUEST, self.on_action_request)

    def _is_blocked(self) -> bool:
        """Default gate for AMBIENT non-safety handlers (emotion, owner
        arrive/leave, idle).

        REVISED 2026-04-26 (round 3):
          A previous round dropped the in_conversation check here so that
          touch PET could still tag the LLM during dialog. That fix worked
          for touch but inadvertently let emotion/owner_arrived/owner_left
          keep tagging too -- and the proactive_loop then consumed every
          one of them the instant Dialog END fired (~1 s later), producing
          unsolicited "你看起来不太顺心" replies on top of the user's
          actual conversation flow. Hence the user's "输出混乱" complaint.

          Now ambient signals are blocked again during dialog (and during
          enrollment, as before). Touch PET uses the looser gate
          _is_touch_blocked() instead -- on_speech folds fresh touch
          context into the user message via _capture_pending_touch_for_voice,
          so it does NOT trigger an extra proactive turn.
        """
        return self._state.enrollment_active or self._state.in_conversation

    def _is_touch_blocked(self) -> bool:
        """Touch-only gate. Looser than _is_blocked because touch is consumed
        by on_speech (folded into the user message) rather than by
        proactive_loop, so letting it tag during dialog does NOT produce a
        second autonomous reply -- it just enriches the next user turn."""
        return self._state.enrollment_active

    async def _interruptible_sleep(self, duration: float, step: float = 0.1) -> bool:
        """Sleep that can be interrupted by _cancel_event.
        Returns True if completed normally, False if interrupted."""
        elapsed = 0.0
        while elapsed < duration:
            if self._cancel_event.is_set():
                self._bridge.set_motor(0, 0)
                return False
            await asyncio.sleep(min(step, duration - elapsed))
            elapsed += step
        return True

    # ══════════════════════════════════════════════
    #  Owner-aware emotion -- TAG ONLY (no direct action)
    # ══════════════════════════════════════════════

    async def on_emotion(self, data: dict) -> None:
        if self._is_blocked():
            return

        emotion = data.get("emotion", "neutral")
        confidence = data.get("confidence", 0.0)
        is_owner = data.get("is_owner", False)
        person_name = data.get("person_name", "unknown")

        # Threshold tuned for B2 + logit-calibrated distribution. Raw max
        # probs on live camera are 0.2-0.4 range (vs 0.4-0.7 for B0), and
        # _emotion_vote now adds a persistence bonus so a sustained
        # non-neutral already lands at 0.3+. 0.25 keeps single-frame flashes
        # out while letting genuine 3+-frame signals through.
        if confidence < 0.25:
            return

        if not is_owner and not self._stranger_react:
            return

        now = time.monotonic()
        if emotion == self._last_emotion and (now - self._last_emotion_time) < self._emotion_cooldown:
            return
        self._last_emotion = emotion
        self._last_emotion_time = now

        if is_owner and emotion != "neutral":
            ctx = f"owner emotion: {emotion} ({confidence:.0%})"
            self._state.update(pending_emotion_context=ctx,
                               pending_emotion_time=time.time())
            logger.info("Emotion tagged for LLM: %s[%s] -> %s",
                        person_name, "OWNER" if is_owner else "stranger", emotion)

    # ══════════════════════════════════════════════
    #  Owner lifecycle -- TAG ONLY
    # ══════════════════════════════════════════════

    async def on_owner_arrived(self, data: dict) -> None:
        if self._is_blocked():
            return

        name = data.get("name", "master")
        now = time.monotonic()

        if self._greet_on_arrive and (now - self._last_greet_time) > self._greet_cooldown:
            self._last_greet_time = now
            self._state.update(pending_greet=True, pending_greet_name=name,
                               pending_greet_time=time.time())
            logger.info("Owner arrived tagged for LLM: %s", name)

    async def on_owner_left(self, data: dict) -> None:
        if self._is_blocked():
            return

        self._state.update(pending_owner_left=True,
                           pending_owner_left_time=time.time())
        logger.info("Owner left tagged for LLM")

    # ══════════════════════════════════════════════
    #  Touch -- TAG ONLY (lowest priority)
    # ══════════════════════════════════════════════

    async def on_touch(self, data: dict) -> None:
        if self._is_touch_blocked():
            return

        action = data.get("action", "")
        if not action:
            return

        if action == "pet":
            duration = data.get("duration", 0)
            self._state.update(pending_touch_context=f"pet head {duration:.1f}s",
                               pending_touch_time=time.time())
            logger.info("Touch PET tagged for LLM (%.1fs)", duration)
        elif action == "tap":
            # Short tap: ESP32's local reflex already flashed an expression
            # (bliss/curious). No need to fire an LLM-generated voice reply,
            # which would be slow and redundant.
            logger.info("Touch TAP absorbed by reflex (no LLM)")

    # ══════════════════════════════════════════════
    #  SAFETY -- direct execution, NEVER blocked
    # ══════════════════════════════════════════════

    # EDGE payload contract (firmware sensor_linetrack.h, in sync):
    #   sensors[0] = FL  front-left  fall
    #   sensors[1] = FR  front-right fall
    #   sensors[2] = RL  rear-left   fall
    #   sensors[3] = RR  rear-right  fall
    _EDGE_FL = 0
    _EDGE_FR = 1
    _EDGE_RL = 2
    _EDGE_RR = 3

    @staticmethod
    def _bit(arr, idx) -> bool:
        return len(arr) > idx and bool(arr[idx])

    async def on_edge_alert(self, data: dict) -> None:
        # Decode which side of the bot is hanging off. Default to "front
        # only" if the payload is malformed -- that matches the legacy
        # behavior (always reverse) and is the safer assumption pre-test.
        sensors = data.get("sensors") or []
        fl = self._bit(sensors, self._EDGE_FL)
        fr = self._bit(sensors, self._EDGE_FR)
        rl = self._bit(sensors, self._EDGE_RL)
        rr = self._bit(sensors, self._EDGE_RR)
        front = fl or fr
        rear  = rl or rr

        if front and rear:
            direction = "BOTH"
        elif rear:
            direction = "REAR"
        elif front:
            direction = "FRONT"
        else:
            # Empty / malformed payload. Treat as front for back-compat
            # with the older 3-sensor firmware (it would only ever flag
            # front cliffs on a desktop).
            direction = "FRONT"

        logger.warning("Behavior: [EDGE ALERT] dir=%s sensors=%s -> SAFETY",
                       direction, sensors)
        self._cancel_event.set()
        self._state.update(edge_detected=True)

        await self._bus.publish(Events.ACTION_REQUEST, {
            "type": "set_expression", "expression": "scared", "priority": 0,
        })

        if await self._arbiter.request(Priority.SAFETY, "edge_retreat"):
            try:
                if direction == "FRONT":
                    # Front cliff: REVERSE then pivot left away from the
                    # right corner (asymmetric pivot mirrors the original
                    # design; can be tuned per body).
                    self._bridge.set_motor(-80, -80)
                    await asyncio.sleep(0.6)
                    self._bridge.set_motor(-60, 60)
                    await asyncio.sleep(0.4)
                elif direction == "REAR":
                    # Rear cliff: drive FORWARD to escape, then pivot right.
                    # Using the SAME magnitudes as the front-escape path so
                    # we don't need a second tuning pass on the chassis.
                    self._bridge.set_motor(80, 80)
                    await asyncio.sleep(0.6)
                    self._bridge.set_motor(60, -60)
                    await asyncio.sleep(0.4)
                else:  # BOTH ends hanging -- bot is suspended / lifted up
                       # / corner-cased. Any direction we drive risks the
                       # other cliff. Best policy: stop and wait for help.
                    logger.error("Behavior: EDGE both ends hanging -- HOLD, "
                                 "no safe escape direction")
                    self._bridge.set_motor(0, 0)
                    # Hold long enough that a fresh QUERY shows the lockout
                    # state to the operator; auto-RESUME below will still
                    # fire but will be rejected by firmware as long as ANY
                    # of FL/FR/RL/RR keeps reading HIGH (cliff still seen).
                    await asyncio.sleep(2.0)

                self._bridge.set_motor(0, 0)
            finally:
                await self._arbiter.release(Priority.SAFETY)

        # Auto-RESUME: firmware latches safetyLockout on EDGE and will ignore
        # ALL subsequent SET_MOTOR commands (LLM approach, idle look_around's
        # servo, anything that touches motors) until the host asks to resume.
        # Without this loop, one EDGE event near the start of a session
        # permanently bricks the wheels.
        #
        # The firmware's CMD_RESUME branch only clears the lock if
        # !irSensors.isEdgeDetected(), so it's still safe -- if the retreat
        # didn't actually pull the bot back from the cliff, RESUME is a no-op
        # and the lockout stays. We give it 3 attempts spaced 0.5 s apart
        # (long enough for one polling cycle of the firmware), then give up
        # and let the operator pick the bot up manually.
        for attempt in range(3):
            await asyncio.sleep(0.5)
            self._bridge.resume_safety()
            logger.info("Behavior: edge RESUME attempt %d/3", attempt + 1)

        self._state.update(edge_detected=False)
        await asyncio.sleep(1.0)
        await self._bus.publish(Events.ACTION_REQUEST, {
            "type": "set_expression", "expression": "neutral", "priority": 0,
        })

    async def on_obstacle(self, data: dict) -> None:
        dist = data.get("dist_cm", 999)
        if dist < 8:
            logger.warning("Behavior: obstacle too close %dcm -> SAFETY stop", dist)
            self._cancel_event.set()
            if await self._arbiter.request(Priority.SAFETY, "obstacle_stop"):
                self._bridge.set_motor(0, 0)
                await self._arbiter.release(Priority.SAFETY)

    # BUMP payload contract: sensors=[BACK]. Single rear-facing IR.
    _BUMP_BACK = 0

    async def on_bump(self, data: dict) -> None:
        """Rear-facing IR bump (G34, mounted on the back of the chassis,
        horizontal). Softer than EDGE: just a short forward + small turn
        to break contact with whatever's behind us. No scared expression
        and no lockout. Firmware sends BUMP only on the rising edge, but
        we still throttle so reversing the bot up against a wall doesn't
        stack retreats."""
        sensors = data.get("sensors", [0])
        if not self._bit(sensors, self._BUMP_BACK):
            return

        now = time.monotonic()
        if (now - self._last_bump_time) < self._bump_cooldown:
            return
        self._last_bump_time = now

        logger.warning("Behavior: BUMP[BACK] sensors=%s -> nudge forward + turn",
                       sensors)
        self._cancel_event.set()

        if not await self._arbiter.request(Priority.SAFETY, "bump_back_avoid"):
            return
        try:
            # Step 1: short forward to break contact with the rear obstacle.
            self._bridge.set_motor(100, 100)
            await asyncio.sleep(0.25)
            # Step 2: small pivot. We don't know if the obstacle is
            # rear-left or rear-right (only one sensor), so pick a fixed
            # side -- pivot right -- and let normal navigation take over
            # from there. Alternating direction per call would be slightly
            # nicer but adds state for very little gain.
            self._bridge.set_motor(80, -80)
            await asyncio.sleep(0.25)
            self._bridge.set_motor(0, 0)
        finally:
            await self._arbiter.release(Priority.SAFETY)

    # ══════════════════════════════════════════════
    #  Wake word -- instant attentive feedback + cancel idle
    # ══════════════════════════════════════════════

    async def on_wake_word(self, data: dict) -> None:
        # NOTE: do NOT _cancel_event.set() here. The arbiter alone evicts
        # any IDLE handler from owning the priority. Setting cancel_event
        # would also abort an in-flight INTERACTION handler (e.g. an active
        # llm_approach motor run) that uses _interruptible_sleep.
        logger.info("Behavior: wake word -> expr[attentive]")
        await self._bus.publish(Events.ACTION_REQUEST, {
            "type": "set_expression", "expression": "attentive", "priority": 1,
        })
        if await self._arbiter.request(Priority.INTERACTION, "wake_look"):
            self._bridge.servo_sequence("nod")
            await asyncio.sleep(0.3)
            await self._arbiter.release(Priority.INTERACTION)

    # ══════════════════════════════════════════════
    #  LLM response -- nod when speaking reply
    # ══════════════════════════════════════════════

    async def on_llm_response(self, data: dict) -> None:
        if data.get("source") == "speech":
            # Throttle: a streamed reply publishes LLM_RESPONSE per segment
            # (often 2-4 within ~1 s). Without this gate we'd fire a SERVO_SEQ:
            # nod for every segment and the head jitters frantically. Allow
            # at most one nod per _talk_nod_cooldown window.
            now = time.monotonic()
            if (now - self._last_talk_nod_time) < self._talk_nod_cooldown:
                return
            self._last_talk_nod_time = now

            # See on_wake_word: no _cancel_event.set(). talk_nod must not
            # preempt an in-flight llm_approach via the cancel signal --
            # the arbiter handles ordering, and approach is on a different
            # actuator (wheels) than nod (TILT servo) anyway.
            if await self._arbiter.request(Priority.INTERACTION, "talk_nod"):
                self._bridge.servo_sequence("nod")
                await asyncio.sleep(0.5)
                await self._arbiter.release(Priority.INTERACTION)

    # ══════════════════════════════════════════════
    #  ACTION_REQUEST servo_action -- execute LLM's [ACT:xxx]
    # ══════════════════════════════════════════════

    _ACT_MAP = {
        "nod": "nod",
        "shake": "shake",
        "tilt_head": "tilt_head",
    }

    async def on_action_request(self, data: dict) -> None:
        if data.get("type") != "servo_action":
            return
        action = data.get("action", "")

        if action == "approach":
            # No _cancel_event.set() here -- see module docstring. The
            # arbiter alone is enough to preempt IDLE. SAFETY handlers
            # (edge/obstacle) will set _cancel_event to legitimately
            # interrupt us via _interruptible_sleep below.
            if await self._arbiter.request(Priority.INTERACTION, "llm_approach"):
                logger.info("Behavior: LLM approach -> motor(%d,%d) for %.1fs",
                            self._approach_speed, self._approach_speed,
                            self._approach_duration)
                self._bridge.set_motor(self._approach_speed, self._approach_speed)
                completed = await self._interruptible_sleep(self._approach_duration)
                self._bridge.set_motor(0, 0)
                await self._arbiter.release(Priority.INTERACTION)
                if not completed:
                    logger.warning("Behavior: LLM approach preempted by SAFETY")
            else:
                logger.info("Behavior: LLM approach DENIED by arbiter "
                            "(current=%s owner=%s)",
                            self._arbiter.current_priority.name,
                            self._arbiter.current_owner)
            return

        seq_name = self._ACT_MAP.get(action)
        if seq_name:
            if await self._arbiter.request(Priority.INTERACTION, f"llm_{action}"):
                logger.info("Behavior: LLM action -> servo_seq[%s]", seq_name)
                self._bridge.servo_sequence(seq_name)
                await asyncio.sleep(1.0)
                await self._arbiter.release(Priority.INTERACTION)
            else:
                logger.info("Behavior: LLM action[%s] DENIED by arbiter "
                            "(current=%s owner=%s)", action,
                            self._arbiter.current_priority.name,
                            self._arbiter.current_owner)

    # ══════════════════════════════════════════════
    #  Idle behavior -- interruptible, lowest priority
    # ══════════════════════════════════════════════

    async def idle_behavior_loop(self) -> None:
        logger.info("Idle behavior loop started")
        while self._state.is_running:
            await asyncio.sleep(self._idle_interval + random.uniform(-2, 2))

            self._cancel_event.clear()

            if self._is_blocked() or self._state.is_being_touched or self._state.is_listening:
                continue

            if not await self._arbiter.request(Priority.IDLE, "idle"):
                continue

            if self._action_lock.locked():
                await self._arbiter.release(Priority.IDLE)
                continue

            async with self._action_lock:
                action = random.choice(IDLE_ACTIONS)
                logger.info("Idle action: %s", action)

                if action == "look_around":
                    # PAN gimbal-calibrated: range 35..115, center 75
                    self._bridge.set_servo(0, random.randint(50, 100))
                    ok = await self._interruptible_sleep(1.0)
                    self._bridge.set_servo(0, 75)
                elif action == "blink":
                    await self._bus.publish(Events.ACTION_REQUEST, {
                        "type": "set_expression", "expression": "blink", "priority": 3,
                    })
                    ok = await self._interruptible_sleep(0.3)
                    await self._bus.publish(Events.ACTION_REQUEST, {
                        "type": "set_expression", "expression": "neutral", "priority": 3,
                    })
                elif action in ("tilt_head", "small_nod"):
                    self._bridge.servo_sequence(action.replace("small_", ""))
                    ok = await self._interruptible_sleep(1.0)
                elif action == "yawn":
                    await self._bus.publish(Events.ACTION_REQUEST, {
                        "type": "set_expression", "expression": "sleepy", "priority": 3,
                    })
                    ok = await self._interruptible_sleep(2.0)
                    await self._bus.publish(Events.ACTION_REQUEST, {
                        "type": "set_expression", "expression": "neutral", "priority": 3,
                    })

            await self._arbiter.release(Priority.IDLE)
