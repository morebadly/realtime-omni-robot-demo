# Release Notes v1.3.4

## Realtime Mux / Backpressure / Session Correlation Guard

v1.3.4 adds a Runtime-level mux/backpressure guard and session correlation tags across the realtime contract while keeping the demo safe Mock-first.

## Added

- `src/runtime/realtimeSessionCorrelation.js` — stable `sessionId`, per-kind `streamId`, per-stream `sequence`, `timestampMs`, `source`, and `priority` correlation.
- `src/runtime/realtimeMediaMux.js` — priority-aware send/drop_old/coalesce decision, `bufferedAmount` classification (normal / elevated / high / overflow), and diagnostic counters.
- `getBufferedAmount()` on `LocalDevOmniBridge` so mux decisions can read WebSocket backpressure.
- Correlation fields on `omni.input_packet.v1`, `omni.audio_frame.v1`, `omni.camera_frame.v1`, `omni.interrupt.v1`, `omni.output_state.v1`, and `omni.reply_audio_frame.v1` (all backward compatible).
- `sessionId / streamId / sequence / priority / timestampMs` on `cloudgenie.local_dev.envelope.v1`, `cloudgenie.local_dev.media_envelope.v1`, and `cloudgenie.local_dev.control_envelope.v1`.
- Small diagnostics row in `OmniSessionPanel`: Realtime Mux, WebSocket Backpressure, and Session Correlation.
- `test:realtime-mux-backpressure` smoke test (now 22 checks in the safe smoke suite).
- `docs/REALTIME_MUX_BACKPRESSURE.md`.

## Fixed

- `useRuntimeCore.js:handleReplyAudioFramePlayed` no longer reads a stale `realtimeOutput` snapshot when computing `outputDone`; it now uses the freshly returned `next` state from `markReplyAudioFramePlayed`.

## Safety Boundary

- `media_ack` remains diagnostics only.
- `omni.interrupt.v1` remains the highest priority and is never blocked by camera or context traffic.
- `omni.audio_frame.v1` is protected: it sends best-effort even under elevated/overflow backpressure.
- `omni.camera_frame.v1` drops old frames and keeps the latest keyframe under backpressure.
- `omni.input_packet.v1` may coalesce/replace as a low-frequency context update.
- No real audio upload, no real camera upload, no realtime billing, no real provider socket, no `reply_text -> TTS`.
- LocalDev Mock fallback remains required.
