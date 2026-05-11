# Provider Secret Boundary (v1.3.5)

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
