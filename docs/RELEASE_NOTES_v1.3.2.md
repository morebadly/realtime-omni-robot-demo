# Release Notes v1.3.2

## Summary

v1.3.2 adds a Provider Audio Dry-run Gate and local `omni.audio_frame.v1` payload validation while keeping the demo safe Mock-first.

## Added

- Runtime `providerAudioGate` result schema.
- Local-only dry-run audio payload validator.
- `test:provider-audio-gate`, included in the smoke suite.
- UI-visible audio dry-run gate status in Model Provider, Visible Context, and Omni Session panels.
- Provider audio dry-run documentation.

## Safety Boundary

- No real audio is uploaded to a provider.
- No camera JPEG is uploaded.
- No realtime socket is opened.
- No realtime billing session is started.
- No real TTS is connected.
- LocalDev Mock remains the fallback.
