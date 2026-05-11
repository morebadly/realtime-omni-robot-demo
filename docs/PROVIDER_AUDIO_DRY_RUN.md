# Provider Audio Dry-run v1.3.2

v1.3.2 adds an audio upload experiment gate and local dry-run validator. It is not real provider media upload.

## Result Shape

```js
{
  providerId: 'dashscope_qwen_omni',
  mode: 'audio_dry_run',
  status: 'disabled' | 'mock_not_required' | 'unconfigured' | 'blocked' | 'ready_for_audio_dry_run' | 'audio_dry_run_ok' | 'audio_dry_run_failed',
  canSendRealAudio: false,
  canSendDryRunAudioPayload: true,
  canSendCamera: false,
  canStartRealtime: false,
  canStartBillingSession: false,
  fallbackProviderId: 'localdev_mock',
  reasons: []
}
```

`canSendRealAudio` remains false even when dry-run validation is allowed.

## Dry-run Payload Validation

The validator checks only local shape:

- schema is `omni.audio_frame.v1`.
- `sampleRate` exists and is positive.
- `channels` exists and is positive.
- `payloadEncoding` is `base64`.
- payload is included.
- `byteLength` is positive and within the dry-run limit.

The validator returns `persisted=false`, `uploaded=false`, and `sentToProvider=false`.

## What It Does Not Do

- It does not send audio to a real provider.
- It does not upload camera frames.
- It does not open a realtime socket.
- It does not start billing.
- It does not connect `reply_text` to TTS.
- It does not change interrupt semantics.
