# Update Guide v1.3.9

## Install And Verify

```bash
npm install
npm run verify
```

The safe smoke suite now reports 27 checks.

## New Command

```bash
npm run test:provider-specific-handshake-adapter
```

This checks BigModel / DashScope candidate metadata, event mapping, error mapping, provider-specific fallback, skeleton endpoints, secret stripping, and the 27-check smoke suite registration.

## New Local Skeleton Endpoints

```text
GET  /provider-proxy/providers
GET  /provider-proxy/providers/:providerId/handshake-adapter
POST /provider-proxy/providers/:providerId/handshake/dry-run
GET  /provider-proxy/providers/:providerId/event-mapping
GET  /provider-proxy/providers/:providerId/error-mapping
```

These endpoints are local Mock only. They return dry-run metadata and safety-locked envelopes.

## What v1.3.9 Does Not Allow

- No real BigModel / DashScope endpoint calls.
- No real provider WebSocket.
- No real microphone PCM upload.
- No real camera JPEG upload.
- No realtime billing.
- No real provider API key in the browser, Runtime config, descriptor, logs, Action Log, Visible Context, localStorage, sessionStorage, or Git.
- No `reply_text -> TTS`.
- No ASR -> LLM -> TTS regression.

Real secrets must still live in a future server-side proxy / Robot Gateway / Device Runtime.
