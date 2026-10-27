"""
Vision perception -- full ONNX lightweight pipeline, NO tensorflow.

Owner-priority logic:
  - Every frame: detect ALL faces -> identify each -> pick OWNER if present
  - Emotion analysis runs ONLY on the selected face (owner preferred)
  - Publishes is_owner flag on every EMOTION_DETECTED event
  - Publishes OWNER_ARRIVED / OWNER_LEFT lifecycle events
"""

import asyncio
import logging
import random
import time
from collections import Counter, deque
from pathlib import Path
from typing import Optional

try:
    import cv2
    HAS_CV2 = True
except Exception:
    HAS_CV2 = False

try:
    import numpy as np
    HAS_NUMPY = True
except Exception:
    HAS_NUMPY = False
    np = None

try:
    import onnxruntime as ort
    HAS_ORT = True
except Exception:
    HAS_ORT = False
    ort = None

from core.event_bus import EventBus, Events
from core.shared_state import SharedState

logger = logging.getLogger(__name__)

EMOTIONS = ["happy", "sad", "angry", "surprise", "fear", "neutral", "neutral", "neutral"]
SIM_NAMES = ["master", "master", "master", "Li Si", "unknown"]

# AffectNet 8-class label order as emitted by enet_b0_8_va_mtl.onnx
# (HSEmotion / EfficientNet-B0 trained on AffectNet + multi-task valence/
# arousal). Replaces the old FER-2013 "FER+" model, which was trained
# predominantly on western faces and silently mapped Asian smiles to
# neutral/sad (happy prob was stuck at ~1-2% regardless of expression).
FER_LABELS = ["angry", "contempt", "disgust", "fear",
              "happy", "neutral", "sad", "surprise"]
FER_TO_BEHAVIOR = {
    "angry": "angry", "contempt": "neutral", "disgust": "angry",
    "fear": "fear", "happy": "happy", "neutral": "neutral",
    "sad": "sad", "surprise": "surprise",
}


def _softmax(x):
    e = np.exp(x - np.max(x))
    return e / e.sum()


# ══════════════════════════════════════════════════
#  ONNX Model Wrappers
# ══════════════════════════════════════════════════

class YuNetDetector:
    def __init__(self, model_path: str, conf_threshold: float = 0.7):
        self._detector = cv2.FaceDetectorYN.create(
            model_path, "", (320, 320),
            score_threshold=conf_threshold, nms_threshold=0.3, top_k=10,
        )

    def detect(self, frame) -> list[dict]:
        h, w = frame.shape[:2]
        self._detector.setInputSize((w, h))
        _, raw = self._detector.detect(frame)
        if raw is None:
            return []
        faces = []
        for i in range(raw.shape[0]):
            r = raw[i]
            x, y, fw, fh = int(r[0]), int(r[1]), int(r[2]), int(r[3])
            score = float(r[-1])
            # YuNet landmarks order (subject-perspective):
            #   r[4:6]  right eye
            #   r[6:8]  left eye
            #   r[8:10] nose tip
            #   r[10:12] right mouth corner
            #   r[12:14] left mouth corner
            landmarks = [(float(r[4]),  float(r[5])),   # right eye
                         (float(r[6]),  float(r[7])),   # left eye
                         (float(r[8]),  float(r[9])),   # nose
                         (float(r[10]), float(r[11])),  # right mouth
                         (float(r[12]), float(r[13]))]  # left mouth
            x, y = max(0, x), max(0, y)
            fw, fh = min(fw, w - x), min(fh, h - y)
            if fw > 10 and fh > 10:
                faces.append({
                    "box": (x, y, fw, fh),
                    "score": score,
                    "landmarks": landmarks,
                })
        return faces


class EmotionClassifier:
    """Wraps an HSEmotion AffectNet ONNX model.

    Auto-detects input size from the model filename:
      * enet_b0_* -> 224x224
      * enet_b2_* -> 260x260
      * mbf_*     -> 112x112
      * otherwise -> 224x224 (default)

    Input: RGB image, rescaled to [0,1] then mean/std normalized with
    ImageNet statistics (or MBF's [0.5, 0.5, 0.5] if it's a MobileFaceNet).

    Output: 8-10 values where [0:8] are emotion logits in AffectNet order
    (angry / contempt / disgust / fear / happy / neutral / sad / surprise).
    Models with `_mtl` suffix append 2 extra values (valence / arousal)
    which we slice off and ignore. Models without `_mtl` return exactly 8.
    """
    _IMG_NET_MEAN = None
    _IMG_NET_STD = None
    _MBF_MEAN = None
    _MBF_STD = None

    # Logit prior calibration applied BEFORE softmax.
    # AffectNet has heavy class imbalance (neutral ~40%, happy ~25%, while
    # sad/angry/fear/contempt each <10%). Live-camera distribution shift on
    # top of this makes B2 pin `neutral` at 0.34-0.39 for EVERY frame, and
    # sad/angry/fear never climb above 0.15 even when clearly expressed.
    # Subtracting a constant from neutral's logit and adding a small boost
    # to the under-represented classes re-centers the posterior toward the
    # user's actual expression distribution (approx. uniform when prompted
    # to pose each emotion). Values tuned empirically on B2 logs.
    # Order matches FER_LABELS: angry, contempt, disgust, fear,
    #                           happy, neutral, sad,  surprise
    # sad gets a larger boost than other negatives because it was the class
    # reported by the user as the most frequently missed. anger is kept
    # modest to avoid false positives when the user is simply concentrating.
    _LOGIT_BIAS = None
    _LOGIT_BIAS_VALUES = (0.3, 0.1, 0.2, 0.2, 0.3, -1.0, 0.6, 0.0)

    def __init__(self, model_path: str):
        self._session = ort.InferenceSession(
            model_path, providers=["CPUExecutionProvider"])
        self._input_name = self._session.get_inputs()[0].name

        # Lazy init module-level numpy constants (numpy import is guarded).
        if EmotionClassifier._IMG_NET_MEAN is None:
            EmotionClassifier._IMG_NET_MEAN = np.array(
                [0.485, 0.456, 0.406], dtype=np.float32)
            EmotionClassifier._IMG_NET_STD = np.array(
                [0.229, 0.224, 0.225], dtype=np.float32)
            EmotionClassifier._MBF_MEAN = np.array(
                [0.5, 0.5, 0.5], dtype=np.float32)
            EmotionClassifier._MBF_STD = np.array(
                [0.5, 0.5, 0.5], dtype=np.float32)
            EmotionClassifier._LOGIT_BIAS = np.array(
                EmotionClassifier._LOGIT_BIAS_VALUES, dtype=np.float32)

        # Auto-detect input size and preprocessing from filename, matching
        # HSEmotion's own convention (see hsemotion-onnx/facial_emotions.py).
        name = Path(model_path).name.lower()
        if "_b2_" in name:
            self._img_size = 260
        elif name.startswith("mbf_"):
            self._img_size = 112
        else:
            self._img_size = 224
        if name.startswith("mbf_"):
            self._mean = EmotionClassifier._MBF_MEAN
            self._std = EmotionClassifier._MBF_STD
        else:
            self._mean = EmotionClassifier._IMG_NET_MEAN
            self._std = EmotionClassifier._IMG_NET_STD

    def predict(self, face_bgr) -> tuple[str, float, dict]:
        rgb = cv2.cvtColor(face_bgr, cv2.COLOR_BGR2RGB)
        resized = cv2.resize(rgb, (self._img_size, self._img_size))
        arr = resized.astype(np.float32) / 255.0
        arr = (arr - self._mean) / self._std
        blob = arr.transpose(2, 0, 1)[np.newaxis, ...]  # HWC -> NCHW
        raw = self._session.run(None, {self._input_name: blob})[0][0]
        # Slice first 8 values (emotion logits). Non-MTL returns exactly 8;
        # MTL variants append valence/arousal which are harmless to ignore.
        logits = raw[:len(FER_LABELS)].astype(np.float32, copy=True)
        # Apply class-prior calibration. See _LOGIT_BIAS_VALUES docstring.
        logits += EmotionClassifier._LOGIT_BIAS
        probs = _softmax(logits)
        idx = int(np.argmax(probs))
        all_emotions = {FER_LABELS[i]: float(probs[i])
                        for i in range(len(FER_LABELS))}
        mapped = FER_TO_BEHAVIOR.get(FER_LABELS[idx], "neutral")
        return mapped, float(probs[idx]), all_emotions


class FaceEmbedder:
    def __init__(self, model_path: str):
        self._session = ort.InferenceSession(model_path, providers=["CPUExecutionProvider"])
        inp = self._session.get_inputs()[0]
        self._input_name = inp.name
        self._input_shape = inp.shape

    def get_embedding(self, face_bgr) -> "np.ndarray":
        h, w = self._input_shape[2], self._input_shape[3]
        resized = cv2.resize(face_bgr, (w, h))
        blob = resized.astype(np.float32).transpose(2, 0, 1) / 255.0
        blob = (blob - 0.5) / 0.5
        blob = np.expand_dims(blob, 0)
        embedding = self._session.run(None, {self._input_name: blob})[0][0]
        norm = np.linalg.norm(embedding)
        return embedding / norm if norm > 0 else embedding


# ══════════════════════════════════════════════════
#  Main Vision Module
# ══════════════════════════════════════════════════

class CameraVision:
    def __init__(self, event_bus: EventBus, shared_state: SharedState, config: dict):
        self._bus = event_bus
        self._state = shared_state
        self._cfg = config.get("vision", {})
        self._owner_cfg = config.get("owner", {})
        self._detect_interval = self._cfg.get("emotion_detect_interval", 0.15)
        self._match_threshold = self._cfg.get("face_match_threshold", 0.45)
        self._face_db_path = self._cfg.get("face_db_path", "assets/faces_db")
        self._owner_name = self._owner_cfg.get("name", "master")

        self._can_real_mode = HAS_CV2 and HAS_NUMPY and HAS_ORT
        self._sim_mode = True
        self._cap = None
        self._face_detector: Optional[YuNetDetector] = None
        self._emotion_clf: Optional[EmotionClassifier] = None
        self._face_embedder: Optional[FaceEmbedder] = None
        self._known_faces: dict[str, "np.ndarray"] = {}

        # OWNER.txt persisted by enrollment takes precedence over config.
        self._apply_owner_override_from_file()

        self._owner_was_present = False
        self._any_person_was_present = False
        self._no_face_streak = 0
        self._lost_threshold = 6
        self._pause_perception = False
        self._loop: Optional[asyncio.AbstractEventLoop] = None

        # Domain-adaptation helpers
        self._clahe = None
        if HAS_CV2:
            self._clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        self._low_light_brightness = 60       # mean brightness threshold

        # Emotion majority-vote smoothing (anti single-frame jitter)
        self._emotion_window: deque = deque(maxlen=5)
        # Diagnostic: log FER+ raw probabilities when vote winner changes,
        # or every ~5s heartbeat, so we can tell "model never detects
        # happy" from "vote suppresses happy it did detect".
        self._emotion_last_logged: tuple = ("unknown", -100)

    async def start(self) -> None:
        self._loop = asyncio.get_running_loop()
        if not self._can_real_mode:
            missing = [x for x, h in [("cv2", HAS_CV2), ("numpy", HAS_NUMPY), ("onnxruntime", HAS_ORT)] if not h]
            logger.warning("[SIM] Camera simulation mode (missing: %s)", ", ".join(missing))
            return

        try:
            loop = asyncio.get_running_loop()
            self._cap = await loop.run_in_executor(None, self._probe_camera)
            if self._cap is None:
                logger.error("No working camera found (probed index 0-15), falling back to simulation")
                return

            self._cap.set(cv2.CAP_PROP_FRAME_WIDTH, self._cfg.get("frame_width", 640))
            self._cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self._cfg.get("frame_height", 480))

            if self._load_models():
                self._sim_mode = False
                self._load_face_db()
            else:
                logger.warning("Some ONNX models missing, falling back to simulation")
        except Exception as e:
            logger.error("Camera/model init failed: %s", e)
            print(f"\U0001f6a8 Camera/model init real error: {e}")
            self._cap = None

    def _probe_camera(self) -> Optional["cv2.VideoCapture"]:
        hint = self._cfg.get("camera_index", None)
        candidates = [hint] if hint is not None else []
        candidates += [i for i in range(16) if i != hint]

        logger.info("Probing camera indices: %s", candidates)
        for idx in candidates:
            cap = None
            try:
                cap = cv2.VideoCapture(idx)
                if cap.isOpened():
                    ret, frame = cap.read()
                    if ret and frame is not None:
                        logger.info("Camera FOUND at index %d", idx)
                        return cap
                    logger.debug("Index %d opened but read() failed", idx)
                cap.release()
            except Exception as e:
                logger.debug("Index %d probe error: %s", idx, e)
                if cap is not None:
                    try:
                        cap.release()
                    except Exception:
                        pass
        return None

    def _load_models(self) -> bool:
        models_dir = Path(self._cfg.get("models_dir", "assets/models"))
        all_ok = True
        for attr, cfg_key, cls, required in [
            ("_face_detector", "detector_model", lambda p: YuNetDetector(p, self._cfg.get("detector_confidence", 0.7)), True),
            ("_emotion_clf", "emotion_model", EmotionClassifier, False),
            ("_face_embedder", "face_embed_model", FaceEmbedder, False),
        ]:
            path = models_dir / self._cfg.get(cfg_key, "")
            if path.exists():
                try:
                    setattr(self, attr, cls(str(path)))
                    logger.info("Loaded model: %s", path.name)
                except Exception as e:
                    logger.error("Model load failed %s: %s", path.name, e)
                    if required: all_ok = False
            else:
                msg = "Model not found: %s"
                if required:
                    logger.warning(msg, path)
                    all_ok = False
                else:
                    logger.info(msg + " (optional)", path)
        return all_ok

    def _load_face_db(self) -> None:
        if not self._face_embedder or not HAS_NUMPY:
            return
        db_path = Path(self._face_db_path)
        if not db_path.exists():
            return
        for f in db_path.glob("*.npy"):
            self._known_faces[f.stem] = np.load(str(f))
            is_owner = (f.stem == self._owner_name)
            logger.info("Loaded face: %s %s", f.stem, "(OWNER)" if is_owner else "")

    async def perception_loop(self) -> None:
        await self.start()
        if self._sim_mode:
            await self._sim_perception_loop()
            return
        await self._real_perception_loop()

    # ══════════════════════════════════════════════
    #  REAL MODE -- owner-priority ONNX pipeline
    # ══════════════════════════════════════════════

    async def _real_perception_loop(self) -> None:
        logger.info("Vision ONNX pipeline started (owner-priority mode, owner=%s)", self._owner_name)
        loop = asyncio.get_running_loop()

        while self._state.is_running:
            if self._pause_perception:
                await asyncio.sleep(0.2)
                continue

            in_conv = self._state.in_conversation

            ret, frame = await loop.run_in_executor(None, self._grab_frame)
            if not ret:
                await asyncio.sleep(0.05)
                continue

            try:
                if in_conv:
                    result = await loop.run_in_executor(
                        None, self._pipeline_light, frame)
                else:
                    result = await loop.run_in_executor(
                        None, self._pipeline_sync, frame)
            except Exception as e:
                logger.error("[CAM] Pipeline error: %s", e)
                result = None
            await self._publish_results(result)
            interval = 1.0 if in_conv else self._detect_interval
            await asyncio.sleep(interval)

    def _grab_frame(self):
        """Read the latest frame, flushing stale buffered frames first."""
        if not self._cap or not self._cap.isOpened():
            return False, None
        for _ in range(3):
            self._cap.grab()
        return self._cap.read()

    @staticmethod
    def _is_frame_sharp(frame, threshold: float = 30.0) -> bool:
        """Reject blurry frames using Laplacian variance."""
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        return cv2.Laplacian(gray, cv2.CV_64F).var() > threshold

    # ─── Domain adaptation helpers ──────────────────────────

    def _enhance_low_light(self, frame):
        """Apply CLAHE to the L channel only when frame is globally dim.
        Typical desktop evening scene (mean brightness < 60) benefits the most;
        bright daylight frames are left untouched to avoid over-equalization."""
        if self._clahe is None or frame is None:
            return frame
        try:
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            if gray.mean() >= self._low_light_brightness:
                return frame
            lab = cv2.cvtColor(frame, cv2.COLOR_BGR2LAB)
            l, a, b = cv2.split(lab)
            l = self._clahe.apply(l)
            merged = cv2.merge((l, a, b))
            return cv2.cvtColor(merged, cv2.COLOR_LAB2BGR)
        except Exception:
            return frame

    # Padding ratio applied to YuNet's detection box before feeding into the
    # emotion classifier. YuNet boxes are tight (core face only), while the
    # HSEmotion models (enet_b0/b2) were trained with MTCNN/RetinaFace crops
    # that include a rim of forehead / jaw / ears. Without padding the B2
    # model collapses to a near-uniform distribution (max prob ~0.3, never
    # fires happy/sad). 0.25 means +25% on each side -> ~1.5x area.
    _EMOTION_ROI_PADDING = 0.25

    def _expand_box(self, x: int, y: int, w: int, h: int,
                    frame_w: int, frame_h: int, ratio: float):
        pad_x = int(w * ratio)
        pad_y = int(h * ratio)
        nx = max(0, x - pad_x)
        ny = max(0, y - pad_y)
        nw = min(frame_w - nx, w + 2 * pad_x)
        nh = min(frame_h - ny, h + 2 * pad_y)
        return nx, ny, nw, nh

    def _align_face(self, frame, face: dict):
        """Rotate+crop a face ROI so the eye line is horizontal.
        Uses YuNet's 5 landmarks (right_eye, left_eye) to compute the angle.
        Adds _EMOTION_ROI_PADDING around the detection box so the crop matches
        the distribution the HSEmotion models were trained on.
        Returns the aligned BGR ROI, or None if alignment cannot be done."""
        fh, fw = frame.shape[:2]
        landmarks = face.get("landmarks")
        x, y, w, h = face["box"]
        ex, ey, ew, eh = self._expand_box(x, y, w, h, fw, fh,
                                          self._EMOTION_ROI_PADDING)
        if not landmarks or len(landmarks) < 2:
            roi = frame[ey:ey + eh, ex:ex + ew]
            return roi if roi.size > 0 else None
        try:
            right_eye, left_eye = landmarks[0], landmarks[1]
            dx = left_eye[0] - right_eye[0]
            dy = left_eye[1] - right_eye[1]
            angle = np.degrees(np.arctan2(dy, dx))

            cx = (right_eye[0] + left_eye[0]) / 2
            cy = (right_eye[1] + left_eye[1]) / 2

            # Rotate the whole frame around the eye midpoint, then crop the
            # padded face box. This is cheap and handles non-trivial tilts.
            M = cv2.getRotationMatrix2D((cx, cy), angle, 1.0)
            rotated = cv2.warpAffine(
                frame, M, (fw, fh),
                flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
            roi = rotated[ey:ey + eh, ex:ex + ew]
            return roi if roi.size > 0 else None
        except Exception:
            roi = frame[ey:ey + eh, ex:ex + ew]
            return roi if roi.size > 0 else None

    def _log_emotion_diag(self, raw_emotion: str, raw_conf: float,
                          voted_emotion: str, voted_conf: float,
                          all_emotions: dict) -> None:
        """Emit one FER+ diagnostic line per vote winner change, plus a
        heartbeat every ~20 frames. Prints the top-3 raw probabilities so
        we can tell whether neutral bias is the model being confused or
        the vote suppressing a legitimate happy/sad signal."""
        last_voted, last_ctr = self._emotion_last_logged
        ctr = self._vision_log_counter
        if voted_emotion == last_voted and ctr - last_ctr < 20:
            return
        top3 = sorted(all_emotions.items(), key=lambda kv: -kv[1])[:3]
        top3_str = ", ".join(f"{e}:{p:.2f}" for e, p in top3)
        logger.info(
            "[FER+] raw=%s(%.2f) -> vote=%s(%.2f) top3={%s}",
            raw_emotion, raw_conf, voted_emotion, voted_conf, top3_str)
        self._emotion_last_logged = (voted_emotion, ctr)

    # Fast-path thresholds are asymmetric: non-neutral emotions bypass
    # smoothing earlier than neutral, on the premise that AffectNet is
    # structurally biased toward neutral (it's the dominant training class
    # and the visual "baseline"). A sad(0.42) signal is more diagnostically
    # valuable than a neutral(0.42) one -- the former means "I see real
    # sadness cues", the latter just means "I'm not sure what I'm seeing".
    _EMOTION_FAST_PATH_NONNEUTRAL = 0.40
    _EMOTION_FAST_PATH_NEUTRAL = 0.55
    # Neutral's softmax score gets down-weighted by this factor when
    # computing the vote. Kept near 1.0 because EmotionClassifier already
    # applies a -1.0 logit bias on `neutral` as a prior-calibration step;
    # a second 0.75 penalty in the vote would push true-neutral frames into
    # flickering between sad/angry. 0.90 keeps a light thumb on the scale
    # for borderline neutrals while letting strong neutrals win cleanly.
    _NEUTRAL_VOTE_PENALTY = 0.90
    # Per-step recency decay for the weighted vote (lower = sharper bias
    # toward the most recent frame, faster response to expression changes).
    _EMOTION_DECAY = 0.45

    def _emotion_vote(self, emotion: str, confidence: float):
        """Confidence-weighted, recency-decayed, neutral-penalized vote.

        Tier 1 (fast path): a single sufficiently-confident frame wins
        immediately. Non-neutral emotions get a lower threshold (0.40)
        than neutral (0.60) because AffectNet leans neutral: we want a
        weak sad/happy signal to surface quickly, but a weak neutral to
        have to prove itself across the window.

        Tier 2 (weighted vote): each frame contributes
        `confidence * decay^age * (penalty if neutral else 1.0)`. This
        lets a mid-confidence non-neutral (e.g. sad 0.44) outweigh a
        slightly-stronger neutral (e.g. neutral 0.52) that AffectNet
        would otherwise prefer by default. Older frames decay fast (0.45
        per step) so expression changes propagate within ~2-3 frames.
        """
        self._emotion_window.append((emotion, confidence))

        # Fast path with asymmetric thresholds.
        threshold = (self._EMOTION_FAST_PATH_NEUTRAL
                     if emotion == "neutral"
                     else self._EMOTION_FAST_PATH_NONNEUTRAL)
        if confidence >= threshold:
            return emotion, confidence

        if not self._emotion_window:
            return emotion, confidence

        window_list = list(self._emotion_window)
        scores: dict = {}
        decay = 1.0
        for e, c in reversed(window_list):
            weighted = c * decay
            if e == "neutral":
                weighted *= self._NEUTRAL_VOTE_PENALTY
            scores[e] = scores.get(e, 0.0) + weighted
            decay *= self._EMOTION_DECAY

        winner = max(scores.items(), key=lambda kv: kv[1])[0]
        confs = [c for e, c in window_list if e == winner]
        avg_conf = sum(confs) / len(confs) if confs else confidence
        # Persistence bonus: a sad/happy signal that holds across N frames
        # is more trustworthy than a single-frame flash even if each frame's
        # raw conf is modest. +0.04 per extra winning frame, capped so a
        # fully-saturated 5-frame window adds +0.16. This lets a 0.22-sad
        # that holds for 5 frames reach 0.38, comfortably above the
        # behavior-engine gate, while a single-frame sad at 0.22 stays at
        # 0.22 and gets filtered out as transient.
        extra = max(0, len(confs) - 1)
        persistence_bonus = min(0.16, 0.04 * extra)
        voted_conf = min(1.0, avg_conf + persistence_bonus)
        return winner, voted_conf

    _vision_log_counter = 0

    def _pipeline_light(self, frame) -> Optional[dict]:
        """Lightweight pipeline for use during conversation.
        Only face detection + emotion. Skips identity (MobileFaceNet) to avoid
        concurrent ONNX segfault on ARM."""
        self._vision_log_counter += 1
        frame = self._enhance_low_light(frame)
        all_faces = self._face_detector.detect(frame)
        if not all_faces:
            return None

        target = max(all_faces, key=lambda f: f["box"][2] * f["box"][3])
        face_roi = self._align_face(frame, target)
        if face_roi is None:
            return None

        raw_emotion, raw_conf, all_emotions = self._emotion_clf.predict(face_roi)
        emotion, confidence = self._emotion_vote(raw_emotion, raw_conf)
        self._log_emotion_diag(raw_emotion, raw_conf, emotion, confidence, all_emotions)
        return {
            "emotion": emotion,
            "confidence": confidence,
            "all_emotions": all_emotions,
            "person_name": self._owner_name,
            "is_owner": True,
            "face_count": len(all_faces),
            "face_box": target["box"],
            "face_score": target["score"],
        }

    def _pipeline_sync(self, frame) -> Optional[dict]:
        """
        Owner-priority pipeline:
          1. Detect ALL faces
          2. If embedder available: identify each face, find owner
          3. Pick target: owner if present, else largest face
          4. Run emotion on the selected target only
        """
        self._vision_log_counter += 1

        if not self._is_frame_sharp(frame):
            if self._vision_log_counter % 20 == 1:
                logger.debug("[CAM] blurry frame skipped (counter=%d)", self._vision_log_counter)
            return None

        frame = self._enhance_low_light(frame)
        all_faces = self._face_detector.detect(frame)

        if self._vision_log_counter % 20 == 1:
            h, w = frame.shape[:2]
            logger.info("[CAM] frame %dx%d, faces=%d (counter=%d)",
                        w, h, len(all_faces), self._vision_log_counter)

        if not all_faces:
            return None

        target_face = None
        target_name = "unknown"
        target_is_owner = False
        owner_found = False

        if self._face_embedder and self._known_faces:
            for face in all_faces:
                x, y, w, h = face["box"]
                roi = frame[y:y + h, x:x + w]
                if roi.size == 0:
                    continue
                try:
                    qvec = self._face_embedder.get_embedding(roi)
                    best_name, best_sim = "unknown", -1.0
                    for name, kvec in self._known_faces.items():
                        sim = float(np.dot(qvec, kvec))
                        if sim > best_sim:
                            best_sim = sim
                            best_name = name
                    if best_sim > self._match_threshold:
                        face["identity"] = best_name
                        face["similarity"] = best_sim
                        if best_name == self._owner_name:
                            target_face = face
                            target_name = best_name
                            target_is_owner = True
                            owner_found = True
                except Exception:
                    pass

        if target_face is None:
            target_face = max(all_faces, key=lambda f: f["box"][2] * f["box"][3])
            target_name = target_face.get("identity", "unknown")
            target_is_owner = (target_name == self._owner_name)

            # Fallback: no embedder OR no one enrolled yet -> with a single
            # face in view we have nothing to compare against, so treat it
            # as the owner. This avoids stranger reflexes firing before any
            # enrollment has happened.
            if (not self._face_embedder or not self._known_faces) \
                    and len(all_faces) == 1:
                target_name = self._owner_name
                target_is_owner = True

        face_roi = self._align_face(frame, target_face)
        if face_roi is None:
            return None

        raw_emotion, raw_conf, all_emotions = self._emotion_clf.predict(face_roi)
        emotion, confidence = self._emotion_vote(raw_emotion, raw_conf)
        self._log_emotion_diag(raw_emotion, raw_conf, emotion, confidence, all_emotions)

        return {
            "emotion": emotion,
            "confidence": confidence,
            "all_emotions": all_emotions,
            "person_name": target_name,
            "is_owner": target_is_owner,
            "face_count": len(all_faces),
            "face_box": target_face["box"],
            "face_score": target_face["score"],
        }

    async def _publish_results(self, result: Optional[dict]) -> None:
        """Publish events with owner lifecycle tracking.
        Uses _no_face_streak counter to prevent arrived/left flapping:
        only declare 'left' after _lost_threshold consecutive empty frames."""
        if result:
            self._no_face_streak = 0
            is_owner = result["is_owner"]
            person_name = result["person_name"]

            self._state.update(
                current_emotion=result["emotion"],
                emotion_confidence=result["confidence"],
                person_present=True,
                owner_present=is_owner,
            )
            self._state.update_person(name=person_name, is_owner=is_owner)
            if is_owner:
                self._state.update(owner_last_seen=time.time())

            await self._bus.publish(Events.EMOTION_DETECTED, {
                "emotion": result["emotion"],
                "confidence": result["confidence"],
                "is_owner": is_owner,
                "person_name": person_name,
                "face_count": result["face_count"],
            })

            if person_name != "unknown":
                await self._bus.publish(Events.PERSON_IDENTIFIED, {
                    "name": person_name,
                    "is_owner": is_owner,
                })

            if is_owner and not self._owner_was_present:
                self._owner_was_present = True
                self._state.update(owner_last_arrival_time=time.time())
                logger.info("Owner arrived: %s", person_name)
                await self._bus.publish(Events.OWNER_ARRIVED, {"name": person_name})

            self._any_person_was_present = True
        else:
            self._no_face_streak += 1
            if self._no_face_streak < self._lost_threshold:
                return

            if self._owner_was_present:
                self._owner_was_present = False
                self._state.update(owner_present=False,
                                   owner_last_departure_time=time.time())
                logger.info("Owner left view (after %d empty frames)", self._no_face_streak)
                await self._bus.publish(Events.OWNER_LEFT, {})

            if self._any_person_was_present:
                self._any_person_was_present = False
                self._state.update(person_present=False)
                self._state.update_person(is_owner=False)
                await self._bus.publish(Events.PERSON_LOST, {})

    # ══════════════════════════════════════════════
    #  SIMULATION MODE
    # ══════════════════════════════════════════════

    async def _sim_perception_loop(self) -> None:
        """Camera-less fallback loop.

        Default is QUIET: no fake emotion / stranger / owner-arrived events.
        Running these previously polluted the LLM context (random [emotion]
        tags on STT input, spurious proactive replies, stranger reflexes
        while no camera was attached at all). Set vision.sim_events=true in
        config to restore the old noisy simulation for testing.
        """
        sim_cfg = self._cfg.get("sim", {}) or {}
        emit_events = bool(sim_cfg.get("events", False))
        if not emit_events:
            logger.info(
                "[SIM] Vision loop started (quiet, no fake events). "
                "Set vision.sim.events=true in config to enable.")
            while self._state.is_running:
                await asyncio.sleep(1.0)
            return

        logger.info("[SIM] Vision loop started (owner=%s, random emotion ~4s)", self._owner_name)
        cycle = 0
        while self._state.is_running:
            await asyncio.sleep(4.0 + random.uniform(-1, 1))
            if self._pause_perception:
                continue
            cycle += 1

            name = random.choice(SIM_NAMES)
            is_owner = (name == self._owner_name)
            emotion = random.choice(EMOTIONS)
            confidence = random.uniform(0.5, 0.95)

            self._state.update(
                current_emotion=emotion, emotion_confidence=confidence,
                person_present=True, owner_present=is_owner,
            )
            self._state.update_person(name=name, is_owner=is_owner)

            tag = "OWNER" if is_owner else "stranger"
            logger.info("[SIM] %s [%s] emotion: %s (%.0f%%)", name, tag, emotion, confidence * 100)
            await self._bus.publish(Events.EMOTION_DETECTED, {
                "emotion": emotion, "confidence": confidence,
                "is_owner": is_owner, "person_name": name, "face_count": 1,
            })

            if is_owner and not self._owner_was_present:
                self._owner_was_present = True
                await self._bus.publish(Events.OWNER_ARRIVED, {"name": name})

            if cycle % 6 == 0 and self._owner_was_present:
                self._owner_was_present = False
                self._state.update(owner_present=False)
                logger.info("[SIM] Owner left view")
                await self._bus.publish(Events.OWNER_LEFT, {})

    # ══════════════════════════════════════════════
    #  ENROLLMENT API -- called by EnrollmentService
    # ══════════════════════════════════════════════

    @property
    def can_enroll(self) -> bool:
        return (not self._sim_mode
                and self._cap is not None
                and self._face_detector is not None
                and self._face_embedder is not None)

    async def capture_embeddings(self, num_samples: int = 10,
                                 interval: float = 0.3) -> list:
        """Capture face embeddings for enrollment. Returns list of np.ndarray."""
        if not self.can_enroll:
            logger.warning("Cannot capture embeddings: camera or models not ready")
            return []

        loop = asyncio.get_running_loop()
        embeddings = []
        attempts = 0
        max_attempts = num_samples * 10

        while len(embeddings) < num_samples and attempts < max_attempts:
            attempts += 1
            ret, frame = await loop.run_in_executor(None, self._grab_frame)
            if not ret:
                await asyncio.sleep(0.05)
                continue

            emb = await loop.run_in_executor(
                None, self._extract_single_embedding, frame)
            if emb is not None:
                embeddings.append(emb)
                logger.info("Enrollment sample %d/%d captured", len(embeddings), num_samples)

            await asyncio.sleep(interval)

        return embeddings

    def _extract_single_embedding(self, frame):
        """Detect the largest face and return its embedding vector, or None."""
        faces = self._face_detector.detect(frame)
        if not faces:
            return None
        best = max(faces, key=lambda f: f["box"][2] * f["box"][3])
        x, y, w, h = best["box"]
        roi = frame[y:y + h, x:x + w]
        if roi.size == 0:
            return None
        try:
            return self._face_embedder.get_embedding(roi)
        except Exception as e:
            logger.debug("Embedding extraction failed: %s", e)
            return None

    def reload_face_db(self) -> None:
        """Hot-reload face database from disk after new enrollment."""
        self._known_faces.clear()
        self._load_face_db()
        logger.info("Face DB reloaded: %d faces", len(self._known_faces))

    def _apply_owner_override_from_file(self) -> None:
        """Read assets/faces_db/OWNER.txt (if present) to override config.owner.name.
        Enrollment writes this file after a user confirms 'yes I am the owner'."""
        try:
            owner_file = Path(self._face_db_path) / "OWNER.txt"
            if owner_file.exists():
                content = owner_file.read_text(encoding="utf-8").strip()
                if content:
                    logger.info("Owner override from OWNER.txt: %s -> %s",
                                self._owner_name, content)
                    self._owner_name = content
        except Exception:
            logger.exception("Failed to apply owner override from OWNER.txt")

    def reload_owner(self) -> None:
        """Re-read OWNER.txt after enrollment persists a new owner name.
        Updates identification thresholds instantly without a restart."""
        self._apply_owner_override_from_file()
        logger.info("Owner reloaded: %s", self._owner_name)

    def pause(self) -> None:
        """Pause perception loop (for enrollment capture)."""
        self._pause_perception = True
        logger.info("Perception loop paused")

    def resume(self) -> None:
        """Resume perception loop after enrollment."""
        self._pause_perception = False
        logger.info("Perception loop resumed")

    async def close(self) -> None:
        if self._cap and hasattr(self._cap, "release"):
            self._cap.release()
        logger.info("Camera closed")
