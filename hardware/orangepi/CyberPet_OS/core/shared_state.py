"""
Thread-safe global shared state container.
"""

import threading
import time
from dataclasses import dataclass, field
from typing import Optional, Any


@dataclass
class PersonInfo:
    name: str = "unknown"
    face_id: str = ""
    is_owner: bool = False
    last_seen: float = 0.0


@dataclass
class SharedState:
    _lock: threading.RLock = field(default_factory=threading.RLock, repr=False)

    # -- Vision --
    current_emotion: str = "neutral"
    emotion_confidence: float = 0.0
    person_present: bool = False
    person_info: PersonInfo = field(default_factory=PersonInfo)
    owner_present: bool = False
    owner_last_seen: float = 0.0
    owner_last_greeted: float = 0.0
    owner_last_arrival_time: float = 0.0
    owner_last_departure_time: float = 0.0

    # -- Audio --
    is_awake: bool = False
    last_speech_text: str = ""
    is_listening: bool = False
    in_conversation: bool = False
    tts_playing: bool = False
    barge_in: bool = False

    # -- Touch --
    is_being_touched: bool = False
    touch_sensor_id: int = -1
    touch_start_time: float = 0.0

    # -- Motion --
    is_moving: bool = False
    edge_detected: bool = False
    obstacle_distance_cm: float = 999.0

    # -- Pending tags (for LLMAgent proactive_loop) --
    # Timestamps are recorded whenever the matching tag is written, so stale
    # tags can be dropped after the TTL (see LLMAgent._pending_tag_fresh).
    pending_emotion_context: str = ""
    pending_emotion_time: float = 0.0
    pending_touch_context: str = ""
    pending_touch_time: float = 0.0
    pending_greet: bool = False
    pending_greet_name: str = ""
    pending_greet_time: float = 0.0
    pending_owner_left: bool = False
    pending_owner_left_time: float = 0.0
    pending_fatigue_check: bool = False
    pending_fatigue_time: float = 0.0
    last_fatigue_greeting_time: float = 0.0

    # -- Enrollment --
    enrollment_active: bool = False

    # -- System --
    battery_voltage: float = 0.0
    is_running: bool = True

    def update(self, **kwargs) -> None:
        with self._lock:
            for key, value in kwargs.items():
                if hasattr(self, key):
                    setattr(self, key, value)

    def update_person(self, name: str = None, is_owner: bool = None,
                      face_id: str = None, last_seen: float = None) -> None:
        with self._lock:
            if name is not None:
                self.person_info.name = name
            if is_owner is not None:
                self.person_info.is_owner = is_owner
            if face_id is not None:
                self.person_info.face_id = face_id
            if last_seen is not None:
                self.person_info.last_seen = last_seen

    def get(self, key: str) -> Optional[Any]:
        with self._lock:
            return getattr(self, key, None)

    def snapshot(self) -> dict:
        with self._lock:
            return {
                "emotion": self.current_emotion,
                "emotion_confidence": self.emotion_confidence,
                "person_present": self.person_present,
                "person_name": self.person_info.name,
                "is_owner": self.person_info.is_owner,
                "owner_present": self.owner_present,
                "is_being_touched": self.is_being_touched,
                "is_awake": self.is_awake,
                "is_listening": self.is_listening,
                "obstacle_distance_cm": self.obstacle_distance_cm,
                "edge_detected": self.edge_detected,
                "timestamp": time.time(),
            }
