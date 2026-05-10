# Update Guide v1.2.0

## Scope

Use this guide when updating from v1.1.6 to v1.2.0.

v1.2.0 is a LocalDev Adapter Contract stabilization release. It stays Mock-first and does not enable real provider, hardware, email, AC, or TTS integrations by default.

## Steps

1. Enter the project directory.

```cmd
cd /d C:\Users\Administrator\Desktop\realtime-omni-robot-demo
```

2. Install dependencies.

```bash
npm install
```

3. Run the full safe verification flow.

```bash
npm run verify
```

4. Review the working tree before committing.

```bash
git status
git diff --stat
```

## New Verification Coverage

`npm run verify` now explicitly covers:

- build
- version doctor
- LocalDev adapter contract smoke
- realtime readiness smoke
- LocalDev preflight smoke
- safe smoke suite

## Contract Notes

- Media frames before an active output turn are allowed as realtime pre-roll and receive `media_ack` with `sessionActive=false`.
- Malformed messages and unsupported schemas return `omni.output_state.v1` with `state=error`.
- Interrupt without an active turn returns `omni.output_state.v1` with `state=interrupted` and a no-op reason.
- Duplicate reply audio frames are dropped; out-of-order frames are retained in playback order and counted for diagnostics.
