# CyberPet OS source export manifest

- generated_utc: 2026-10-26T13:58:45Z
- python_files: 24
- syntax_check: ast.parse OK (24 files)
- original_config.yaml: excluded

## Desensitized files (export copies only; originals untouched)

- cognition/enrollment_service.py
- cognition/llm_agent.py
- config.yaml.example

## File list

| path | bytes | sha256 |
| --- | ---: | --- |
| assets/README.md | 1505 | f8e8afaca9f9e808c4c8e46d75e69bb8ff808828c9a239ce9e8a9b6adcbcb197 |
| assets/animations/.gitkeep | 0 | e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855 |
| assets/faces_db/.gitkeep | 0 | e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855 |
| assets/models/.gitkeep | 0 | e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855 |
| assets/stt_model/.gitkeep | 0 | e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855 |
| assets/vad_model/.gitkeep | 0 | e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855 |
| assets/wake_word/.gitkeep | 0 | e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855 |
| assets/wake_word/my_keywords.txt.example | 40 | 3ca266007cf17a2eb366f31cb20a28ac9c2751d21752d2d39c37cac2d26eaa13 |
| cognition/__init__.py | 0 | e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855 |
| cognition/behavior_engine.py | 25983 | 103923a0d1641d4496ee469b63756c6ddd2ab74ab2b13fbfb1997e1ef31ea5ee |
| cognition/dialog_manager.py | 5357 | 59ef02a7f4d094f1421d25da010f26f19ac554225a0a9e847c484436b0c169d1 |
| cognition/enrollment_service.py | 15751 | 10a45b152586ef193e854798e8c1c2dce2bad106ee3ce374a44121411e0346ae |
| cognition/fatigue_sensor.py | 5545 | 5af552defe6ee8db5b20d2e7c647d5ee49c174f84063440287f67c50c99e13a2 |
| cognition/gateway_openclaw.py | 2713 | bd1ebb573fb42d540ff2ec7640cc2aa5c34b49a04b3e50e0f52605dfa717362f |
| cognition/llm_agent.py | 62838 | f5b7ec13e84d3c83574cd84b207462a71598572a91a8242f2f50f4446259e9de |
| cognition/memory_store.py | 6250 | 89ab3d9a46891c266ab08a50f973dc75f8e49415b83e01f0d9feb4742eb0b166 |
| config.yaml.example | 16628 | 428f89e6c3d996a0e0a87a90da2e7ac195a01ce9f42e14be86edd2d19e964bb6 |
| core/__init__.py | 0 | e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855 |
| core/event_bus.py | 3800 | 0c7adadc8063ed15b43c4d37bdb6a823ecaafeebdd295a98615101190bcf6562 |
| core/priority_arbiter.py | 2102 | 458a74b8cf11253f94737ff3542c8f99650b8d07235b5656539212a94e0628d1 |
| core/serial_bridge.py | 16988 | dba67b1cce0438b0ea78f92d808d43cfa3b9cd63806ccceaccea1d616a37c052 |
| core/shared_state.py | 3580 | e46101d54a02bddfedb5830878a205622e8cd166d339b8f1cc8db0f1dc0a26b3 |
| expression/__init__.py | 0 | e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855 |
| expression/eye_display.py | 4721 | 5f10331de95e4a0b63afd59a85d345c2549ba9f6772425ba933a58e08e323676 |
| expression/motion_command.py | 3432 | 966f1502e5e9220b228e269938aae6e8017e66658f9b4af126207081c8352967 |
| expression/tts_speaker.py | 40528 | 8d91cc2da4090a8ec0808eda6f93c0a52244b0f432935689ac24fcb1a02f48c3 |
| main_brain.py | 8973 | 28afc1c85a460a5664448214b522445d3e76b584290f56db04bd9597b864307a |
| perception/__init__.py | 0 | e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855 |
| perception/audio_input.py | 43979 | 371ad9897ed8481eeea621fa0ee3ebc14c7fa2ace6ba012282d234c84144c4cf |
| perception/camera_vision.py | 39510 | 0ebc1efe4fb009b6f2fe46bcaf9c867d27e69617b2b913abdb1fda2c3ff8fc1b |
| perception/touch_handler.py | 2263 | 759f38689395c9fd796cc0ca382ab2c60df97d3a7e1b66c49472ba6378758941 |
| requirements.txt | 1632 | 3829699986d8400cbb3720fa52941191bfaf1e66eaf36865e87c09303e05b6e9 |
| tools/download_models.py | 8182 | 6323bb0e1978ddd94c8402da8c8254e001590753958ee7138d68d1293462071c |
| tools/enroll_face.py | 6907 | 2cabbab88bc71f3e6584d051f679b7161d0f68518db27ed017e5ef9a17fdb29b |

## Excluded from this archive

- venv/, venvsource/
- .git/, .cursor/
- __pycache__/, *.pyc, logs
- data/ (memory / chroma databases)
- assets/faces_db embeddings, photos, OWNER.txt
- recordings, ONNX/STT/KWS weights, private keys
- original config.yaml (secrets)
- ESP32 firmware (not present in this tree)

