# Release Notes v1.3.0

## Summary

v1.3.0 adds Provider Health Check preflight for future real providers while keeping the runtime safe Mock-first.

## Added

- Runtime `providerHealthCheck` result schema.
- `test:provider-health-check`, included in the smoke suite.
- Dry-run/config-only DashScope health command.
- UI-visible provider health status in Model Provider, Visible Context, and Omni Session panels.
- Provider health-check documentation.

## Safety Boundary

- No real realtime Omni session is opened.
- No microphone PCM is uploaded to a real provider.
- No camera JPEG is uploaded to a real provider.
- No realtime billing session is started.
- No real TTS is connected.
- LocalDev Mock remains the fallback.
