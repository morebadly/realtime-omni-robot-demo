# Release Notes v1.3.3

## Provider Camera Dry-run Gate

v1.3.3 adds a Provider Camera Dry-run Gate and local `omni.camera_frame.v1` JPEG payload validation while keeping the demo safe Mock-first.

## Added

- Runtime `providerCameraGate` result schema.
- Local dry-run camera payload validator.
- `test:provider-camera-gate` smoke coverage.
- UI-visible camera dry-run gate status in Model Provider, Visible Context, and Omni Session panels.
- Provider camera dry-run documentation.

## Safety Boundary

- No real camera frame is uploaded or sent to a provider.
- No real audio upload is enabled.
- No realtime socket or billing session is opened.
- No TTS path is connected to `reply_text`.
- LocalDev Mock fallback remains required.
