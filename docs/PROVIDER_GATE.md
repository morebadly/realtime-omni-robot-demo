# Provider Gate v1.3.3

## v1.3.3 Camera Dry-run Boundary

Provider Gate now recognizes `camera_dry_run` as a preparation mode. This mode is still local-only:

- `allowCameraUpload=true` is required before dry-run payload validation can be ready.
- `canSendRealCamera` remains false.
- audio upload, realtime socket creation, and billing remain false.
- validation results must report `persisted=false`, `uploaded=false`, and `sentToProvider=false`.

## v1.3.2 Audio Dry-run Boundary

Provider Gate now recognizes `audio_dry_run` as a preparation mode. This mode is still local-only:

- `allowAudioUpload=true` is required before dry-run payload validation can be ready.
- `canSendRealAudio` remains false.
- camera upload, realtime socket creation, and billing remain false.
- validation results must report `persisted=false`, `uploaded=false`, and `sentToProvider=false`.

## v1.3.1 Handshake Dry-run Boundary

Provider Gate still blocks real provider traffic. v1.3.1 adds a handshake dry-run state above health check:

- `handshake_only` may report `ready_for_handshake` or `handshake_dry_run_ok`.
- `realtime_experimental` remains blocked.
- `canOpenRealtimeSocket`, `canSendAudio`, `canSendCamera`, and `canStartBillingSession` remain false.
- handshake events are diagnostic events only and do not send media frames.

## v1.3.0 Health Check Preflight

v1.3.0 keeps Provider Gate as the safety boundary and adds Provider Health Check as a read-only preflight layer. Health check results never start realtime sessions and always report:

- `canStartRealtime: false`
- `canSendAudio: false`
- `canSendCamera: false`
- `canStartBillingSession: false`

Allowed statuses are `disabled`, `mock_ready`, `unconfigured`, `blocked`, `ready_for_health_check`, `health_check_ok`, and `health_check_failed`. Failed or unconfigured providers must keep `fallbackProviderId: 'localdev_mock'`.

`health:dashscope-omni` is dry-run/config validation only in v1.3.0. It does not open a WebSocket session and does not upload media.

v1.2.4 is a configuration gate release. It does not connect to a real Omni provider and does not send real media to cloud services.

## Default Safe State

```js
providerConfig = {
  providerId: 'localdev_mock',
  enabled: false,
  mode: 'mock',
  endpointConfigured: false,
  apiKeyConfigured: false,
  allowAudioUpload: false,
  allowCameraUpload: false,
  allowRealtimeBilling: false,
  fallbackProviderId: 'localdev_mock',
  safety: {
    mockFallbackRequired: true,
    visibleContextRequired: true,
    permissionGateRequired: true
  }
}
```

Runtime normalizes LocalDev Mock as the active safe provider. Real provider entries such as `dashscope_qwen_omni` and `custom_realtime_omni` remain blocked until future versions explicitly enable health check, handshake, or realtime experiment modes.

## Guardrails

- Real microphone PCM upload is blocked unless a future version explicitly enables `allowAudioUpload`.
- Real camera JPEG upload is blocked unless a future version explicitly enables `allowCameraUpload`.
- Real realtime billing/session creation is blocked unless `allowRealtimeBilling` is explicitly enabled.
- `health_check_only` can describe readiness but cannot send media frames.
- `handshake_only` is reserved for connection/auth readiness, not media upload.
- Mock fallback must remain `localdev_mock`.
- Visible Context and Permission Gate are required for future real provider experiments.

## Secret Handling

`.env.example` contains placeholders only. Real secrets must not be committed and must not be exposed through frontend-readable Vite environment variables. Future real provider work should keep secrets server-side or inside a robot gateway, not inside the browser bundle.

## Omni Semantics

Provider Gate does not change the protocol:

- `omni.audio_frame.v1` is input media, not interrupt.
- `omni.camera_frame.v1` is camera keyframe media, not emotion labeling.
- `omni.interrupt.v1` is the explicit barge-in event.
- `omni.reply_audio_frame.v1` is output audio media and must not feed back into user input.
- `reply_text` is subtitles/log/debug/visible context only and is not TTS input.
