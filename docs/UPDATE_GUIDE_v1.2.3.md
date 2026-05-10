# Update Guide v1.2.3

## Scope

Use this guide when updating from v1.2.2 to v1.2.3.

v1.2.3 expands LocalDev Adapter Contract test coverage. It does not add real provider traffic, real cloud APIs, real hardware, real email, real AC, real TTS, or automatic VAD/AEC barge-in.

## Steps

```cmd
cd /d C:\Users\Administrator\Desktop\realtime-omni-robot-demo
```

```bash
npm install
npm run verify
```

## New Test

```bash
npm run test:localdev-contract-matrix
```

This test starts the safe local Mock Server on a temporary port and verifies the contract matrix for:

- input packet lifecycle
- audio media ack
- camera media ack
- output state
- output turn
- reply audio frame
- explicit interrupt
- malformed message
- unsupported schema

## Notes

- The test uses local mock WebSocket processes only.
- `reply_text` remains subtitles/log/debug only.
- `audio_frame` remains input media, not interrupt.
- `reply_audio_frame` remains output media, not user input.
