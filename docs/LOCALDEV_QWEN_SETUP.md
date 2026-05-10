# LocalDev Qwen-Omni Compatible Setup

This document describes the local model side that must exist before replacing the current mock/template service with a real Qwen-Omni compatible inference service, including Qwen2.5-Omni, Qwen3-Omni, or future Qwen3.5-Omni local-compatible providers.

The project remains Omni-first:

- Browser/Web Runtime sends `omni.audio_frame.v1` and selected `omni.camera_frame.v1`.
- `omni.input_packet.v1` is context, routing, identity, permissions, plugin manifest, and debug metadata.
- Native model audio output must become `omni.reply_audio_frame.v1`.
- `reply_text` is only subtitles, logs, and debugging. It must not become TTS.

## Process Layout

```text
Web Runtime
  -> ws://127.0.0.1:8000/omni/realtime
  -> LocalDev Adapter Skeleton
  -> ws://127.0.0.1:8010/qwen/realtime
  -> Local Qwen-Omni compatible service
```

The Web Runtime never connects to the model service directly.

## Required Environment

The shared config helper lives in:

```text
scripts/localdev-qwen-config.mjs
```

Required real-model values:

```powershell
$env:LOCALDEV_OMNI_PROVIDER='qwen_omni'
$env:LOCALDEV_QWEN_ENDPOINT='ws://127.0.0.1:8010/qwen/realtime'
$env:LOCALDEV_QWEN_TRANSPORT='websocket_json'
$env:LOCALDEV_QWEN_TIMEOUT_MS='30000'
$env:LOCALDEV_QWEN_DRY_RUN='0'
```

`LOCALDEV_QWEN_DRY_RUN=0` is the switch that allows a real local model request. Keep dry-run enabled while only checking config.

## Current Template Flow

Terminal 1:

```bash
npm run service:localdev:qwen-template
```

Terminal 2:

```bash
npm run adapter:localdev:qwen-websocket-template
```

Terminal 3:

```bash
npm run dev
```

The template service is not real inference. It proves the session contract:

```text
session.start
audio_frame
camera_frame
input_packet
interrupt
session.close
```

It also proves native-output ordering:

```text
omni.reply_audio_frame.v1
before
omni.output_turn.v1
```

## Health Checks

Check already-running services without starting new processes:

```bash
npm run health:localdev
```

Targeted:

```bash
npm run health:localdev:adapter
npm run health:localdev:qwen
```

These checks only open and close WebSocket connections. They must not be called repeatedly during normal realtime conversation.

## Contract Tests

Config:

```bash
npm run test:localdev-qwen-config
```

Realtime transport:

```bash
npm run test:localdev-qwen-transport
```

Adapter to template service:

```bash
npm run test:localdev-adapter-contract:qwen-template
```

Adapter loopback:

```bash
npm run test:localdev-adapter-contract:qwen-loopback
```

## What The Real Qwen Service Must Do

The local Qwen service should accept WebSocket JSON messages shaped by `scripts/localdev-qwen-realtime-transport.mjs`.

Minimum input support:

- `session.start`
- `audio_frame`
- `camera_frame`
- `input_packet`
- `interrupt`
- `session.close`

Minimum output support:

- `omni.reply_audio_frame.v1` for native model audio output.
- `omni.output_turn.v1` for subtitles, expression hints, tool intents, logs, and trace.
- Error messages that the adapter can normalize into `output_state=error`.

## Manual Debug Checklist

Before replacing the template with a real model:

1. `npm run test:localdev-qwen-config` passes.
2. `npm run health:localdev:qwen` returns `ok`.
3. `npm run adapter:localdev:qwen-websocket-template` works with the template.
4. The Web connection status panel shows LocalDev Adapter connected.
5. Starting realtime audio sends `omni.audio_frame.v1`.
6. Camera keyframes send `omni.camera_frame.v1`.
7. `media_ack` may lag, but sending continues.
8. Reply audio arrives as `omni.reply_audio_frame.v1`, not TTS generated from text.

When all eight are true with the template, replace `scripts/localdev-qwen-service-template.mjs` internals with real local Qwen-Omni compatible session code.
