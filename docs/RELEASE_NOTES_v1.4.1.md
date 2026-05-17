# Release Notes v1.4.1 - Manual Real Handshake Probe Stub

v1.4.1 introduces a manual, server-side-only probe plan layer for future real provider handshake work. It is still not a real provider integration and not a user realtime call.

## Added

- `src/runtime/providerRealHandshakeProbePlan.js`
- `src/runtime/providerRealHandshakeProbePolicy.js`
- `scripts/provider-real-handshake-probe-plan.mjs`
- `scripts/provider-real-handshake-probe-plan-smoke.mjs`
- `docs/PROVIDER_REAL_HANDSHAKE_PROBE_PLAN.md`
- `npm run test:provider-real-handshake-probe-plan`

## Safety

- Default is disabled / blocked.
- Probe plans are dry-run and no-network by default.
- Browser runtime remains forbidden.
- Candidate providers can generate plans but cannot execute real handshakes.
- Unknown providers and `localdev_mock` real-probe requests are blocked with `localdev_mock` fallback.
- Key output is boolean-only: `keyPresent=true/false`.
- Raw keys are not printed or included.
- No real audio upload.
- No real camera upload.
- No realtime billing.
- No real provider socket.
- No real network handshake.
- No `reply_text -> TTS`.
- No ASR -> LLM -> TTS regression.

`omni.reply_audio_frame.v1` remains the realtime voice output path and `localdev_mock` fallback remains required.

## Verification

`npm run test:provider-real-handshake-probe-plan` validates disabled defaults, candidate plan generation, unknown-provider fallback, `localdev_mock` blocking, dangerous request refusals, boolean-only key presence, redacted diagnostics, metadata-only endpoint/model/quota/billing fields, and 29-check smoke suite registration.

The full safe smoke suite now has 29 checks.
