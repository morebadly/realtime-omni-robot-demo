# Assets placeholders (weights excluded)

This export does not include ONNX weights, STT/KWS packages, face embeddings, photos, or recordings.

Expected layout (see `config.yaml.example` and `tools/download_models.py`):

- `assets/models/`
  - `face_detection_yunet_2023mar.onnx` — OpenCV Zoo YuNet
    https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx
  - `emotion-ferplus-8.onnx` — ONNX Model Zoo FER+
    https://github.com/onnx/models/raw/main/validated/vision/body_analysis/emotion_ferplus/model/emotion-ferplus-8.onnx
  - `enet_b2_8.onnx` / `enet_b0_8_va_mtl.onnx` — HSEmotion (manual; referenced by config)
  - `mobilefacenet.onnx` — optional identity embedder (manual; see download_models.py)
- `assets/stt_model/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17/`
  - from https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17.tar.bz2
  - `python tools/download_models.py --sense-voice`
- `assets/vad_model/silero_vad.onnx`
  - https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/silero_vad.onnx
  - `python tools/download_models.py --silero-vad`
- `assets/wake_word/` — place sherpa-onnx KWS zipformer files and `my_keywords.txt`
- `assets/faces_db/` — enroll locally with `python tools/enroll_face.py --name YourName` (do not commit embeddings)

ESP32 firmware (`esp32_cerebellum.ino` and related headers) is not in this Orange Pi source tree.
