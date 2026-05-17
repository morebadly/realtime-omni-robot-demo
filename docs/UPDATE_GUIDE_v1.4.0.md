# Update Guide v1.4.0

## Install And Verify

```bash
npm install
npm run verify
```

The safe smoke suite now reports 28 checks. Verify and smoke do not perform real provider network calls and do not require real API keys.

## New Commands

```bash
npm run test:provider-real-handshake-preflight
npm run preflight:provider:real-handshake
```

`preflight:provider:real-handshake` is a manual server-side tool skeleton. It is disabled unless `ALLOW_REAL_PROVIDER_HANDSHAKE=1` is set, and it is not included in `npm run verify`.

## Manual Opt-in Shape

```bash
ALLOW_REAL_PROVIDER_HANDSHAKE=1 npm run preflight:provider:real-handshake -- bigmodel_glm_realtime_candidate
```

The tool only reports config validation / endpoint metadata / adapter readiness. It does not open a socket, upload audio, upload camera frames, start billing, call TTS, or print key values.

## New Local Skeleton Endpoint

```text
GET /provider-proxy/providers/:providerId/real-handshake-preflight
```

This endpoint is local Mock metadata only. It returns default blocked status, `networkCallAttempted=false`, `browserForbidden=true`, `keyRequiredServerSide=true`, and `fallbackProviderId=localdev_mock`.

## What v1.4.0 Does Not Allow

- No user real realtime call.
- No real microphone PCM upload.
- No real camera JPEG upload.
- No realtime billing.
- No browser-held API key.
- No browser direct provider socket.
- No real BigModel / DashScope endpoint call.
- No real network in verify/smoke.
- No `reply_text -> TTS`.
- No ASR -> LLM -> TTS regression.

`omni.reply_audio_frame.v1` remains the realtime voice output path and `localdev_mock` fallback remains required.
