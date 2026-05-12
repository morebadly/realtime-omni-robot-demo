# Provider Socket Sandbox (v1.3.8)

## v1.3.8 Real-Cloud-Candidate Addendum

v1.3.8 introduces a new `real_cloud_candidate` provider kind for the BigModel and DashScope realtime placeholders. `isRealProviderKind` now treats `real_cloud_candidate` exactly like `real_cloud` / `self_hosted`: the socket sandbox routes them to `blocked` regardless of which event arrives, and the synthetic adapter cannot drive them past `blocked` even with a valid `synthetic_only` ephemeral token. The new Provider Proxy Handshake Sandbox (`src/runtime/providerProxyHandshakeSandbox.js`, see `docs/PROVIDER_PROXY_HANDSHAKE_SANDBOX.md`) makes the same guarantee for handshake-level transitions: candidates always end in `provider_handshake_blocked`.

## v1.3.7 Token Gating Addendum

v1.3.7 makes the synthetic socket lifecycle ephemeral-token-gated. The sandbox state now carries:

- `requiresEphemeralToken: true`
- `acceptedTokenKinds: ['synthetic_only']`
- `activeTokenId` / `activeTokenKind`
- `tokenAcceptedCount` / `tokenRejectedCount`
- `lastTokenDecision`

Two new helpers live next to the existing API:

- `validateSocketSandboxToken(state, token)` — pure function that returns `{ ok, reason }`. Real-cloud / self-hosted providers always return `{ ok: false, reason: 'real_provider_socket_blocked_by_default' }`. Synthetic providers with no token return `{ ok: false, reason: 'ephemeral_token_required' }`. Only an active `omni.ephemeral_session_token.v1` with `tokenKind="synthetic_only"` is accepted.
- `runSyntheticSocketSessionWithToken(prev, token, { providerId, providerKind })` — drives the full safe lifecycle only when the token validates; otherwise it stops at `requested`. Real-cloud / self-hosted providers are still routed to `blocked` even with a synthetic token.

`syntheticProviderAdapter` adds:

- `acceptEphemeralToken(token)` — token gate.
- `openSyntheticSocketWithToken(token)` — accept + open synthetic.
- `getActiveEphemeralToken()`, `getAcceptedTokenKinds()`.

The existing v1.3.6 lifecycle (`openSyntheticSocket`, `emitSyntheticReady`, `closeSyntheticSocket`, `runSyntheticSocketSession`) keeps working unchanged for backward compatibility. New code should prefer the token-gated path.

All safety locks remain in force: `opensRealSocket=false`, `sentToProvider=false`, `uploaded=false`, `persisted=false`, `billingStarted=false`, `syntheticOnly=true`, `replyTextToTts=false`. Tokens do not weaken these locks.

## What This Is — And What It Is Not

v1.3.6 adds a Runtime-only **Real Socket Sandbox / Synthetic-only Provider Session** state machine. It is a safety-locked descriptor and lifecycle for "how a real provider socket would be opened safely later". It is **not**:

- Not a real provider WebSocket.
- Not a real provider session.
- Not a real audio upload path.
- Not a real camera upload path.
- Not a realtime billing path.
- Not a TTS path. `reply_text` is never an input to `speechSynthesis`, MiniMax TTS, DashScope TTS, or any other TTS provider.
- Not an ASR → LLM → TTS regression. The realtime voice output is `omni.reply_audio_frame.v1` native audio frames, not text-to-speech of `reply_text`.

If a future provider can only return text (no native audio frames), it must be registered as a **non-omni provider capability** and cannot become the main realtime Omni provider.

## Realtime Voice Output, Reminded

```text
user mic PCM / camera JPEG / runtime context / fact events
  -> Realtime Omni Provider
  -> omni.output_state.v1
  -> omni.reply_audio_frame.v1   <-- realtime voice output, native audio frames
  -> omni.output_turn.v1         <-- reply_text is subtitle / log / debug only
  -> Web Audio / Robot Speaker plays reply_audio_frame
```

`reply_text` may appear in `omni.output_turn.v1` for subtitles, debugging, plugin keyword assistance, and Visible Context. It is forbidden as input to any speech synthesizer.

## Modules

```text
src/runtime/providerSocketSandbox.js
src/runtime/providerAdapters/syntheticProviderAdapter.js   (extended)
src/runtime/providerAdapterContract.js                     (extended)
```

`providerSocketSandbox.js` exposes:

- `PROVIDER_SOCKET_SANDBOX_PROTOCOL = 'omni.provider_socket_sandbox.v1'`
- `PROVIDER_SOCKET_SANDBOX_STATES` and `PROVIDER_SOCKET_SANDBOX_EVENTS`
- `createDefaultSocketSandboxState({ providerId, providerKind })`
- `transitionSocketSandbox(prev, event, detail)`
- `requestSocketSandbox(prev, { providerId, providerKind })`
- `runSyntheticSocketSession(prev, { providerId, providerKind })` (test helper)
- `summarizeSocketSandbox(state)`
- `getSocketSandboxCapability()`

## State Machine

States:

```text
idle
requested
blocked
synthetic_opening
synthetic_open
synthetic_ready
synthetic_error
synthetic_closed
fallback_to_localdev_mock
```

Events:

```text
provider.socket.requested
provider.socket.blocked
provider.socket.synthetic_opening
provider.socket.synthetic_opened
provider.socket.synthetic_ready
provider.socket.synthetic_error
provider.socket.synthetic_closed
provider.socket.fallback
```

Rules:

- Real provider kinds (`real_cloud`, `self_hosted`) are always routed to `blocked` regardless of which event is sent. The default block reason is `real_provider_socket_blocked_by_default`.
- Synthetic / localdev_mock / offline_pet_engine kinds may progress through `requested → synthetic_opening → synthetic_open → synthetic_ready → synthetic_closed`.
- A `provider.socket.fallback` event always lands in `fallback_to_localdev_mock` with `fallbackProviderId='localdev_mock'`.

Every state carries:

```text
opensRealSocket   = false
sentToProvider    = false
uploaded          = false
persisted         = false
billingStarted    = false
syntheticOnly     = true
realMediaBlocked  = true
replyAudioFrameNative   = true
replyTextSubtitleOnly   = true
replyTextToTts          = false
fallbackProviderId      = 'localdev_mock'
```

## Synthetic Provider Adapter Extensions

`createSyntheticProviderAdapter()` adds:

```text
createSyntheticSession({ correlation, robotId, displayName })
openSyntheticSocket()
closeSyntheticSocket(reason?)
emitSyntheticReady(detail?)
emitSyntheticError(error)
emitSyntheticFallback(reason?)
onSocketLifecycle(listener)
onReady(listener)
onFallback(listener)
getSocketSandboxState()
getSocketSandboxCapability()
```

Existing real-audio / real-camera rejection rules from v1.3.5 are unchanged: any audio or camera frame that is not marked `{ synthetic: true }` (or whose `media.synthetic !== true`) is rejected and never produces `sentToProvider=true`.

## Provider Adapter Contract Extension

`createProviderAdapterDescriptor(...)` now returns an additional `socketSandbox` block:

```js
{
  // ... existing fields ...
  socketSandbox: {
    socketSandboxAvailable: true,
    socketSandboxMode: 'blocked' | 'synthetic_only' | 'mock_realtime_or_synthetic_only' | 'offline_only',
    canOpenSyntheticSocket: <provider-kind-dependent>,
    canOpenRealtimeSocket: false,
    opensRealSocket: false,
    syntheticOnly: <bool>,
    realMediaBlocked: true,
    billingStarted: false,
    replyAudioFrameNative: true,
    replyTextSubtitleOnly: true,
    replyTextToTts: false,
    fallbackProviderId: 'localdev_mock'
  },
  guardrails: {
    // ... existing ...
    replyAudioFrameIsRealtimeVoiceOutput: true,
    asrLlmTtsRegressionForbidden: true
  }
}
```

## Smoke Test

```bash
npm run test:provider-socket-sandbox
```

Coverage (at minimum):

1. Real provider socket blocked by default.
2. Synthetic socket can open / ready / close through the state machine.
3. Synthetic socket reports `opensRealSocket=false`.
4. Synthetic session reports `sentToProvider=false`.
5. Synthetic session reports `uploaded=false`.
6. Synthetic session reports `billingStarted=false`.
7. Real audio frame is rejected.
8. Real camera frame is rejected.
9. Synthetic audio / synthetic camera frames are accepted but never escape.
10. Fallback is locked to `localdev_mock`.
11. API key never enters descriptor / logs / Visible Context / sandbox state.
12. `reply_text` is not a TTS input.
13. `output_turn.reply_text` remains subtitle / debug only.
14. `omni.reply_audio_frame.v1` is the realtime voice output path.
15. Provider socket lifecycle event order is correct.
16. `cloudgenie.local_dev.media_ack.v1` remains diagnostics-only.
17. `omni.audio_frame.v1` never auto-triggers `omni.interrupt.v1`.
18. `omni.reply_audio_frame.v1` never feeds back as user input.

The safe smoke suite is now 24 checks.

## Safety Invariants

- No real audio upload.
- No real camera upload.
- No realtime billing.
- No real provider socket open.
- No `reply_text → TTS` path.
- No ASR → LLM → TTS regression.
- `omni.reply_audio_frame.v1` is the realtime voice output.
- `omni.audio_frame.v1` is input media and does not auto-interrupt.
- `omni.reply_audio_frame.v1` does not feed back as user input.
- LocalDev Mock fallback remains required.
- API keys / secrets stay on a server-side proxy / Robot Gateway / Device Runtime, never in the frontend.
