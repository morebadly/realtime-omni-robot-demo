# Realtime Mux / Backpressure / Session Correlation (v1.3.4)

## Scope

v1.3.4 is a Runtime-only mux/backpressure/correlation guard. It does not enable real provider realtime calls, real audio upload, real camera upload, real realtime billing, or `reply_text -> TTS`. The demo remains a Mock Realtime Omni bidirectional media channel against `localdev_mock`.

## Goals

- Make the multi-stream realtime path observable.
- Prevent camera frames from blocking audio frames under WebSocket backpressure.
- Keep `omni.interrupt.v1` as the highest priority message and always-deliverable.
- Make `cloudgenie.local_dev.media_ack.v1` strictly diagnostic; it is never a per-frame send gate.
- Add `sessionId / streamId / sequence / timestampMs / source / priority` correlation across `omni.input_packet.v1`, `omni.audio_frame.v1`, `omni.camera_frame.v1`, `omni.interrupt.v1`, `omni.output_state.v1`, `omni.output_turn.v1`, and `omni.reply_audio_frame.v1`.

## Modules

```text
src/runtime/realtimeSessionCorrelation.js
src/runtime/realtimeMediaMux.js
```

`realtimeSessionCorrelation.js` produces a stable `sessionId` per Runtime session, plus stream identifiers for `audio_input`, `camera_input`, `context_input`, `control`, and `audio_output`. `tagFrameWithCorrelation` attaches the correlation fields to any realtime envelope/frame without changing its existing schema.

`realtimeMediaMux.js` is a pure function module. It exposes:

- `priorityForSchema` / `priorityForFrame`
- `classifyBufferedAmount` (normal / elevated / high / overflow)
- `decideMuxAction({ priority, bufferedLevel })`
- `applyMuxDecision(state, event)` (counters, dropReasons, coalescedPending)
- `summarizeMuxState` / `getMuxCapability`

The mux is consumed by `useRuntimeCore.js` to decide whether to send, drop-old, coalesce, or defer outbound realtime envelopes. The bridge `localDevOmniClient.js` exposes `getBufferedAmount()` so the mux can read the underlying WebSocket buffer pressure.

## Priority Order

```text
highest   omni.interrupt.v1
high      omni.output_state.v1 / session control
realtime  omni.audio_frame.v1 / omni.reply_audio_frame.v1
medium    omni.camera_frame.v1
low       omni.input_packet.v1 / context / log
```

## Backpressure Rules

| Buffered level | Audio | Camera | Input packet | Interrupt |
| -------------- | ----- | ------ | ------------ | --------- |
| normal         | send  | send   | send         | send      |
| elevated       | send  | drop_old (keep latest) | coalesce | send |
| high           | send  | drop_old (keep latest) | coalesce | send |
| overflow       | best-effort send | drop_old | coalesce | send |

- `media_ack` is a diagnostic. It is never used as a per-frame send gate.
- `omni.interrupt.v1` is always allowed through regardless of buffer pressure.
- Camera coalescing keeps the latest keyframe (`coalescedPending.camera`) and increments the dropped counter.
- Input packet coalescing keeps the latest pending context (`coalescedPending.input_packet`).

## Session Correlation Fields

All realtime envelopes/frames carry these optional correlation fields when produced through Runtime:

```text
sessionId    string  (stable per Runtime session)
streamId     string  (per kind: audio_input, camera_input, context_input, control, audio_output)
streamKind   string  ('audio_input' | 'camera_input' | 'context_input' | 'control' | 'audio_output' | 'state' | 'output_turn')
sequence    number  (per stream)
timestampMs number  (Date.now())
source      string  ('client_runtime_audio' / 'client_runtime_camera' / 'client_runtime_context' / 'client_runtime' / 'local_dev_mock_server')
priority    string  ('highest' | 'high' | 'realtime' | 'medium' | 'low')
```

The LocalDev envelopes (`cloudgenie.local_dev.envelope.v1`, `cloudgenie.local_dev.media_envelope.v1`, `cloudgenie.local_dev.control_envelope.v1`) propagate `sessionId / streamId / sequence / priority / timestampMs` at the envelope level. Existing consumers that only read `schema / type / requestId / packet / frame / interrupt` keep working unchanged.

## Output Side (Stale State Fix)

`useRuntimeCore.js:handleReplyAudioFramePlayed` previously computed `outputDone` from a stale React snapshot. v1.3.4 reads the freshly computed `next` state returned from `markReplyAudioFramePlayed` inside the `setRealtimeOutput` updater, and then transitions the realtime session state machine with the correct `outputDone` flag.

## Safety Invariants

- No real audio upload.
- No real camera upload.
- No realtime billing.
- No real provider socket open.
- No `reply_text -> TTS` path.
- `localdev_mock` fallback remains required.
- `omni.audio_frame.v1` never auto-interrupts.
- `omni.reply_audio_frame.v1` never feeds back as user input.

## Test

```bash
npm run test:realtime-mux-backpressure
```

This pure-module smoke test covers:

1. audio_frame does not wait for `media_ack`.
2. camera_frame drops old / keeps latest under backpressure.
3. input_packet does not block audio_frame.
4. interrupt is highest priority and never deferred.
5. interrupt flushes the realtime output queue.
6. reply_audio_frame queue is independent of output_turn / reply_text / logs.
7. `bufferedAmount` thresholds correctly classify normal / elevated / high / overflow.
8. reply_text is never a TTS input.
9. Real audio upload remains blocked.
10. Real camera upload remains blocked.
11. Realtime billing remains blocked.
12. Real provider socket remains blocked.
13. `localdev_mock` fallback is required.
14. `sessionId / streamId / sequence` correlate `input_packet / audio_frame / camera_frame / interrupt / output_state / reply_audio_frame` and the corresponding LocalDev envelopes.

It is also included in `npm run test:smoke`, which is now 22 checks.
