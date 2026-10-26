"""
Face enrollment tool -- capture owner's face and save embedding to faces_db.

Usage:
    python tools/enroll_face.py --name master
    python tools/enroll_face.py --name master --camera 0 --samples 5

This script:
  1. Opens USB camera
  2. Detects face using YuNet
  3. Captures N samples, averages the embedding
  4. Saves as assets/faces_db/<name>.npy

Run this ONCE for each person you want the robot to recognize.
The owner's name must match config.yaml -> owner.name (default: "master").
"""

import argparse
import sys
from pathlib import Path

project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

try:
    import cv2
    import numpy as np
    import onnxruntime as ort
except Exception as e:
    print(f"ERROR: Missing dependency: {e}")
    print("Install: pip install opencv-python-headless numpy onnxruntime")
    sys.exit(1)

import yaml


def load_config():
    cfg_path = project_root / "config.yaml"
    if cfg_path.exists():
        with open(cfg_path, "r", encoding="utf-8") as f:
            return yaml.safe_load(f)
    return {}


def main():
    parser = argparse.ArgumentParser(description="CyberPet face enrollment")
    parser.add_argument("--name", required=True, help="Person name (use 'master' for owner)")
    parser.add_argument("--camera", type=int, default=0, help="Camera index")
    parser.add_argument("--samples", type=int, default=10, help="Number of face samples to average")
    args = parser.parse_args()

    config = load_config()
    vision_cfg = config.get("vision", {})
    models_dir = project_root / vision_cfg.get("models_dir", "assets/models")

    det_path = models_dir / vision_cfg.get("detector_model", "face_detection_yunet_2023mar.onnx")
    embed_path = models_dir / vision_cfg.get("face_embed_model", "mobilefacenet.onnx")

    if not det_path.exists():
        print(f"ERROR: Face detector model not found: {det_path}")
        print("Run: python tools/download_models.py")
        sys.exit(1)
    if not embed_path.exists():
        print(f"ERROR: Face embedder model not found: {embed_path}")
        print("You need mobilefacenet.onnx for face enrollment.")
        sys.exit(1)

    print(f"Loading models...")
    detector = cv2.FaceDetectorYN.create(str(det_path), "", (320, 320), score_threshold=0.7)
    embed_session = ort.InferenceSession(str(embed_path), providers=["CPUExecutionProvider"])
    embed_input = embed_session.get_inputs()[0]
    embed_h, embed_w = embed_input.shape[2], embed_input.shape[3]

    print(f"Opening camera {args.camera}...")
    cap = cv2.VideoCapture(args.camera)
    if not cap.isOpened():
        print(f"ERROR: Cannot open camera {args.camera}")
        sys.exit(1)

    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)

    print(f"\n=== Enrolling face: {args.name} ===")
    print(f"Please look at the camera. Capturing {args.samples} samples...")
    print("Press 'q' to abort.\n")

    has_gui = False
    try:
        test_win = "__enroll_probe__"
        cv2.namedWindow(test_win, cv2.WINDOW_NORMAL)
        cv2.destroyWindow(test_win)
        has_gui = True
    except Exception:
        print("(headless mode -- no GUI preview, capturing automatically)")

    embeddings = []
    frame_count = 0
    import time as _time

    while len(embeddings) < args.samples:
        ret, frame = cap.read()
        if not ret:
            continue
        frame_count += 1

        h, w = frame.shape[:2]
        detector.setInputSize((w, h))
        _, faces = detector.detect(frame)

        if faces is not None and len(faces) > 0:
            best = max(range(len(faces)), key=lambda i: faces[i][2] * faces[i][3])
            r = faces[best]
            x, y, fw, fh = int(r[0]), int(r[1]), int(r[2]), int(r[3])
            x, y = max(0, x), max(0, y)

            if frame_count % 5 == 0:
                face_roi = frame[y:y + fh, x:x + fw]
                if face_roi.size > 0:
                    resized = cv2.resize(face_roi, (embed_w, embed_h))
                    blob = resized.astype(np.float32).transpose(2, 0, 1) / 255.0
                    blob = (blob - 0.5) / 0.5
                    blob = np.expand_dims(blob, 0)
                    emb = embed_session.run(None, {embed_input.name: blob})[0][0]
                    norm = np.linalg.norm(emb)
                    if norm > 0:
                        emb = emb / norm
                    embeddings.append(emb)
                    print(f"  Sample {len(embeddings)}/{args.samples} captured")

            if has_gui:
                display = frame.copy()
                cv2.rectangle(display, (x, y), (x + fw, y + fh), (0, 255, 0), 2)
                cv2.putText(display, f"Samples: {len(embeddings)}/{args.samples}",
                            (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 0), 2)
                cv2.imshow(f"Enrolling: {args.name}", display)
                if cv2.waitKey(1) & 0xFF == ord('q'):
                    print("\nAborted by user.")
                    cap.release()
                    cv2.destroyAllWindows()
                    sys.exit(0)
        else:
            if has_gui:
                display = frame.copy()
                cv2.putText(display, "No face detected - look at camera",
                            (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)
                cv2.imshow(f"Enrolling: {args.name}", display)
                if cv2.waitKey(1) & 0xFF == ord('q'):
                    print("\nAborted by user.")
                    cap.release()
                    cv2.destroyAllWindows()
                    sys.exit(0)
            else:
                if frame_count % 30 == 0:
                    print("  No face detected, keep looking at the camera...")

        if not has_gui:
            _time.sleep(0.03)

    cap.release()
    if has_gui:
        cv2.destroyAllWindows()

    avg_embedding = np.mean(embeddings, axis=0)
    avg_embedding = avg_embedding / np.linalg.norm(avg_embedding)

    save_dir = project_root / vision_cfg.get("face_db_path", "assets/faces_db")
    save_dir.mkdir(parents=True, exist_ok=True)
    save_path = save_dir / f"{args.name}.npy"
    np.save(str(save_path), avg_embedding)

    owner_name = config.get("owner", {}).get("name", "master")
    is_owner = (args.name == owner_name)

    print(f"\n{'=' * 50}")
    print(f"  Face enrolled: {args.name}")
    print(f"  Saved to:      {save_path}")
    print(f"  Samples used:  {len(embeddings)}")
    print(f"  Is owner:      {'YES' if is_owner else 'NO'}")
    if not is_owner:
        print(f"  NOTE: To set as owner, edit config.yaml -> owner.name: \"{args.name}\"")
    print(f"{'=' * 50}")


if __name__ == "__main__":
    main()
