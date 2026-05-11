# Release Notes v1.3.6

## Real Socket Sandbox / Synthetic-only Provider Session

v1.3.6 adds a synthetic-only socket sandbox lifecycle for "how a real provider socket would be opened safely later". It does not introduce any real provider traffic. The realtime voice output remains `omni.reply_audio_frame.v1` native audio frames; `reply_text` is never used as a TTS input.

## Added

- `src/runtime/providerSocketSandbox.js` — synthetic-only socket sandbox state machine (`omni.provider_socket_sandbox.v1`), 9 states, 8 events, hard-locked safety fields.
- `src/runtime/providerAdapters/syntheticProviderAdapter.js` extended with `createSyntheticSession`, `openSyntheticSocket`, `closeSyntheticSocket`, `emitSyntheticReady`, `emitSyntheticError`, `emitSyntheticFallback`, `onSocketLifecycle`, `onReady`, `onFallback`, `getSocketSandboxState`, `getSocketSandboxCapability`.
- `src/runtime/providerAdapterContract.js` descriptor now exposes a `socketSandbox` block with `socketSandboxAvailable`, `socketSandboxMode`, `canOpenSyntheticSocket`, `opensRealSocket`, `syntheticOnly`, `realMediaBlocked`, `billingStarted`, `replyAudioFrameNative`, `replyTextSubtitleOnly`, `replyTextToTts`, and `fallbackProviderId`. New guardrails `replyAudioFrameIsRealtimeVoiceOutput` and `asrLlmTtsRegressionForbidden` are explicit.
- `useRuntimeCore` now owns `providerSocketSandbox` state and provides actions `handleProviderSocketSandboxRequest`, `handleProviderSocketSandboxSyntheticOpen`, `handleProviderSocketSandboxClose`, `handleProviderSocketSandboxFallback`, and `handleProviderSocketSandboxRunSyntheticSession`.
- `OmniSessionPanel` shows a small Provider Socket Sandbox diagnostic card (Real socket blocked, synthetic sandbox available, native reply_audio_frame required, reply_text → TTS blocked, secret boundary server-side required).
- `test:provider-socket-sandbox` smoke test (now 24 checks in the safe smoke suite).
- `docs/PROVIDER_SOCKET_SANDBOX.md`.

## Updated

- `README.md`, `AGENTS.md`, `docs/ARCHITECTURE.md`, `docs/IMPLEMENTATION_PLAN.md`, `docs/LOCALDEV_ADAPTER_CONTRACT.md`, `docs/PROVIDER_ADAPTER_CONTRACT.md`, `docs/PROVIDER_SECRET_BOUNDARY.md` for v1.3.6.
- `scripts/run-smoke-suite.mjs` now lists 24 checks.
- `package.json` bumped to `1.3.6`.

## Safety Boundary

- Real provider sockets remain blocked by default. The synthetic socket sandbox is the only allowed lifecycle in v1.3.6.
- All sandbox results report `opensRealSocket=false`, `sentToProvider=false`, `uploaded=false`, `persisted=false`, `billingStarted=false`, `syntheticOnly=true`.
- Real audio / camera frames are still rejected by the synthetic adapter.
- `omni.reply_audio_frame.v1` remains the realtime voice output. `reply_text` remains subtitles / log / debug only.
- `omni.audio_frame.v1` never auto-interrupts; `omni.reply_audio_frame.v1` never feeds back as user input.
- `cloudgenie.local_dev.media_ack.v1` remains diagnostics-only.
- API keys / secrets must not enter the frontend bundle or browser runtime config. They must live on a server-side proxy / Robot Gateway / Device Runtime.
- LocalDev Mock fallback remains required.
- ASR → LLM → TTS regression is forbidden.
