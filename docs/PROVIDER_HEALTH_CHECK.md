# Provider Health Check v1.3.3

## v1.3.3 Relationship To Camera Dry-run

Provider Health Check remains read-only preflight. Provider Camera Dry-run builds on Provider Gate and may validate a local `omni.camera_frame.v1` JPEG payload shape, but it does not upload or send camera media to a real provider.

Health check, handshake, audio dry-run, and camera dry-run all keep realtime socket creation, real audio upload, real camera upload, billing, and TTS disabled.

## v1.3.2 Relationship To Audio Dry-run

Provider Health Check remains read-only preflight. Provider Audio Dry-run builds on Provider Gate and may validate a local `omni.audio_frame.v1` payload shape, but it does not upload or send audio to a real provider.

Health check, handshake, and audio dry-run all keep realtime socket creation, camera upload, billing, and TTS disabled.

## v1.3.1 Relationship To Handshake

Provider Health Check remains read-only preflight. Provider Handshake builds on its result but stays dry-run only:

- health check may become `ready_for_health_check`.
- handshake may become `ready_for_handshake` or `handshake_dry_run_ok`.
- neither layer opens a real realtime socket, sends audio/camera media, starts billing, or connects TTS.

v1.3.0 adds a provider health-check preflight layer. It is intentionally not a realtime provider integration.

## Result Shape

```js
{
  providerId: 'dashscope_qwen_omni',
  mode: 'health_check_only',
  status: 'disabled' | 'mock_ready' | 'unconfigured' | 'blocked' | 'ready_for_health_check' | 'health_check_ok' | 'health_check_failed',
  canStartRealtime: false,
  canSendAudio: false,
  canSendCamera: false,
  canStartBillingSession: false,
  fallbackProviderId: 'localdev_mock',
  reasons: []
}
```

The four capability booleans remain false in v1.3.0, even when a configuration is ready for health checking.

## What It Checks

- provider enabled/disabled state.
- endpoint configured state.
- API key configured state.
- Provider Gate block reasons.
- mode must be `health_check_only` for a real provider health preflight.
- fallback provider remains `localdev_mock`.

## What It Does Not Do

- It does not send `omni.audio_frame.v1` to a real provider.
- It does not send `omni.camera_frame.v1` to a real provider.
- It does not open a billable realtime session.
- It does not connect `reply_text` to TTS.
- It does not replace LocalDev Mock.

## CLI

```bash
npm run test:provider-health-check
npm run health:dashscope-omni
```

`health:dashscope-omni` is dry-run/config validation only in v1.3.0. It does not open a real WebSocket session.
