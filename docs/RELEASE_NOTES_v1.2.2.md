# Release Notes v1.2.2

## Version Scope

v1.2.2 is the LocalDev Adapter disconnect and recovery stabilization release.

It remains a safe Mock demo. It does not connect real Omni providers, DashScope/Qwen realtime cloud APIs, real hardware, real email, real AC, real TTS, or automatic VAD/AEC barge-in.

## Added

- LocalDev bridge emits clearer recovery diagnostics for reconnecting, recovered, send failure, protocol warning/error, and disconnect-during-pending-output paths.
- Runtime session state can move through recovering after socket disconnect or send failure instead of staying stuck in model thinking/speaking.
- Realtime output channel clears queued reply audio frames on disconnect so RobotFace/speaking state can recover.
- Added LocalDev reconnect recovery smoke coverage for disconnect, reconnect, send failure, mid-output-stream disconnect, malformed message recovery, and unsupported schema recovery.

## Guardrails

- `omni.audio_frame.v1` does not automatically trigger interrupt.
- `omni.reply_audio_frame.v1` is output media and must not feed back as input.
- `reply_text` remains subtitle/log/debug context only and is not TTS input.
- Reconnect does not replay old `omni.input_packet.v1` automatically.

## Verified

- `npm run verify`
