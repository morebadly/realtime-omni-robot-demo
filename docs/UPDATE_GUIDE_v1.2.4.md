# Update Guide v1.2.4

## Upgrade

```bash
npm install
npm run verify
```

## New Provider Gate Check

Run the new gate smoke test directly:

```bash
npm run test:provider-config-gate
```

It verifies that:

- default provider remains LocalDev Mock.
- real providers are blocked when disabled.
- missing API key is visible as unconfigured.
- audio upload requires `allowAudioUpload`.
- camera upload requires `allowCameraUpload`.
- realtime billing/session requires `allowRealtimeBilling`.
- fallback provider remains `localdev_mock`.
- `health_check_only` cannot send media frames.

## Environment Placeholders

Copy `.env.example` only as a local reference. Do not commit real secrets.

```bash
OMNI_PROVIDER=localdev_mock
OMNI_PROVIDER_ENABLED=false
OMNI_PROVIDER_MODE=mock
OMNI_PROVIDER_ENDPOINT=
OMNI_PROVIDER_API_KEY=
OMNI_ALLOW_AUDIO_UPLOAD=false
OMNI_ALLOW_CAMERA_UPLOAD=false
OMNI_ALLOW_REALTIME_BILLING=false
OMNI_FALLBACK_PROVIDER=localdev_mock
```

This version does not use these placeholders to open real provider calls. Future real provider work should keep secrets outside the frontend bundle.

## Still Mock-Only

v1.2.4 does not connect real Qwen/DashScope realtime, does not upload microphone/camera media, does not start billable realtime sessions, and does not add real TTS.
