# Provider Camera Dry-run v1.3.3

v1.3.3 adds a camera upload experiment gate and local dry-run JPEG validator. It is not real provider media upload.

## Result Shape

```js
{
  providerId: 'dashscope_qwen_omni',
  mode: 'camera_dry_run',
  status: 'disabled' | 'mock_not_required' | 'unconfigured' | 'blocked' | 'ready_for_camera_dry_run' | 'camera_dry_run_ok' | 'camera_dry_run_failed',
  canSendRealCamera: false,
  canSendDryRunCameraPayload: true,
  canSendAudio: false,
  canStartRealtime: false,
  canStartBillingSession: false,
  fallbackProviderId: 'localdev_mock',
  reasons: []
}
```

`canSendRealCamera` remains false even when dry-run validation is allowed.

## Dry-run Payload Validation

The validator checks only local shape:

- schema is `omni.camera_frame.v1`.
- content type is `image/jpeg`.
- `payloadEncoding` is `base64`.
- `payloadIncluded` is explicit and true.
- payload is present.
- `byteLength` is positive and within the dry-run limit.
- optional `width` and `height` are positive when present.

The validator returns `persisted=false`, `uploaded=false`, and `sentToProvider=false`.

## What It Does Not Do

- It does not send camera frames to a real provider.
- It does not upload audio.
- It does not open a realtime socket.
- It does not start billing.
- It does not connect `reply_text` to TTS.
- It does not change interrupt semantics.
