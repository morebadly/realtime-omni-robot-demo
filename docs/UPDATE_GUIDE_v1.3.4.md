# Update Guide v1.3.4

## What Changed

v1.3.4 adds a Runtime-level Realtime Mux / Backpressure guard and Session Correlation tags. It is a Runtime improvement only. There is no real cloud realtime, no real audio upload, no real camera upload, no realtime billing, and no `reply_text -> TTS` path.

## Commands

```bash
npm install
npm run verify
```

Run only the new smoke test:

```bash
npm run test:realtime-mux-backpressure
```

The full safe smoke suite is now **22 checks** (`npm run test:smoke`).

## What Changed Under the Hood

- The Web Runtime now decides whether to send / drop_old / coalesce each outbound realtime envelope based on priority + WebSocket `bufferedAmount`.
- `omni.interrupt.v1` is highest priority and is never deferred.
- `omni.audio_frame.v1` is protected; it sends best-effort even under heavy buffer pressure.
- `omni.camera_frame.v1` keeps only the latest keyframe under elevated backpressure.
- `omni.input_packet.v1` can coalesce as a low-frequency context update.
- All realtime envelopes/frames carry an optional `sessionId / streamId / sequence / timestampMs / source / priority` correlation. Existing consumers that ignore these fields keep working.
- `useRuntimeCore.js:handleReplyAudioFramePlayed` no longer reads a stale React snapshot to compute "output done"; it uses the freshly returned `next` state.

## UI

`OmniSessionPanel` now shows three small diagnostic cards near the top of the realtime output grid:

- **Realtime Mux** — sent/dropped/coalesced counters and the mux guardrail summary.
- **WebSocket Backpressure** — `bufferedAmount`, classified buffer level, and the last mux decision.
- **Session Correlation** — `sessionId` plus per-stream sequence counts.

There is no large UI refactor.

## Safety Notes

- `localdev_mock` remains the default provider and required fallback.
- Real providers stay disabled by default.
- `allowAudioUpload`, `allowCameraUpload`, and `allowRealtimeBilling` remain false by default.
- `cloudgenie.local_dev.media_ack.v1` remains diagnostic; it is never a per-frame send gate.
- `reply_text` remains subtitles/log/debug only and is never a TTS input.
- `omni.audio_frame.v1` never auto-interrupts.
- `omni.reply_audio_frame.v1` is never fed back as user input.
