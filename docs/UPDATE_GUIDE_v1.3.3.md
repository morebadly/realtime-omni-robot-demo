# Update Guide v1.3.3

## What Changed

v1.3.3 adds a local-only Provider Camera Dry-run Gate. It validates camera frame payload shape for future provider experiments without sending media to a real provider.

## Commands

```bash
npm install
npm run verify
```

Run only the new smoke test:

```bash
npm run test:provider-camera-gate
```

## Configuration

- The default provider remains `localdev_mock`.
- Real providers remain disabled by default.
- `allowCameraUpload=false` keeps camera dry-run blocked.
- `allowCameraUpload=true` with `camera_dry_run` can become ready for local validation.
- `allowAudioUpload` and `allowRealtimeBilling` remain separate and blocked by default.

## Safety Notes

v1.3.3 does not send real camera frames to a provider, does not upload audio, does not open a realtime socket, does not start billing, and does not connect TTS. `reply_text` remains subtitles/log/debug only.
