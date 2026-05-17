# Provider Secret Boundary (v1.4.0)

## v1.4.0 Real Handshake Preflight Reminder

Limited real provider handshake preflight remains server-side only and manual opt-in only. The browser cannot hold real provider keys and cannot open real provider sockets. `ALLOW_REAL_PROVIDER_HANDSHAKE=1` only enables the manual script to check whether a server-side key is present; it must not print the key value.

`npm run verify` and the smoke suite do not run real network and do not depend on real provider API keys. The local skeleton preflight endpoint returns metadata only and does not read `BIGMODEL_API_KEY` / `DASHSCOPE_API_KEY` values.

No real audio upload, real camera upload, realtime billing, real provider socket, or `reply_text -> TTS` path is allowed. `localdev_mock` fallback remains required.

## v1.3.9 Provider-specific Reminder

Provider-specific handshake adapters may name endpoint templates as documentation metadata, but they must not read real `BIGMODEL_API_KEY`, `DASHSCOPE_API_KEY`, or other provider secrets. Real secrets remain server-side only in a future proxy / Robot Gateway / Device Runtime. Provider-specific dry-run endpoints strip secret-like request fields and do not echo raw values.

## v1.3.8 Provider Proxy Server Skeleton Reminder

v1.3.8 ships a local Mock HTTP skeleton at `scripts/provider-proxy-skeleton-server.mjs`. The skeleton is the place where, in a future production deployment, a real server-side proxy / Robot Gateway / Device Runtime would hold real provider API keys. The skeleton itself **never** reads `BIGMODEL_API_KEY`, `BIGMODEL_TOKEN`, `DASHSCOPE_API_KEY`, `DASHSCOPE_TOKEN`, `QWEN_API_KEY`, `OPENAI_API_KEY`, `MINIMAX_API_KEY`, or any similar env var. The smoke test injects canary values into all of them and asserts no canary string ever appears in any server response. The skeleton source also contains no reference to any real provider hostname and no `fetch` / `WebSocket` / `import 'ws'` call. The boundary is `127.0.0.1` only.

BigModel and DashScope realtime candidates (`bigmodel_glm_realtime_candidate`, `dashscope_qwen_omni_candidate`) are capability placeholders only, with `providerKind='real_cloud_candidate'` and `candidateOnly=true`. They are blocked everywhere: the proxy policy denies their session requests, the socket sandbox denies their socket events, and the new handshake sandbox routes them to `provider_handshake_blocked` even when a valid synthetic token is presented.

## v1.3.7 Provider Proxy Reminder

v1.3.7 formalizes "real provider API keys must live in a server-side proxy / Robot Gateway / Device Runtime" as a code-level contract (`omni.provider_proxy_contract.v1`). The frontend never holds a real API key, never sends one in a request, and never receives one in a decision envelope. Any `apiKey` / `secret` / `tokenRawValue` / `authorization` / `client_secret` field passed to `evaluateProviderProxyRequest()` is stripped before evaluation; `decision.secretStripped` is set to `true` and the raw value never appears anywhere in the response. Ephemeral session tokens (`omni.ephemeral_session_token.v1`) are `synthetic_only` / `dry_run_only` only — they are not real provider tokens and they cannot unlock real audio / camera / billing / socket / TTS.

## v1.3.6 Socket Sandbox Reminder

v1.3.6 adds a synthetic-only socket sandbox. It does not change the secret boundary: real provider API keys / tokens still must NOT enter the frontend bundle, browser runtime config, descriptor JSON, sandbox state JSON, logs, traces, or Visible Context. The synthetic adapter and socket sandbox never carry a real secret because they never open a real socket.



## Goal

Make explicit where real provider secrets are allowed to live and where they are not. v1.3.5 does not introduce real provider traffic, but it locks down the secret boundary so that future real provider work cannot accidentally place credentials in the browser bundle or in browser-side runtime config.

## Rule

Real provider API keys, OAuth tokens, signed session tokens, and other secrets MUST NOT enter:

- the frontend bundle (Vite build output, JS chunks shipped to the browser),
- frontend-readable Vite environment variables (`import.meta.env.*`),
- the Web Console `localStorage` / `sessionStorage`,
- any `providerConfig.apiKey` field that is later serialized into `omni.provider_adapter.v1` descriptor JSON,
- Runtime config snapshots, action logs, traces, or Visible Context.

Real provider secrets MUST live in one of the following secret-holders, never in the Web Console:

- a server-side proxy that exchanges browser session tokens for short-lived realtime tokens,
- a Robot Gateway / Device Runtime that talks to the real provider directly,
- a self-hosted Omni Gateway service that performs auth, billing, and rate limiting before reaching the provider.

The Web Console is allowed to control permissions, status, debug, and logs only. It is not allowed to hold real provider credentials.

## Provider Adapter Contract Field

`createProviderAdapterDescriptor(...)` returns:

```js
{
  // ...
  secretBoundary: {
    apiKeyInFrontend: false,
    apiKeyInRuntimeConfig: false,
    requiresServerSideSecret: boolean,
    serverSideProxyRecommended: boolean,
    deviceRuntimeRecommended: boolean,
    note: '...'
  },
  guardrails: {
    apiKeyMustNotEnterFrontend: true,
    // ...
  }
}
```

For real providers (`dashscope_qwen_omni`, `custom_realtime_omni`), `requiresServerSideSecret` is `true` and `serverSideProxyRecommended` is `true`.

For `localdev_mock`, `synthetic_test`, and `offline_pet_engine`, `requiresServerSideSecret` is `false`.

`apiKeyInFrontend` is hard-locked to `false` in v1.3.5 regardless of provider; this is the safety invariant.

## What `.env.example` And Browser Config May Hold

```text
OMNI_PROVIDER                 // provider id (non-secret)
OMNI_PROVIDER_MODE            // mock / health_check_only / handshake_only / audio_dry_run / camera_dry_run
OMNI_PROVIDER_ENDPOINT        // endpoint URL (non-secret)
OMNI_FALLBACK_PROVIDER        // must be localdev_mock for now
OMNI_ALLOW_AUDIO_UPLOAD       // boolean feature flag (not a secret)
OMNI_ALLOW_CAMERA_UPLOAD      // boolean feature flag (not a secret)
OMNI_ALLOW_REALTIME_BILLING   // boolean feature flag (not a secret)
```

`OMNI_PROVIDER_API_KEY` is treated as a configured-flag (`apiKeyConfigured=true|false`) only. The real key never enters the browser. If a future real provider integration is built, the auth token issuer lives on a server-side proxy or Robot Gateway.

## Smoke Test

`scripts/provider-adapter-contract-smoke.mjs` exercises:

- a descriptor built with an adapter `{ apiKey: 'sk-not-real-but-should-not-leak' }` must not serialize that key anywhere in the descriptor JSON,
- `secretBoundary.apiKeyInFrontend === false`,
- `secretBoundary.apiKeyInRuntimeConfig === false`,
- `requiresServerSideSecret === true` for real provider IDs,
- `guardrails.apiKeyMustNotEnterFrontend === true`.

## Future Boundary

When v1.4.x or later introduces real provider traffic, the design must use ephemeral session tokens issued by a server-side proxy or Robot Gateway. Static API keys must not be embedded in the browser. The synthetic adapter remains useful as a contract regression target.
