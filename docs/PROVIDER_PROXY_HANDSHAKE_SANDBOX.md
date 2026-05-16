# Provider Proxy Handshake Sandbox (v1.3.9)

## v1.3.9 Provider-specific Dry-run Addendum

v1.3.9 keeps this sandbox dry-run-only and adds a separate provider-specific metadata validation layer. BigModel / DashScope candidates can return `dry_run_ready` for metadata validation reports, but this does not mean real provider readiness. The handshake sandbox itself still blocks real-cloud / self-hosted / `real_cloud_candidate` provider handshakes from becoming real-ready.

Every provider-specific dry-run report keeps `opensRealSocket=false`, `sentToProvider=false`, `uploaded=false`, `persisted=false`, `billingStarted=false`, `replyTextToTts=false`, and `fallbackProviderId='localdev_mock'`.

`src/runtime/providerProxyHandshakeSandbox.js` is a pure state machine
that models how a future server-side proxy / Robot Gateway / Device
Runtime would validate an ephemeral session token and perform a real
provider handshake. In v1.3.8 the sandbox stays **dry-run only**. It
does not open a real provider socket, does not upload real audio /
camera, does not start realtime billing, and does not connect
`reply_text` to TTS.

## 1. Protocol id

```
omni.provider_proxy_handshake_sandbox.v1
```

## 2. States (8)

```
idle
requested
proxy_validating
token_validated
provider_handshake_blocked
dry_run_ready
dry_run_error
fallback_to_localdev_mock
```

## 3. Events (6)

```
provider.proxy.handshake.requested
provider.proxy.handshake.token_validated
provider.proxy.handshake.blocked
provider.proxy.handshake.dry_run_ready
provider.proxy.handshake.dry_run_error
provider.proxy.handshake.fallback
```

## 4. Safety locks on every state

```js
state.safety = {
  opensRealSocket: false,
  sentToProvider: false,
  uploaded: false,
  persisted: false,
  billingStarted: false,
  replyTextToTts: false,
  realProviderHandshakeBlocked: true,
  dryRunOnly: true,
  // ...
};
state.fallbackProviderId = 'localdev_mock';
```

## 5. Blocking rules

Real-cloud / self-hosted / `real_cloud_candidate` providers (including
`bigmodel_glm_realtime_candidate` and `dashscope_qwen_omni_candidate`)
**always** end in `provider_handshake_blocked`, regardless of which
event arrives. Even a perfectly valid `synthetic_only` token cannot
unlock them.

Synthetic / localdev / offline providers can progress through
`requested -> token_validated -> dry_run_ready -> (back to idle on
manual reset)`. Without a valid ephemeral token they end in
`dry_run_error`.

## 6. Helpers

| Function | Purpose |
| --- | --- |
| `createDefaultProxyHandshakeSandboxState({ providerId, providerKind })` | seed |
| `transitionProxyHandshakeSandbox(prev, event, detail)` | low-level event |
| `requestProxyHandshakeSandbox(prev, { providerId, providerKind, token })` | request + token validate |
| `runProxyHandshakeDryRun(prev, { providerId, providerKind, token })` | full safe dry-run flow |
| `summarizeProxyHandshakeSandbox(state)` | UI-friendly summary |
| `getProxyHandshakeSandboxCapability()` | static capability descriptor |

## 7. Wiring

`useRuntimeCore` exposes:

- `providerProxyHandshakeSandbox` — current state.
- `providerProxyHandshakeDryRun` — most recent dry-run decision envelope.
- `actions.handleProviderProxyHandshakeDryRun()` — request a token, then
  run a dry-run.
- `actions.handleProviderProxyHandshakeFallback()` — force fallback to
  `localdev_mock`.

`OmniSessionPanel` renders a compact diagnostic card alongside the
existing Provider Proxy / Ephemeral Token card.

## 8. What this sandbox is NOT

- Not a real provider handshake.
- Not a real WebSocket connection.
- Not a real audio / camera upload.
- Not a realtime billing path.
- Not a TTS path. `reply_text` is never a TTS input.
- Not an ASR → LLM → TTS regression path.

`omni.reply_audio_frame.v1` remains the realtime voice output. The
sandbox does not produce or consume reply audio; it only describes
what a future real-handshake state machine would do, with every
dangerous transition explicitly blocked.
