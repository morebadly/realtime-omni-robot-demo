"""
Fatigue sensor (Phase 1 -- context heuristic only, no extra ML models).

Signals we can collect:
  * Local clock          : late evening / late night adds points
  * Owner absence length : 3h / 6h since last departure adds points
  * Recent emotion window: high ratio of negative/neutral adds points;
                           a strong sad(conf>0.7) hit adds more
Gate:
  On OWNER_ARRIVED, compute fatigue_score.
  If score >= threshold AND cooldown has passed since last fatigue greeting,
  write SharedState.pending_fatigue_check=True so LLMAgent's proactive_loop
  invokes a fatigue-aware LLM call (LLM is the final judge).

No direct expression/speech -- all output flows through LLMAgent.
"""

import asyncio
import logging
import time
from collections import deque

from core.event_bus import EventBus, Events
from core.shared_state import SharedState

logger = logging.getLogger(__name__)


class FatigueSensor:
    def __init__(self, event_bus: EventBus, shared_state: SharedState, config: dict):
        self._bus = event_bus
        self._state = shared_state
        cfg = config.get("fatigue", {}) or {}

        self._enabled = bool(cfg.get("enabled", True))
        self._score_threshold = float(cfg.get("score_threshold", 0.6))
        self._cooldown = float(cfg.get("cooldown_seconds", 7200))
        self._window_seconds = float(cfg.get("emotion_window_seconds", 30))

        self._late_evening_hour = int(cfg.get("late_evening_hour", 18))
        self._late_evening_score = float(cfg.get("late_evening_score", 0.3))
        self._late_night_hour_start = int(cfg.get("late_night_hour_start", 0))
        self._late_night_hour_end = int(cfg.get("late_night_hour_end", 2))
        self._late_night_score = float(cfg.get("late_night_score", 0.2))

        self._absence_6h_score = float(cfg.get("absence_6h_score", 0.4))
        self._absence_3h_score = float(cfg.get("absence_3h_score", 0.2))

        self._negative_ratio_threshold = float(cfg.get("negative_ratio_threshold", 0.6))
        self._negative_ratio_score = float(cfg.get("negative_ratio_score", 0.3))
        self._strong_sad_conf = float(cfg.get("strong_sad_conf", 0.7))
        self._strong_sad_score = float(cfg.get("strong_sad_score", 0.2))

        # Rolling emotion history: deque of (timestamp, emotion, confidence, is_owner)
        self._emotion_history: deque = deque(maxlen=256)

        self._bus.subscribe(Events.EMOTION_DETECTED, self._on_emotion)
        self._bus.subscribe(Events.OWNER_ARRIVED, self._on_owner_arrived)

    async def _on_emotion(self, data: dict) -> None:
        if not data.get("is_owner"):
            return
        now = time.time()
        emotion = data.get("emotion", "neutral")
        conf = float(data.get("confidence", 0.0))
        self._emotion_history.append((now, emotion, conf))

    async def _on_owner_arrived(self, _data: dict) -> None:
        if not self._enabled:
            return
        now = time.time()
        if (now - self._state.last_fatigue_greeting_time) < self._cooldown:
            return

        score, breakdown = self._compute_score(now)
        logger.info("Fatigue score=%.2f  breakdown=%s", score, breakdown)

        if score >= self._score_threshold:
            self._state.update(pending_fatigue_check=True,
                               pending_fatigue_time=time.time())
            logger.info("Fatigue threshold reached -> pending_fatigue_check=True")

    def _compute_score(self, now: float) -> tuple[float, dict]:
        score = 0.0
        breakdown: dict = {}

        # --- Time-of-day ---
        hour_local = time.localtime(now).tm_hour
        if hour_local >= self._late_evening_hour:
            score += self._late_evening_score
            breakdown["late_evening"] = self._late_evening_score
        if self._late_night_hour_start <= hour_local < self._late_night_hour_end:
            score += self._late_night_score
            breakdown["late_night"] = self._late_night_score

        # --- Absence length ---
        dep = self._state.owner_last_departure_time
        if dep > 0:
            gap = now - dep
            if gap >= 6 * 3600:
                score += self._absence_6h_score
                breakdown["absence_6h"] = self._absence_6h_score
            elif gap >= 3 * 3600:
                score += self._absence_3h_score
                breakdown["absence_3h"] = self._absence_3h_score

        # --- Recent emotion window ---
        cutoff = now - self._window_seconds
        recent = [(e, c) for t, e, c in self._emotion_history if t >= cutoff]
        if recent:
            neg_set = {"sad", "worried", "neutral", "fear", "sympathy"}
            neg_count = sum(1 for e, _ in recent if e in neg_set)
            ratio = neg_count / len(recent)
            if ratio >= self._negative_ratio_threshold:
                score += self._negative_ratio_score
                breakdown["negative_ratio"] = self._negative_ratio_score

            if any(e == "sad" and c >= self._strong_sad_conf for e, c in recent):
                score += self._strong_sad_score
                breakdown["strong_sad"] = self._strong_sad_score

        return score, breakdown

    async def run_loop(self) -> None:
        # FatigueSensor is purely event-driven; just keep the coroutine alive
        # so main_brain's gather keeps a handle on us.
        logger.info("Fatigue sensor started (enabled=%s, threshold=%.2f)",
                    self._enabled, self._score_threshold)
        while self._state.is_running:
            await asyncio.sleep(5.0)
