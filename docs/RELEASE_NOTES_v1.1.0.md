# Release Notes v1.1.0

## Summary

v1.1.0 upgrades the LocalDev visual media channel from metadata-only camera frames to real JPEG keyframe payload sending.

The project still does not connect to a real Qwen2.5-Omni service, but the LocalDev bridge can now verify both sides of the realtime Omni media path:

- `omni.audio_frame.v1` carries real browser microphone PCM Float32 payloads.
- `omni.camera_frame.v1` carries real browser camera JPEG payloads.
- `omni.input_packet.v1` remains the low-frequency context packet.

## Added

- `createCameraFrame` now extracts base64 JPEG payload from the captured data URL.
- Camera frames now include:
  - `payloadIncluded`
  - `payloadEncoding`
  - `payload`
  - `byteLength`
  - `width` / `height`
  - `selectorPolicy`
  - `uploadPlan`
  - `jpegQuality`
- LocalDev Mock Server now logs camera frame payload status, byte length, dimensions, and selector policy.
- Omni Session Panel now shows camera frame bytes and payload status.
- Visible Context Panel now shows visual media bytes and payload status.

## Preserved guardrails

- The frontend does not perform visual emotion recognition.
- Camera frames are selected and routed to the Adapter path; interpretation belongs to the Omni model.
- ASR text remains secondary and cannot replace the raw audio channel.
- Touch/NFC events remain factual events only.

## Not implemented yet

- Real Qwen2.5-Omni inference over the received audio/image payloads.
- Reply audio stream playback.
- Interrupt / barge-in state machine.
- Production binary media transport or WebRTC media channel.
- Cloud upload gating beyond the current Demo permission/FramePolicy display.

## Verification

Run:

```bash
npm install
npm run build
```

Then in two terminals:

```bash
npm run mock:localdev
npm run dev
```

Open the app, send an input packet to LocalDev Adapter, then enable camera preview. The mock server should log camera frames similar to:

```text
media_frame schema=omni.camera_frame.v1 ... kind=camera codec=image/jpeg payload=yes bytes=37254 640x360 selector=listening_focus
```
