# Provider Handshake v1.3.1

v1.3.1 adds a provider handshake dry-run model. It is a Runtime/UI contract only and is not a real provider connection.

## Result Shape

```js
{
  providerId: 'dashscope_qwen_omni',
  mode: 'handshake_only',
  status: 'disabled' | 'blocked' | 'unconfigured' | 'ready_for_handshake' | 'handshake_dry_run_ok' | 'handshake_failed',
  canOpenRealtimeSocket: false,
  canSendAudio: false,
  canSendCamera: false,
  canStartBillingSession: false,
  fallbackProviderId: 'localdev_mock',
  events: [],
  reasons: []
}
```

The capability booleans remain false in v1.3.1, including in `ready_for_handshake` and `handshake_dry_run_ok`.

## Event Contract

- `provider.handshake.started`
- `provider.handshake.ready`
- `provider.handshake.blocked`
- `provider.handshake.failed`
- `provider.handshake.fallback`

These events are diagnostics for Runtime state, logs, and visible context. They must not trigger media upload, realtime socket creation, billing, or TTS.

## What It Checks

- provider enabled/disabled state.
- endpoint configured state.
- API key configured state.
- mode must be `handshake_only`.
- Provider Health Check and Provider Gate reasons.
- fallback provider remains `localdev_mock`.

## What It Does Not Do

- It does not open a real provider WebSocket.
- It does not send `omni.audio_frame.v1`.
- It does not send `omni.camera_frame.v1`.
- It does not start realtime billing.
- It does not connect `reply_text` to TTS.
