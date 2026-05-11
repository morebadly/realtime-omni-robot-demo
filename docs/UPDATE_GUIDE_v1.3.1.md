# Update Guide v1.3.1

## Upgrade

```bash
npm install
npm run verify
```

## New Handshake Smoke

```bash
npm run test:provider-handshake
```

This verifies:

- LocalDev Mock does not require a real handshake.
- disabled real providers remain blocked/disabled.
- missing endpoint or API key is reported as unconfigured.
- `health_check_only` cannot enter handshake.
- `handshake_only` can become dry-run ready without opening a socket.
- `realtime_experimental` remains blocked in v1.3.1.
- fallback provider remains `localdev_mock`.
- handshake failure does not affect LocalDev Mock verification.

## Safety Boundary

v1.3.1 does not open a real realtime socket, upload audio/camera media, start billing, or connect TTS. `reply_text` remains subtitles/log/debug only.
