"""
Model downloader -- downloads all required ONNX models for CyberPet pipelines.

Usage:
    python tools/download_models.py
    python tools/download_models.py --sense-voice   # also pull sense-voice STT (~200MB)

Downloads to assets/models/:
  1. face_detection_yunet_2023mar.onnx  (~220KB)  -- face detection
  2. emotion-ferplus-8.onnx             (~35MB)   -- emotion classification
  3. mobilefacenet.onnx                 (~5MB)    -- face identity embedding (optional)

Downloads to assets/stt_model/:
  4. sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17  (~200MB) -- offline STT
"""

import os
import sys
import tarfile
import hashlib
from pathlib import Path
from urllib.request import urlretrieve

MODELS_DIR = Path(__file__).parent.parent / "assets" / "models"
STT_DIR = Path(__file__).parent.parent / "assets" / "stt_model"
VAD_DIR = Path(__file__).parent.parent / "assets" / "vad_model"

SENSE_VOICE_NAME = "sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17"
SENSE_VOICE_URL = (
    "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/"
    f"{SENSE_VOICE_NAME}.tar.bz2"
)

# Silero VAD ONNX (~2MB) -- neural voice activity detector, dramatically
# improves endpoint detection in noisy environments.
SILERO_VAD_URLS = [
    # Official sherpa-onnx mirror
    "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/silero_vad.onnx",
    # hf-mirror fallback for China users
    "https://hf-mirror.com/csukuangfj/silero-vad-onnx/resolve/main/silero_vad.onnx",
]

MODELS = [
    {
        "name": "face_detection_yunet_2023mar.onnx",
        "url": "https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx",
        "description": "YuNet face detector (OpenCV Zoo)",
        "required": True,
    },
    {
        "name": "emotion-ferplus-8.onnx",
        "url": "https://github.com/onnx/models/raw/main/validated/vision/body_analysis/emotion_ferplus/model/emotion-ferplus-8.onnx",
        "description": "FER+ emotion classifier (ONNX Model Zoo)",
        "required": True,
    },
    {
        "name": "mobilefacenet.onnx",
        "url": "",
        "description": "MobileFaceNet face embedder (for identity recognition)",
        "required": False,
        "manual_instructions": (
            "MobileFaceNet ONNX model is not hosted on a single official URL.\n"
            "Options:\n"
            "  a) pip install insightface && python -c \"\n"
            "     from insightface.app import FaceAnalysis;\n"
            "     app = FaceAnalysis(name='buffalo_sc');\n"
            "     app.prepare(ctx_id=-1)\"  -- then copy w600k_mbf.onnx\n"
            "  b) Export from PyTorch: github.com/deepinsight/insightface/tree/master/recognition\n"
            "  c) Search 'mobilefacenet.onnx' on Hugging Face / GitHub\n"
            "Place the file as: assets/models/mobilefacenet.onnx"
        ),
    },
]


def download_file(url: str, dest: Path) -> bool:
    print(f"  Downloading: {url}")
    print(f"  Target:      {dest}")
    try:
        def progress(block_num, block_size, total_size):
            downloaded = block_num * block_size
            if total_size > 0:
                pct = min(100, downloaded * 100 // total_size)
                mb = downloaded / 1024 / 1024
                total_mb = total_size / 1024 / 1024
                print(f"\r  Progress: {mb:.1f}/{total_mb:.1f} MB ({pct}%)", end="", flush=True)

        urlretrieve(url, str(dest), reporthook=progress)
        print(f"\n  OK! ({dest.stat().st_size / 1024:.0f} KB)")
        return True
    except Exception as e:
        print(f"\n  FAILED: {e}")
        if dest.exists():
            dest.unlink()
        return False


def download_silero_vad() -> bool:
    """Download Silero VAD ONNX (~2MB) with mirror fallback."""
    VAD_DIR.mkdir(parents=True, exist_ok=True)
    dest = VAD_DIR / "silero_vad.onnx"
    if dest.exists():
        print(f"[silero-vad] Already exists at {dest} -- SKIP")
        return True
    for url in SILERO_VAD_URLS:
        print(f"[silero-vad] Trying {url}")
        try:
            urlretrieve(url, str(dest))
            size_kb = dest.stat().st_size / 1024
            print(f"  OK ({size_kb:.0f} KB) -> {dest}")
            return True
        except Exception as e:
            print(f"  FAILED: {e}")
            if dest.exists():
                dest.unlink()
    print("[silero-vad] All mirrors failed. Manual: "
          "put silero_vad.onnx under assets/vad_model/")
    return False


def download_sense_voice() -> bool:
    """Download + extract SenseVoice-small sherpa-onnx package (~200MB)."""
    STT_DIR.mkdir(parents=True, exist_ok=True)
    target_dir = STT_DIR / SENSE_VOICE_NAME
    if (target_dir / "model.int8.onnx").exists():
        print(f"[sense-voice] Already extracted at {target_dir} -- SKIP")
        return True

    archive = STT_DIR / f"{SENSE_VOICE_NAME}.tar.bz2"
    print(f"[sense-voice] Downloading ~200MB from GitHub Releases...")
    print(f"  URL:    {SENSE_VOICE_URL}")
    print(f"  Target: {archive}")
    try:
        def progress(block_num, block_size, total_size):
            downloaded = block_num * block_size
            if total_size > 0:
                pct = min(100, downloaded * 100 // total_size)
                mb = downloaded / 1024 / 1024
                total_mb = total_size / 1024 / 1024
                print(f"\r  Progress: {mb:.1f}/{total_mb:.1f} MB ({pct}%)",
                      end="", flush=True)
        urlretrieve(SENSE_VOICE_URL, str(archive), reporthook=progress)
        print("\n  Extracting...")
        with tarfile.open(archive, "r:bz2") as tf:
            tf.extractall(path=str(STT_DIR))
        print(f"  OK -> {target_dir}")
        return True
    except Exception as e:
        print(f"\n  FAILED: {e}")
        if archive.exists():
            archive.unlink()
        return False
    finally:
        if archive.exists():
            try:
                archive.unlink()
            except Exception:
                pass


def main():
    print("=" * 60)
    print("  CyberPet OS -- ONNX Model Downloader")
    print("=" * 60)
    print()

    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Models directory: {MODELS_DIR.resolve()}\n")

    success = 0
    failed = 0
    skipped = 0

    for model in MODELS:
        name = model["name"]
        dest = MODELS_DIR / name
        print(f"[{name}]")
        print(f"  {model['description']}")

        if dest.exists():
            size_kb = dest.stat().st_size / 1024
            print(f"  Already exists ({size_kb:.0f} KB) -- SKIP")
            skipped += 1
            print()
            continue

        if model["url"]:
            ok = download_file(model["url"], dest)
            if ok:
                success += 1
            else:
                failed += 1
        else:
            print(f"  No auto-download URL available.")
            if "manual_instructions" in model:
                print(f"  {model['manual_instructions']}")
            if model["required"]:
                failed += 1
            else:
                skipped += 1
        print()

    if "--sense-voice" in sys.argv:
        print()
        print(f"STT directory: {STT_DIR.resolve()}")
        if download_sense_voice():
            success += 1
        else:
            failed += 1
        print()

    if "--silero-vad" in sys.argv:
        print()
        print(f"VAD directory: {VAD_DIR.resolve()}")
        if download_silero_vad():
            success += 1
        else:
            failed += 1
        print()

    print("=" * 60)
    print(f"  Done! Downloaded: {success}, Skipped: {skipped}, Failed: {failed}")
    if failed > 0:
        print("  WARNING: Some required models failed to download.")
        print("  Relevant subsystem will fall back to simulation mode.")
    tips = []
    if "--sense-voice" not in sys.argv:
        tips.append("--sense-voice (offline STT, ~200MB)")
    if "--silero-vad" not in sys.argv:
        tips.append("--silero-vad (neural VAD, ~2MB)")
    if tips:
        print("  TIP: rerun with: " + " ".join(tips))
    print("=" * 60)


if __name__ == "__main__":
    main()
