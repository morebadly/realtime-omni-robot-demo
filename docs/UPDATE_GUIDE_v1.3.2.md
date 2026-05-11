# Update Guide v1.3.2

## Upgrade

```bash
npm install
npm run verify
```

## New Audio Gate Smoke

```bash
npm run test:provider-audio-gate
```

This verifies:

- default LocalDev Mock does not require real audio upload.
- disabled real providers remain blocked/disabled.
- missing endpoint or API key is reported as unconfigured.
- `allowAudioUpload=false` blocks dry-run readiness.
- `allowAudioUpload=true` with `audio_dry_run` can become ready for local validation.
- valid dry-run payload validation does not persist, upload, or send audio.
- invalid payloads fail locally.
- camera upload, realtime, and billing remain blocked.
- fallback provider remains `localdev_mock`.

## Safety Boundary

v1.3.2 does not send real audio to a provider, does not upload camera media, does not open a realtime socket, does not start billing, and does not connect TTS. `reply_text` remains subtitles/log/debug only.
