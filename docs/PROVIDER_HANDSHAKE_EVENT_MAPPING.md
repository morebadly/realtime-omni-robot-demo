# Provider Handshake Event Mapping (v1.3.9)

`src/runtime/providerHandshakeEventMapping.js` describes how internal Omni schemas would map to provider-candidate event names during a future server-side handshake adapter.

This module is descriptive only. It sends no provider events and opens no network connection.

## Internal Input Mapping

```text
omni.input_packet.v1  -> session.context.update
omni.audio_frame.v1   -> input_audio_buffer.append
omni.camera_frame.v1  -> input_image_frame.append
omni.interrupt.v1     -> response.cancel
```

Rules:

- `omni.audio_frame.v1` is realtime input media and does not auto-trigger interrupt.
- `omni.camera_frame.v1` is keyframe input and may be drop-old / keep-latest under backpressure.
- `omni.interrupt.v1` is explicit control and remains highest priority.
- `cloudgenie.local_dev.media_ack.v1` remains diagnostics-only and never gates sending.

## Internal Output Mapping

```text
omni.output_state.v1       -> response.state
omni.reply_audio_frame.v1  -> response.audio.delta
omni.output_turn.v1        -> response.done
```

`omni.reply_audio_frame.v1` is the realtime voice output main path. `reply_text` in `omni.output_turn.v1` is for subtitles, logs, debugging, tool context, and Visible Context only; it must not feed TTS.

## Guardrails

- No ASR -> LLM -> TTS regression.
- No `reply_text -> TTS`.
- No `reply_audio_frame` feedback into user input.
- No automatic barge-in from audio frames.
- No real audio / camera upload.
- No real provider socket.
- No realtime billing.
- `localdev_mock` fallback is required.
