# Provider Proxy Server Skeleton (v1.4.0)

## v1.4.0 Real Handshake Preflight Endpoint Addendum

v1.4.0 adds one local Mock metadata endpoint:

| Method | Path | Response schema |
| --- | --- | --- |
| GET | `/provider-proxy/providers/:providerId/real-handshake-preflight` | `omni.real_provider_handshake_preflight.v1` |

This endpoint returns a preflight descriptor with default blocked status, `networkCallAttempted=false`, `keyRequiredServerSide=true`, `browserForbidden=true`, and `fallbackProviderId=localdev_mock`.

The skeleton still binds to `127.0.0.1`, still does not read real provider env key values, still does not call real provider endpoints, still does not open sockets, still does not upload media, still does not start billing, and still does not connect `reply_text` to TTS. Verify/smoke do not perform real network.

## v1.3.9 Provider-specific Endpoints Addendum

v1.3.9 adds five local Mock provider-specific endpoints:

| Method | Path | Response schema |
| --- | --- | --- |
| GET | `/provider-proxy/providers` | `omni.provider_specific_handshake_adapter_list.v1` |
| GET | `/provider-proxy/providers/:providerId/handshake-adapter` | `omni.provider_specific_handshake_adapter.v1` |
| POST | `/provider-proxy/providers/:providerId/handshake/dry-run` | `omni.provider_specific_handshake_dry_run.v1` |
| GET | `/provider-proxy/providers/:providerId/event-mapping` | `omni.provider_handshake_event_mapping.v1` |
| GET | `/provider-proxy/providers/:providerId/error-mapping` | `omni.provider_handshake_error_mapping.v1` |

These endpoints return BigModel / DashScope candidate metadata, event mapping, error mapping, and fallback decisions only. They do not read real provider API keys, do not call real provider endpoints, do not open sockets, do not upload media, do not start billing, and do not connect `reply_text` to TTS.

v1.3.8 adds a local Mock skeleton server that defines the HTTP boundary
between a Web Console / Web Runtime and a future server-side proxy /
Robot Gateway / Device Runtime. The skeleton itself is **not** a real
provider integration. It does not call any real cloud endpoint, does not
hold a real API key, does not upload real audio / camera, does not start
realtime billing, and does not connect `reply_text` to TTS.

## 1. What this is

```
Web Console / Web Runtime
        |   restricted JSON requests (never API key, never raw media)
        v
[ provider-proxy-skeleton-server.mjs ]   <-- LOCAL Mock only
        |   pure Runtime functions (policy / sandbox / token descriptors)
        v
omni.reply_audio_frame.v1 / omni.output_state.v1 / omni.output_turn.v1
        |   via localdev_mock fallback
        v
Web Audio / Robot Speaker
```

The skeleton lives in `scripts/provider-proxy-skeleton-server.mjs` and is
described by `src/runtime/providerProxyServerContract.js`. Both are pure
descriptors of the boundary. The future production server-side proxy /
Robot Gateway / Device Runtime will replace the skeleton without
changing this protocol shape.

## 2. What this is NOT

- Not a production server.
- Not a real provider gateway.
- Not a place to put real API keys.
- Not a place to perform real `fetch` / `WebSocket` calls to BigModel,
  DashScope, OpenAI, MiniMax, or any other real provider host.
- Not a TTS path. `reply_text` is never a TTS input.
- Not an ASR → LLM → TTS regression.

The smoke test `scripts/provider-proxy-server-smoke.mjs` greps the
skeleton source file to prove these invariants statically.

## 3. Endpoints

| Method | Path | Response schema |
| --- | --- | --- |
| GET | `/health` | `omni.provider_proxy_health.v1` |
| GET | `/provider-proxy/contract` | `omni.provider_proxy_server_contract.v1` |
| POST | `/provider-proxy/session/request` | `omni.provider_proxy_decision.v1` |
| POST | `/provider-proxy/session/validate` | `omni.provider_proxy_decision.v1` |
| POST | `/provider-proxy/handshake/dry-run` | `omni.provider_handshake_dry_run.v1` |
| POST | `/provider-proxy/fallback` | `omni.provider_proxy_fallback_decision.v1` |

All responses carry headers:

```
X-Provider-Proxy-Skeleton: local-mock-only
X-Reads-Real-Api-Key: false
X-Calls-Real-Provider: false
```

## 4. Safety locks

`createProviderProxyServerContract()` declares the boundary:

```js
{
  schema: 'omni.provider_proxy_server_contract.v1',
  serverKind: 'local_mock_skeleton',
  productionReady: false,
  frontendCanHoldApiKey: false,
  browserDirectProviderSocketAllowed: false,
  serverSideSecretRequired: true,
  realProviderHandshakeAllowed: false,
  realMediaUploadAllowed: false,
  realtimeBillingAllowed: false,
  replyTextToTts: false,
  replyAudioFrameNative: true,
  fallbackProviderId: 'localdev_mock',
  forbiddenEnvVarNames: ['BIGMODEL_API_KEY', 'BIGMODEL_TOKEN', 'DASHSCOPE_API_KEY', ...],
  forbiddenOutboundHosts: ['dashscope.aliyuncs.com', 'open.bigmodel.cn', ...],
  safety: {
    opensRealSocket: false,
    sendsRealAudio: false,
    sendsRealCamera: false,
    startsBillingSession: false,
    sentToProvider: false,
    uploaded: false,
    persisted: false,
    replyTextToTts: false,
    readsRealApiKeyEnv: false,
    callsRealProviderEndpoint: false,
    replyAudioFrameNative: true,
    replyTextSubtitleOnly: true
  }
}
```

`validateProviderProxyServerContract()` asserts these locks remain in
place if a future override is introduced.

## 5. Runtime guards inside the skeleton

- `FORBIDDEN_ENV_KEYS` is a *refusal list*; the skeleton **never** indexes
  `process.env[...]` with any of these names. The smoke test injects
  canary values into all of them and verifies no canary string ever
  appears in any response.
- No `fetch(`, no `new WebSocket(`, no `import 'ws'` exists in the
  skeleton source.
- The contract module names forbidden hostnames for documentation, but
  the skeleton script source contains zero references to them.
- Every response includes a frozen `safety: { ... false }` block.

## 6. Run locally

```bash
npm run proxy:provider:skeleton
```

By default the server binds to `127.0.0.1:8011`. Override with
`PROVIDER_PROXY_SKELETON_PORT` / `PROVIDER_PROXY_SKELETON_HOST`.

To verify with the safe smoke suite:

```bash
npm run test:provider-proxy-server
```

or the full v1.3.8 smoke suite (26 checks):

```bash
npm run test:smoke
```

## 7. Pairing with the Handshake Sandbox

The skeleton's `/provider-proxy/handshake/dry-run` endpoint maps directly
to the pure state machine in
`src/runtime/providerProxyHandshakeSandbox.js`. See
`docs/PROVIDER_PROXY_HANDSHAKE_SANDBOX.md` for the state model.

## 8. Future evolution

When a real server-side proxy / Robot Gateway / Device Runtime is built,
it MUST:

1. Hold real API keys server-side only.
2. Issue ephemeral session tokens (synthetic / dry-run / future real).
3. Use the same HTTP boundary as the skeleton so the Web Console code
   does not change.
4. Keep `omni.reply_audio_frame.v1` as the realtime voice output. Never
   accept `reply_text -> TTS`.
5. Keep `localdev_mock` as the fallback.
6. Never let the browser hold an API key and never let the browser open
   a real provider socket directly.
