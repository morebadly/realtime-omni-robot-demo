# Update Guide v1.2.2

## Scope

Use this guide when updating from v1.2.1 to v1.2.2.

v1.2.2 stabilizes LocalDev Adapter recovery behavior. It does not add real provider traffic, real hardware, real email, real AC, real TTS, or automatic VAD/AEC barge-in.

## Steps

```cmd
cd /d C:\Users\Administrator\Desktop\realtime-omni-robot-demo
```

```bash
npm install
npm run verify
```

## New Verification Coverage

`npm run test:localdev-reconnect-recovery` is included in the safe smoke suite. It uses only local mock WebSocket servers and pure Runtime helpers.

The test covers:

- socket disconnect and reconnect
- send failure while unreachable/disconnected
- mid-turn reply audio stream disconnect
- malformed message followed by a valid message
- unsupported schema followed by a valid message
- output queue cleanup after disconnect
- session recovery from disconnect/send failure

## Notes

- Reconnect does not replay old input packets automatically.
- Media sent during unavailable socket states must return explicit failure.
- `audio_frame` remains input media, not interrupt.
- `reply_text` remains subtitles/log/debug only, not TTS.
