# Provider Real Handshake Preflight

v1.4.0 adds a limited real provider handshake preflight boundary. It is not a user realtime call and it does not connect a provider.

## Boundary

- Default is blocked.
- Manual opt-in is required with `ALLOW_REAL_PROVIDER_HANDSHAKE=1`.
- The manual tool is server-side only.
- Browser runtime is forbidden.
- Browser-held API keys are forbidden.
- Browser direct provider sockets are forbidden.
- `npm run verify` and the default smoke suite do not run real network.
- Failure falls back to `localdev_mock`.

## What It Can Do

The manual script may report:

- provider id,
- endpoint kind,
- whether a server-side key environment variable is present,
- adapter readiness,
- config validation status,
- safety fields.

It must print `keyPrinted=false` and must never print the key value.

## What It Must Not Do

- No real audio upload.
- No real camera upload.
- No realtime billing.
- No real provider socket.
- No BigModel / DashScope endpoint call.
- No `reply_text -> TTS`.
- No ASR -> LLM -> TTS regression.

`omni.reply_audio_frame.v1` remains the realtime voice output path.

## Runtime Files

- `src/runtime/providerRealHandshakePreflightDescriptor.js`
- `src/runtime/providerRealHandshakePreflightPolicy.js`
- `scripts/provider-real-handshake-preflight.mjs`

## Local Skeleton Endpoint

```text
GET /provider-proxy/providers/:providerId/real-handshake-preflight
```

The endpoint returns metadata only:

```text
networkCallAttempted=false
opensRealSocket=false
sendsMedia=false
startsBilling=false
replyTextToTts=false
browserForbidden=true
keyRequiredServerSide=true
fallbackProviderId=localdev_mock
```
