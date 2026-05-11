# Release Notes v1.3.5

## Provider Adapter Contract / Real Provider Safety Boundary

v1.3.5 stabilizes the Provider Adapter Contract surface and the secret boundary that every future provider adapter must follow. The demo remains safe Mock-first against `localdev_mock`. No real cloud realtime call, no real audio upload, no real camera upload, no realtime billing, and no `reply_text -> TTS` path.

## Added

- `src/runtime/providerCapabilities.js` — built-in capability map for `localdev_mock`, `dashscope_qwen_omni`, `custom_realtime_omni`, `synthetic_test`, and `offline_pet_engine`. Includes `mergeProviderCapability` (narrowing-only).
- `src/runtime/providerAdapterContract.js` — `omni.provider_adapter.v1` descriptor, the 10 required contract surface methods, `validateProviderAdapter`, and `summarizeProviderAdapterDescriptor`.
- `src/runtime/providerAdapters/syntheticProviderAdapter.js` — synthetic-only stub that implements the contract but rejects any real audio/camera payload and never opens a real socket.
- `providerAdapterDescriptor` memo in `useRuntimeCore.js`, surfaced as a small diagnostic card in `OmniSessionPanel`.
- `test:provider-adapter-contract` smoke test (now 23 checks in the safe smoke suite).
- `docs/PROVIDER_ADAPTER_CONTRACT.md`.
- `docs/PROVIDER_SECRET_BOUNDARY.md`.

## Updated

- `README.md`, `AGENTS.md`, `docs/ARCHITECTURE.md`, `docs/IMPLEMENTATION_PLAN.md`, `docs/LOCALDEV_ADAPTER_CONTRACT.md` for v1.3.5.
- `scripts/run-smoke-suite.mjs` now lists 23 checks.
- `package.json` bumped to `1.3.5`.

## Safety Boundary

- `canOpenRealtimeSocket=false`, `canSendRealAudio=false`, `canSendRealCamera=false`, `canStartBillingSession=false`, `replyTextToTts=false` are hard-locked on every provider, real or synthetic.
- `localdev_mock` remains the only provider that streams Mock realtime media frames.
- `synthetic_test` rejects frames that are not marked `{ synthetic: true }` and never reports `sentToProvider=true`.
- API keys / secrets must not enter the frontend bundle or browser runtime config. Real provider secrets are required to live in a server-side proxy / Robot Gateway / Device Runtime.
- `mergeProviderCapability` is narrowing-only; it cannot widen capabilities or weaken safety requirements.
- `cloudgenie.local_dev.media_ack.v1` remains diagnostics-only.
- LocalDev Mock fallback remains required.
