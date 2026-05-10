# Release Notes v1.2.3

## Version Scope

v1.2.3 is the Adapter Contract test completion release.

It remains a safe Mock release. It does not connect real Omni providers, DashScope/Qwen cloud realtime, real hardware, real email, real AC, real TTS, or automatic VAD/AEC barge-in.

## Added

- Added `scripts/localdev-contract-matrix-smoke.mjs`.
- Added `npm run test:localdev-contract-matrix`.
- Included the contract matrix in the safe smoke suite.
- Expanded Mock Server compliance diagnostics so malformed messages and unsupported schemas emit `omni.output_state.v1 state=error` while keeping the connection usable.

## Covered Contract Cases

- `omni.input_packet.v1`
- `omni.audio_frame.v1`
- `omni.camera_frame.v1`
- `omni.output_state.v1`
- `omni.output_turn.v1`
- `omni.reply_audio_frame.v1`
- `omni.interrupt.v1`
- malformed message recovery
- unsupported schema recovery

## Guardrails

- `reply_text` is not TTS input.
- `audio_frame` is not interrupt.
- `reply_audio_frame` is not user input.
- Plugins still route through Permission Engine and Tool Engine.
