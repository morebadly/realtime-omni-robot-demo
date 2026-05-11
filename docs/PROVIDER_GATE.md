# Provider Gate v1.2.4

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
