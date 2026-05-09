# LocalDev Adapter Contract v1.1.5

This document defines the minimum WebSocket contract that a real `LocalDevOmniAdapter` service should implement before replacing `scripts/localdev-omni-mock-server.mjs`.

The goal is to connect a local Omni model service, such as a Qwen2.5-Omni debug service, without changing the Web Runtime into a text chat app. The Web Runtime remains Omni-first: raw audio frames, selected camera frames, context packets, explicit interrupt controls, and normalized Omni output events.

## Endpoint

Default endpoint:

```text
ws://localhost:8000/omni/realtime
```

The endpoint is configured by the active robot's `LocalDevOmniAdapter` profile.

## Shared Protocol Module

Protocol constants and envelope builders live in:

```text
src/runtime/localDevProtocol.js
```

Both the browser-side `LocalDevOmniBridge` and the local mock server should use this module where possible.

Reference implementations:

```text
scripts/localdev-omni-mock-server.mjs
scripts/localdev-omni-adapter-skeleton.mjs
scripts/localdev-omni-provider-registry.mjs
scripts/localdev-qwen-realtime-client.mjs
scripts/localdev-qwen-realtime-transport.mjs
scripts/localdev-qwen-http-client.mjs
scripts/localdev-omni-placeholder-provider.mjs
scripts/localdev-omni-qwen-provider-stub.mjs
```

Run the adapter skeleton with:

```bash
npm run adapter:localdev:skeleton
```

Run the Qwen provider stub with:

```bash
npm run adapter:localdev:qwen-stub
```

Run the one-shot contract smoke test:

```bash
npm run test:localdev-adapter-contract
```

This script finds a temporary local port, starts one adapter skeleton process, sends one audio frame, one camera frame, one input packet, and one explicit interrupt, then shuts the adapter down. It is a development verification tool only; it is not part of the Web UI startup path and should not run repeatedly during normal realtime calls.

Run the Qwen loopback contract smoke test:

```bash
npm run test:localdev-adapter-contract:qwen-loopback
```

This uses `qwen_stub` plus the local `loopback` realtime transport. It verifies that audio frames, camera frames, input packets, and explicit interrupts reach the same realtime session boundary. It still does not perform real model inference and should not emit fake reply audio.

The skeleton keeps WebSocket/session handling separate from model inference. Replace the placeholder provider with a real provider that exposes the same small surface:

```js
{
  observeMediaFrame(frame, requestId) {},
  getMediaSnapshot() {},
  async runInference({ packet, requestId }) {},
  createReplyAudioPlan({ turn, packet, requestId }) {},
  sendInterrupt(interrupt) {}
}
```

The real provider should be a realtime session adapter, not a one-shot text request. `observeMediaFrame()` should forward audio/camera frames into the local Omni session as they arrive. `runInference()` should bind the current `omni.input_packet.v1` to that realtime session and return an `omni.output_turn.v1` compatible object when structured output is available. Native model audio output should be mapped into `omni.reply_audio_frame.v1`; do not synthesize audio from `reply_text`.

Provider selection is controlled by `LOCALDEV_OMNI_PROVIDER`:

```text
placeholder  # default mock inference and mock reply_audio_frame stream
qwen_stub    # real-provider boundary without real model inference
```

Qwen provider configuration:

```text
LOCALDEV_QWEN_ENDPOINT      # future local Qwen2.5-Omni service endpoint
LOCALDEV_QWEN_TRANSPORT     # default: http_json
LOCALDEV_QWEN_TIMEOUT_MS    # default: 15000
LOCALDEV_QWEN_DRY_RUN       # default: enabled; set 0 only after a real client is implemented
```

`scripts/localdev-qwen-realtime-client.mjs` defines the realtime provider session boundary. `scripts/localdev-qwen-realtime-transport.mjs` owns the transport slot. Current transports:

```text
dry_run      # default; never opens a model connection
loopback     # local boundary test only; not real model inference
unimplemented# returned for unknown transports
```

`scripts/localdev-qwen-http-client.mjs` remains only a normalization/config helper until a real transport is chosen.

Provider failures must be normalized instead of crashing the WebSocket session:

```text
provider missing config -> omni.output_state.v1 state=error + readable omni.output_turn.v1
provider dry-run        -> omni.output_state.v1 state=error + readable omni.output_turn.v1
provider timeout        -> omni.output_state.v1 state=error + readable omni.output_turn.v1
provider exception      -> omni.output_state.v1 state=error + readable omni.output_turn.v1
```

The Web Runtime should never stay indefinitely in `model_thinking` or `model_speaking` because a local model provider failed.

Provider status should be visible in `output_state.reason`, `output_turn.providerResult`, and `output_turn.notes`:

```text
provider name / kind
endpoint / transport / timeout / dryRun
realtime connected / sessionId
input packet count
audio frame count
camera frame count
interrupt count
lastError
```

Realtime rule: do not replace the LocalDev path with `reply_text -> streaming playback`. A real Qwen provider must preserve bidirectional realtime semantics:

```text
input_packet + audio_frame + camera_frame + interrupt
  -> same realtime provider session
  -> output_state + native reply_audio_frame + output_turn
```

## Client To Adapter

### 1. Input Packet

Low-frequency context and routing packet:

```json
{
  "schema": "cloudgenie.local_dev.envelope.v1",
  "type": "omni.input_packet",
  "requestId": "localdev_req_xxx",
  "sentAt": "2026-05-09T00:00:00.000Z",
  "packetSchema": "omni.input_packet.v1",
  "packetId": "omni_xxx",
  "robotId": "robot_demo_001",
  "packet": {
    "schema": "omni.input_packet.v1"
  }
}
```

The adapter should eventually route `packet.input`, `packet.identity`, `packet.runtimeContext`, permissions, plugin manifests, and guardrails into the local Omni service.

### 2. Input Media Frame

Audio and camera frames are sent independently from the input packet:

```json
{
  "schema": "cloudgenie.local_dev.media_envelope.v1",
  "type": "omni.audio_frame",
  "requestId": "localdev_req_xxx",
  "frameSchema": "omni.audio_frame.v1",
  "frameId": "aud_xxx",
  "robotId": "robot_demo_001",
  "frame": {
    "schema": "omni.audio_frame.v1",
    "media": {
      "kind": "audio",
      "codec": "pcm_float32",
      "payloadEncoding": "base64",
      "payloadIncluded": true
    }
  }
}
```

Camera frames use the same envelope with:

```text
type=omni.camera_frame
frame.schema=omni.camera_frame.v1
frame.media.codec=image/jpeg
```

The adapter must not treat input audio frames as automatic interrupts.

### 3. Interrupt Control

User barge-in is explicit:

```json
{
  "schema": "cloudgenie.local_dev.control_envelope.v1",
  "type": "omni.interrupt",
  "requestId": "localdev_req_xxx",
  "interruptSchema": "omni.interrupt.v1",
  "interruptId": "interrupt_xxx",
  "turnId": "turn_xxx",
  "interrupt": {
    "schema": "omni.interrupt.v1",
    "reason": "user_barge_in"
  }
}
```

Only this control message should stop the current output turn in the v1.1.x demo contract.

## Adapter To Client

### 1. Output State

The adapter may stream model lifecycle state:

```json
{
  "schema": "omni.output_state.v1",
  "type": "omni.output_state",
  "requestId": "localdev_req_xxx",
  "turnId": "turn_xxx",
  "state": "thinking"
}
```

Allowed demo states:

```text
thinking
speaking
finished
interrupted
error
```

### 2. Reply Audio Frame

The adapter should map native Omni audio output to `omni.reply_audio_frame.v1`:

```json
{
  "schema": "omni.reply_audio_frame.v1",
  "type": "omni.reply_audio_frame",
  "requestId": "localdev_req_xxx",
  "turnId": "turn_xxx",
  "sequence": 1,
  "isFinal": false,
  "audio": {
    "kind": "reply_audio",
    "codec": "pcm_float32",
    "payloadEncoding": "base64",
    "payloadIncluded": true
  }
}
```

This is not a `reply_text -> TTS` pipeline. `reply_text` is only for subtitles, logs, and debugging.

### 3. Output Turn

The final or partial structured output turn must normalize to `omni.output_turn.v1`:

```json
{
  "schema": "cloudgenie.local_dev.envelope.v1",
  "type": "omni.output_turn",
  "requestId": "localdev_req_xxx",
  "turn": {
    "schema": "omni.output_turn.v1",
    "reply_text": "subtitle/debug text",
    "expression": { "type": "expression.update", "expression": "happy" },
    "tool_intents": []
  }
}
```

Tool intents must still go through Runtime:

```text
ToolIntentRouter -> PluginEngine -> PermissionEngine -> ToolEngine -> ActionLog
```

The adapter must not directly access real email, AC, hardware, DOM, filesystem, or secrets.

### 4. Media Ack

For debugging, the adapter may acknowledge input media frames:

```json
{
  "schema": "cloudgenie.local_dev.media_ack.v1",
  "type": "omni.media_ack",
  "requestId": "localdev_req_xxx",
  "receivedFrame": {
    "schema": "omni.audio_frame.v1",
    "frameId": "aud_xxx",
    "payloadIncluded": true,
    "byteLength": 48000
  }
}
```

## Guardrails

- Do not convert the project into ASR text chat plus TTS.
- Do not infer user emotion from touch, NFC, or camera frames in the frontend.
- Do not make `omni.audio_frame.v1` automatically trigger `omni.interrupt.v1`.
- Do not feed `omni.reply_audio_frame.v1` back into user input.
- Keep `scripts/localdev-omni-mock-server.mjs` as a regression and protocol reference even after real adapter work starts.
