# Release Notes v1.3.9 - Provider-specific Handshake Adapter Dry-run

v1.3.9 extends v1.3.8 with provider-specific handshake adapter dry-run metadata for BigModel GLM-Realtime and DashScope Qwen-Omni realtime candidates.

This is not a real provider integration. It does not open a real socket, does not upload real audio or camera frames, does not start realtime billing, does not read real provider API keys, does not call BigModel / DashScope endpoints, and does not connect `reply_text` to TTS.

## Added

- `src/runtime/providerSpecificHandshakeAdapters.js`
- `src/runtime/providerHandshakeEventMapping.js`
- `src/runtime/providerHandshakeErrorMapping.js`
- Provider-specific dry-run helpers in `src/runtime/providerProxyPolicy.js`
- Provider-specific endpoint declarations in `src/runtime/providerProxyServerContract.js`
- Five local Mock provider-specific endpoints in `scripts/provider-proxy-skeleton-server.mjs`
- Compact UI diagnostics in `OmniSessionPanel`
- `scripts/provider-specific-handshake-adapter-smoke.mjs`
- `docs/PROVIDER_SPECIFIC_HANDSHAKE_ADAPTERS.md`
- `docs/PROVIDER_HANDSHAKE_EVENT_MAPPING.md`
- `docs/PROVIDER_HANDSHAKE_ERROR_MAPPING.md`

## Verification

`npm run test:provider-specific-handshake-adapter` validates 27 assertions around the new candidate adapters and local skeleton endpoints. The full safe smoke suite now has 27 checks.

## Still Blocked

- Real audio upload.
- Real camera upload.
- Realtime billing.
- Real provider sockets.
- Browser-held provider API keys.
- Real BigModel / DashScope endpoint calls.
- `reply_text -> TTS`.
- ASR -> LLM -> TTS regression.

`omni.reply_audio_frame.v1` remains the realtime voice output path and `localdev_mock` remains the required fallback.

## Why v1.3.9, Not v1.4.0

This release only adds provider-specific dry-run descriptors, mappings, local validation, docs, and smoke coverage. It does not change the realtime Omni wire contract or enable real provider traffic, so it remains a v1.3.x safety-boundary iteration.
