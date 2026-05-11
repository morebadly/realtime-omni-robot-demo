# Release Notes v1.3.1

## Summary

v1.3.1 adds Provider Handshake dry-run state and ready/error/fallback event contracts while keeping the demo safe Mock-first.

## Added

- Runtime `providerHandshake` result schema.
- Provider handshake diagnostic events.
- `test:provider-handshake`, included in the smoke suite.
- UI-visible handshake status in Model Provider, Visible Context, and Omni Session panels.
- Provider handshake documentation.

## Safety Boundary

- No real realtime socket is opened.
- No microphone PCM is uploaded to a real provider.
- No camera JPEG is uploaded to a real provider.
- No realtime billing session is started.
- No real TTS is connected.
- LocalDev Mock remains the fallback.
