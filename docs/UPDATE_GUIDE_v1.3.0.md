# Update Guide v1.3.0

## Upgrade

```bash
npm install
npm run verify
```

## New Health Check Smoke

```bash
npm run test:provider-health-check
```

This verifies:

- default LocalDev Mock does not require real health check.
- disabled real providers remain disabled/blocked.
- missing endpoint or API key is reported as unconfigured.
- `health_check_only` does not allow media frames.
- `realtime_experimental` remains blocked in v1.3.0.
- fallback provider remains `localdev_mock`.
- health check failure does not affect LocalDev Mock verification.

## DashScope Health Command

```bash
npm run health:dashscope-omni
```

In v1.3.0 this command is dry-run/config validation only. It does not open a real realtime WebSocket session, upload audio/camera media, start billing, or connect TTS.

## Safety Boundary

`reply_text` remains subtitles/log/debug only. Output audio still belongs to `omni.reply_audio_frame.v1`, and interrupt remains explicit `omni.interrupt.v1`.
