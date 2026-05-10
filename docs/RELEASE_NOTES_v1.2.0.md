# Release Notes v1.2.0

## Version Scope

v1.2.0 is the LocalDev Adapter Contract stable release.

It does not add a real Omni provider, real Qwen/DashScope traffic, real hardware, real email, real AC, real TTS, or automatic VAD/AEC barge-in. The release keeps the project safe and Mock-first while making the LocalDev realtime boundary easier to test and maintain.

## Added

- Stabilized the documented Runtime <-> Adapter schema list:
  `omni.input_packet.v1`, `omni.audio_frame.v1`, `omni.camera_frame.v1`, `omni.output_state.v1`, `omni.output_turn.v1`, `omni.reply_audio_frame.v1`, `omni.interrupt.v1`, and `cloudgenie.local_dev.media_ack.v1`.
- Strengthened LocalDev adapter contract smoke coverage for malformed messages, unsupported schemas, media frames before an active output turn, interrupt with no active turn, normal media ack, native reply audio, and explicit interrupt cancellation.
- Added Runtime output queue diagnostics for out-of-order reply audio frames while keeping duplicate frame dropping.
- Expanded `npm run verify` so the top-level verification command explicitly runs build, version doctor, adapter contract, realtime readiness, LocalDev preflight, and the safe smoke suite.

## Unchanged Guardrails

- `reply_text` remains subtitle/log/debug context only.
- `omni.reply_audio_frame.v1` remains native Omni output media, not generated from frontend TTS.
- `omni.audio_frame.v1` does not automatically trigger interrupt.
- `omni.interrupt.v1` remains the explicit manual barge-in control.
- Plugins still route through Permission Engine, Tool Engine, and Action Log.

## Verified

- `npm install`
- `npm run verify`
