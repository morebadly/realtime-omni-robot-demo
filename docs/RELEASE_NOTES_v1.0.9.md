# Release Notes v1.0.9

## Summary

v1.0.9 upgrades the LocalDev media channel from audio metadata to real browser microphone PCM chunk sending.

## Added

- `RealtimeAudioPanel` now captures PCM Float32 microphone samples.
- `omni.audio_frame.v1` can include a base64 encoded PCM payload.
- Audio frames include `payloadIncluded`, `payloadEncoding`, `byteLength`, `sampleCount`, `durationMs`, and `channels`.
- LocalDev Mock Server logs payload status and byte counts for media frames.
- Omni Session and Visible Context show the latest audio frame bytes and payload state.

## Still Mock / Not Production

- This is still a LocalDev JSON-envelope bridge, not a production realtime audio transport.
- There is no real Qwen2.5-Omni inference yet.
- There is no reply audio stream playback yet.
- There is no interrupt / barge-in yet.

## Verification

Run the mock server:

```bash
npm run mock:localdev
```

Run the Vite app in another terminal:

```bash
npm run dev
```

In the browser:

1. Click “发送到 LocalDev Adapter” once to establish the WebSocket bridge.
2. Start realtime audio.
3. The mock server should print audio frames with `payload=yes` and `bytes > 0`.
