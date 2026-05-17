# Provider Real Handshake Probe Plan

v1.4.1 adds a manual real provider handshake probe plan layer. It is a plan and diagnostics boundary only. It does not execute a real provider handshake.

## Boundary

- Default is disabled / blocked.
- Probe plans are manual-only and server-side-only.
- Browser runtime is forbidden.
- Network handshake is disabled by default.
- Real provider sockets are forbidden.
- Audio upload, camera upload, billing, and `reply_text -> TTS` are forbidden.
- Failure and unsupported providers fall back to `localdev_mock`.

## Schema

```text
omni.real_provider_handshake_probe_plan.v1
```

The plan includes provider metadata:

- provider id and kind,
- display name,
- endpoint kind and endpoint template,
- region,
- model id,
- quota risk,
- billing risk,
- server-side key environment variable name,
- `keyPresent` boolean only.

The plan locks safety fields:

```text
networkCallAttempted=false
opensRealSocket=false
sendsAudio=false
sendsCamera=false
startsBilling=false
replyTextToTts=false
browserRuntimeAllowed=false
fallbackProviderId=localdev_mock
```

## Key Handling

The plan may report `keyPresent=true` or `keyPresent=false`. It must also report:

```text
keyPrinted=false
rawKeyIncluded=false
diagnostics.redacted=true
diagnostics.rawKeyNeverPrinted=true
```

Raw API keys must never appear in descriptors, diagnostics, logs, Visible Context, Action Log, Runtime config, frontend state, `localStorage`, or `sessionStorage`.

## Manual Tool

```bash
npm run test:provider-real-handshake-probe-plan
node scripts/provider-real-handshake-probe-plan.mjs bigmodel_glm_realtime_candidate
```

The manual script defaults to disabled / dry-run / no-network. It may inspect whether a server-side environment variable is present, but it only outputs boolean key presence and never prints the value.

## Still Forbidden

- No real provider network handshake.
- No real provider socket.
- No real audio upload.
- No real camera upload.
- No realtime billing.
- No `reply_text -> TTS`.
- No ASR -> LLM -> TTS regression.

`omni.reply_audio_frame.v1` remains the realtime voice output path.
