# Provider Adapter Contract (v1.3.6)

## v1.3.6 Socket Sandbox Addendum

v1.3.6 extends the descriptor with an additional `socketSandbox` block and two new guardrails:

```js
descriptor.socketSandbox = {
  socketSandboxAvailable: true,
  socketSandboxMode: 'blocked' | 'synthetic_only' | 'mock_realtime_or_synthetic_only' | 'offline_only',
  canOpenSyntheticSocket: <bool>,
  canOpenRealtimeSocket: false,
  opensRealSocket: false,
  syntheticOnly: <bool>,
  realMediaBlocked: true,
  billingStarted: false,
  replyAudioFrameNative: true,
  replyTextSubtitleOnly: true,
  replyTextToTts: false,
  fallbackProviderId: 'localdev_mock'
};

descriptor.guardrails.replyAudioFrameIsRealtimeVoiceOutput = true;
descriptor.guardrails.asrLlmTtsRegressionForbidden = true;
```

These fields document that the only safe socket lifecycle in v1.3.6 is synthetic-only, that the realtime voice output is `omni.reply_audio_frame.v1` native audio frames, and that `reply_text -> TTS` regression is forbidden. See `docs/PROVIDER_SOCKET_SANDBOX.md` for the state machine and lifecycle methods.

## Scope

v1.3.5 stabilizes the Provider Adapter Contract surface and the safety boundary that every future provider adapter (real cloud, self-hosted, synthetic, offline engine, or LocalDev Mock) must follow. This release does not introduce real provider traffic.

The contract is descriptive. It is not a session opener. It does not upload media, does not start billing, and does not connect `reply_text` to TTS.

## Modules

```text
src/runtime/providerCapabilities.js
src/runtime/providerAdapterContract.js
src/runtime/providerAdapters/syntheticProviderAdapter.js
```

`providerCapabilities.js` exposes a built-in capability map and `mergeProviderCapability` (narrowing-only).

`providerAdapterContract.js` exposes:

- `PROVIDER_ADAPTER_SCHEMA = 'omni.provider_adapter.v1'`
- `PROVIDER_ADAPTER_CONTRACT_METHODS` (10 required surface methods)
- `PROVIDER_ADAPTER_REQUIRED_SCHEMAS` (the 7 realtime Omni schemas)
- `createProviderAdapterDescriptor({ adapter, providerConfig, providerGate, providerHealth, providerHandshake, providerAudioGate, providerCameraGate })`
- `validateProviderAdapter(adapter, descriptor)`
- `summarizeProviderAdapterDescriptor(descriptor)`

`providerAdapters/syntheticProviderAdapter.js` is a synthetic-only stub that implements every contract method without ever opening a socket, uploading media, or starting billing. It explicitly rejects frames that are not marked `{ synthetic: true }`.

## Contract Surface

```text
createSession({ correlation, robotId, displayName })
closeSession(reason?)
sendInputPacket(packet)
sendAudioFrame(frame)
sendCameraFrame(frame)
sendInterrupt(interrupt)
onOutputState(listener)
onOutputTurn(listener)
onReplyAudioFrame(listener)
onError(listener)
```

All 10 methods are required. Their semantics map directly onto the existing realtime Omni schemas:

```text
omni.input_packet.v1     -> sendInputPacket
omni.audio_frame.v1      -> sendAudioFrame
omni.camera_frame.v1     -> sendCameraFrame
omni.interrupt.v1        -> sendInterrupt
omni.output_state.v1     -> onOutputState
omni.output_turn.v1      -> onOutputTurn
omni.reply_audio_frame.v1-> onReplyAudioFrame
```

`reply_text` inside `omni.output_turn.v1` remains subtitles/log/debug only. It is never a TTS input.

## Capability Map

```text
localdev_mock          mock realtime, no real cloud, no billing, no secret
dashscope_qwen_omni    real_cloud, experimental, requires server-side secret, billing risk pay_per_use, blocked by default
custom_realtime_omni   self_hosted, experimental, requires server-side secret, billing risk subscription, blocked by default
synthetic_test         synthetic-only, no real socket, no real upload, no billing
offline_pet_engine     offline rules engine, no realtime socket
```

Per-adapter overrides are processed by `mergeProviderCapability`. Overrides may only:

- narrow a granted capability (`true -> false` for `supports*`),
- raise a safety requirement (`false -> true` for `requiresServerSideSecret`, `experimentalOnly`),
- pick a safer `billingRisk` level.

They cannot weaken safety. The hard-locked safety booleans (`canOpenRealtimeSocket`, `canSendRealAudio`, `canSendRealCamera`, `canStartBillingSession`, `replyTextToTts`) always remain `false` regardless of override input.

## Default Descriptor Result

```js
{
  schema: 'omni.provider_adapter.v1',
  providerId,
  providerKind,
  mode,                  // mock | health_check_only | handshake_only | audio_dry_run | camera_dry_run | realtime_experimental | mock
  status,                // mock_ready | ready_for_health_check | ... | blocked
  capabilities: { ... },
  supportedSchemas: [ ... ],
  safetyMode,            // mock_only | health_check_only | handshake_only | audio_dry_run | camera_dry_run | synthetic_only | offline_only | realtime_experimental_blocked
  canOpenRealtimeSocket: false,
  canSendAudio: false,
  canSendCamera: false,
  canStartBillingSession: false,
  replyTextToTts: false,
  fallbackProviderId: 'localdev_mock',
  contractSurface: { createSession: 'required', ... },
  secretBoundary: {
    apiKeyInFrontend: false,
    apiKeyInRuntimeConfig: false,
    requiresServerSideSecret: bool,
    serverSideProxyRecommended: bool,
    deviceRuntimeRecommended: bool,
    note: '...'
  },
  gateLinks: { providerGate, providerHealth, providerHandshake, providerAudioGate, providerCameraGate },
  reasons: [ ... ],
  guardrails: {
    realProviderTrafficBlockedByDefault: true,
    noRealAudioUpload: true,
    noRealCameraUpload: true,
    noRealtimeBilling: true,
    noRealProviderSocket: true,
    replyTextIsSubtitleOnly: true,
    replyTextNotTtsInput: true,
    localdevMockFallbackRequired: true,
    apiKeyMustNotEnterFrontend: true,
    syntheticOnlyTestPathAvailable: true
  }
}
```

## Synthetic Provider Adapter Stub

`createSyntheticProviderAdapter()` returns an object that satisfies the contract:

- It always reports `canOpenRealtimeSocket=false`, `canSendRealAudio=false`, `canSendRealCamera=false`, `canStartBillingSession=false`, `replyTextToTts=false`, `fallbackProviderId='localdev_mock'`.
- `sendAudioFrame` and `sendCameraFrame` reject any frame that is not marked synthetic. Real mic PCM and real camera JPEG are explicitly blocked.
- `emitSyntheticOutputState / emitSyntheticReplyAudioFrame / emitSyntheticOutputTurn` deliver deterministic synthetic events to registered listeners for contract tests.
- `getStats()` exposes counters for accepted/rejected frames so smoke tests can observe contract enforcement.

This stub is for contract verification only. It is not used for real conversation in v1.3.5.

## Smoke Test

```bash
npm run test:provider-adapter-contract
```

Covers, at minimum:

1. `localdev_mock` capability is correct.
2. Real provider capability is declared but default-blocked.
3. Synthetic adapter is synthetic-only.
4. Real audio upload is blocked at the contract layer.
5. Real camera upload is blocked at the contract layer.
6. Realtime billing is blocked at the contract layer.
7. Real provider socket is blocked by default.
8. `localdev_mock` fallback is required.
9. The contract preserves `output_state` / `output_turn` / `reply_audio_frame` / `interrupt` semantics.
10. `reply_text` is never connected to TTS.
11. API key / secrets do not enter the frontend runtime config.
12. `validateProviderAdapter` correctly flags safety-violating adapter shapes.
13. `mergeProviderCapability` is narrowing-only and cannot weaken safety.
14. `PROVIDER_ADAPTER_SCHEMA` and constant lists are stable.

The safe smoke suite is now 23 checks.

## Safety Invariants

- No real audio upload.
- No real camera upload.
- No realtime billing.
- No real provider socket open.
- No `reply_text -> TTS` path.
- `localdev_mock` fallback remains required.
- API keys / secrets must not enter the frontend bundle or browser runtime config.
- Synthetic-only adapter must not pass through any real media payload.
