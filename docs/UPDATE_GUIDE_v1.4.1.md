# Update Guide v1.4.1

## Install And Verify

```bash
npm install
npm run verify
```

The safe smoke suite now reports 29 checks. Verify and smoke do not perform real provider network handshakes and do not require real API keys.

## New Command

```bash
npm run test:provider-real-handshake-probe-plan
```

The manual probe plan script can also be run directly:

```bash
node scripts/provider-real-handshake-probe-plan.mjs bigmodel_glm_realtime_candidate
```

It defaults to disabled / dry-run / no-network behavior. It may report whether a server-side key environment variable is present, but it only outputs `keyPresent` as a boolean and never prints the key value.

## What v1.4.1 Allows

- Generate a redacted probe plan for BigModel / DashScope candidate providers.
- Show endpoint / region / modelId / quota / billing risk as metadata only.
- Validate that dangerous requests are blocked.
- Keep fallback on `localdev_mock`.

## What v1.4.1 Does Not Allow

- No user real realtime call.
- No real provider network handshake.
- No real provider socket.
- No real microphone PCM upload.
- No real camera JPEG upload.
- No realtime billing.
- No browser-held API key.
- No raw key printing.
- No `reply_text -> TTS`.
- No ASR -> LLM -> TTS regression.

`omni.reply_audio_frame.v1` remains the realtime voice output path.
