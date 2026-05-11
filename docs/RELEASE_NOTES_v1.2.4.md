# Release Notes v1.2.4

## Summary

v1.2.4 adds Provider Gate preparation for future real Omni providers while keeping the project safe Mock-only.

## Added

- Runtime provider gate schema and evaluator.
- `.env.example` placeholders for provider selection, mode, endpoint, key presence, upload flags, billing flag, and fallback provider.
- `test:provider-config-gate`, included in the safe smoke suite.
- UI-visible Provider Gate status in the Model Provider panel and Visible Context.
- `docs/PROVIDER_GATE.md`.

## Safety Boundary

- No real Qwen/DashScope realtime session is opened.
- No real cloud API call is made by the app.
- No microphone PCM or camera JPEG is uploaded to a real provider.
- No real TTS is connected.
- LocalDev Mock remains the default and required fallback.
- `reply_text` remains subtitles/log/debug only.
