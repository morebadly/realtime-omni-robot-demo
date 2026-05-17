# Release Notes v1.4.0 - Limited Real Provider Handshake Preflight

v1.4.0 introduces a safety boundary for future real provider handshake preflight. It is not a real provider integration and not a user realtime call.

## Added

- `src/runtime/providerRealHandshakePreflightPolicy.js`
- `src/runtime/providerRealHandshakePreflightDescriptor.js`
- `scripts/provider-real-handshake-preflight.mjs`
- `scripts/provider-real-handshake-preflight-smoke.mjs`
- `/provider-proxy/providers/:providerId/real-handshake-preflight` on the local Mock skeleton
- Compact Omni Session diagnostics for blocked real handshake preflight
- `docs/PROVIDER_REAL_HANDSHAKE_PREFLIGHT.md`

## Safety

- Default is blocked.
- Manual opt-in requires `ALLOW_REAL_PROVIDER_HANDSHAKE=1`.
- Manual preflight is server-side only.
- Browser runtime remains forbidden.
- Verify/smoke do not perform real network calls.
- No real audio upload.
- No real camera upload.
- No realtime billing.
- No real provider socket.
- No real BigModel / DashScope endpoint call.
- No real key printing.
- No `reply_text -> TTS`.
- No ASR -> LLM -> TTS regression.
- `localdev_mock` fallback remains required.

`omni.reply_audio_frame.v1` remains the realtime voice output path.

## Verification

`npm run test:provider-real-handshake-preflight` validates policy defaults, manual opt-in gates, descriptor safety, skeleton metadata endpoint behavior, canary secret non-leakage, and the 28-check smoke suite registration.

The full safe smoke suite now has 28 checks.

## Why v1.4.0

This release creates the first explicit boundary for a future real provider handshake preflight. It still does not enable real provider traffic, but the architecture step is larger than v1.3.x metadata-only candidate mapping, so it becomes v1.4.0.
