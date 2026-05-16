# LocalDev Adapter Contract v1.3.9

## v1.3.9 Provider-specific Handshake Adapter Addendum

v1.3.9 does not change the LocalDev wire contract. It adds provider-specific dry-run descriptors and local skeleton endpoints for BigModel / DashScope candidate metadata only. The LocalDev schemas remain `omni.input_packet.v1`, `omni.audio_frame.v1`, `omni.camera_frame.v1`, `omni.interrupt.v1`, `omni.output_state.v1`, `omni.output_turn.v1`, `omni.reply_audio_frame.v1`, and `cloudgenie.local_dev.media_ack.v1`.

Provider-specific event mapping remains descriptive. `omni.reply_audio_frame.v1` is still the realtime voice output, `reply_text` is still subtitle/log/debug only, audio frames do not auto-interrupt, and `media_ack` remains diagnostics-only. `localdev_mock` remains the fallback.

## v1.3.8 Provider Proxy Server Skeleton / Handshake Sandbox Addendum

v1.3.8 introduces a local Mock HTTP skeleton (`scripts/provider-proxy-skeleton-server.mjs`) and a pure handshake-sandbox state machine (`omni.provider_proxy_handshake_sandbox.v1`). Neither contacts a real provider. The skeleton refuses to read `BIGMODEL_API_KEY` / `DASHSCOPE_API_KEY` / `OPENAI_API_KEY` / `MINIMAX_API_KEY` etc. and never issues outbound `fetch` / `WebSocket`. The LocalDev contract on the wire is unchanged. `localdev_mock` remains the only working realtime provider in the demo and is always the fallback.

BigModel and DashScope realtime candidates exist now only as `providerKind='real_cloud_candidate'` placeholders. They have `supportsRealtimeSocket=false`, `supportsAudioInput=false`, `supportsCameraInput=false`, `requiresServerSideSecret=true`, `browserDirectProviderSocketAllowed=false`, and `candidateOnly=true`. The socket sandbox and the proxy handshake sandbox both route them to `blocked` / `provider_handshake_blocked`.

## v1.3.7 Provider Proxy / Ephemeral Session Token Addendum

v1.3.7 adds a safety contract layer for "future real provider must be reached through a server-side proxy / Robot Gateway / Device Runtime", with `omni.provider_proxy_contract.v1`, `omni.provider_proxy_request.v1`, `omni.provider_proxy_decision.v1`, and `omni.ephemeral_session_token.v1`. The LocalDev contract on the wire is unchanged. `localdev_mock` is still the default and only working realtime provider in the demo.

The Provider Socket Sandbox is now token-gated: synthetic providers cannot reach `synthetic_ready` without a valid `synthetic_only` ephemeral token descriptor; real-cloud / self-hosted providers stay `blocked` even with a token. Real audio upload, camera upload, billing, real provider socket, and `reply_text -> TTS` remain blocked.

## v1.3.6 Real Socket Sandbox / Synthetic-only Session Addendum

v1.3.6 adds a Provider Socket Sandbox layer (`omni.provider_socket_sandbox.v1`) above the existing Provider Adapter Contract. The LocalDev contract on the wire is unchanged. The sandbox is a Runtime-only state machine: it does not open a real WebSocket, does not upload real audio or camera, does not start billing, and does not connect `reply_text` to TTS.

Real provider kinds (`real_cloud`, `self_hosted`) are always routed to `blocked` in the sandbox. Synthetic / localdev_mock kinds can drive `requested → synthetic_opening → synthetic_open → synthetic_ready → synthetic_closed`. Every state carries hard-locked safety fields: `opensRealSocket=false`, `sentToProvider=false`, `uploaded=false`, `persisted=false`, `billingStarted=false`, `syntheticOnly=true`, plus `replyAudioFrameNative=true`, `replyTextSubtitleOnly=true`, `replyTextToTts=false`.

ASR → LLM → TTS regression is explicitly forbidden by `guardrails.asrLlmTtsRegressionForbidden = true` in the descriptor. `omni.reply_audio_frame.v1` remains the realtime voice output; `reply_text` remains subtitles / log / debug only.

## v1.3.5 Provider Adapter Contract Addendum

v1.3.5 introduces a higher-level Provider Adapter Contract (`omni.provider_adapter.v1`) above the LocalDev Adapter Contract. The LocalDev contract on the wire is unchanged. The Provider Adapter Contract describes what every future provider adapter (real cloud, self-hosted, synthetic, offline engine, or LocalDev Mock) must implement and what it is allowed to do:

```text
required methods:
  createSession / closeSession
  sendInputPacket / sendAudioFrame / sendCameraFrame / sendInterrupt
  onOutputState / onOutputTurn / onReplyAudioFrame / onError

required schemas:
  omni.input_packet.v1
  omni.audio_frame.v1
  omni.camera_frame.v1
  omni.interrupt.v1
  omni.output_state.v1
  omni.output_turn.v1
  omni.reply_audio_frame.v1
```

Default safety locks for every adapter (real or synthetic): `canOpenRealtimeSocket=false`, `canSendRealAudio=false`, `canSendRealCamera=false`, `canStartBillingSession=false`, `replyTextToTts=false`. `localdev_mock` remains the required fallback. See `docs/PROVIDER_ADAPTER_CONTRACT.md` and `docs/PROVIDER_SECRET_BOUNDARY.md` for details.

## v1.3.4 Realtime Mux / Backpressure / Session Correlation Addendum

v1.3.4 extends the LocalDev Adapter Contract with optional, backward-compatible correlation fields:

```text
sessionId    stable per Runtime session
streamId     per kind (audio_input / camera_input / context_input / control / audio_output)
streamKind   audio_input | camera_input | context_input | control | audio_output | state | output_turn
sequence     per stream
timestampMs  client-side timestamp
source       client_runtime_audio | client_runtime_camera | client_runtime_context | client_runtime | local_dev_mock_server
priority     highest | high | realtime | medium | low
```

These fields are added at the top level of `omni.input_packet.v1`, `omni.audio_frame.v1`, `omni.camera_frame.v1`, `omni.interrupt.v1`, `omni.output_state.v1`, and `omni.reply_audio_frame.v1` when produced through Runtime. They are also propagated through `cloudgenie.local_dev.envelope.v1`, `cloudgenie.local_dev.media_envelope.v1`, and `cloudgenie.local_dev.control_envelope.v1`. Consumers that only read existing fields keep working unchanged.

Mux rules (Runtime-side decision; LocalDev contract is unchanged):

```text
omni.interrupt.v1        priority=highest  always send
omni.output_state.v1     priority=high     always send
omni.audio_frame.v1      priority=realtime always send (protected)
omni.camera_frame.v1     priority=medium   drop_old / keep latest under backpressure
omni.input_packet.v1     priority=low      coalesce / replace under backpressure
```

`cloudgenie.local_dev.media_ack.v1` remains diagnostics-only. It is never a per-frame send gate. `reply_text` remains subtitles/log/debug only and is never a TTS input.

## v1.2.4 Provider Gate Boundary

The LocalDev Adapter Contract remains the safe baseline and fallback for future real providers. v1.2.4 adds configuration gates only:

- `localdev_mock` is the default provider and required fallback.
- Real providers are hidden/blocked unless explicit feature flags and configuration are present.
- `health_check_only` must not send `omni.audio_frame.v1` or `omni.camera_frame.v1`.
- `allowAudioUpload`, `allowCameraUpload`, and `allowRealtimeBilling` default to false.
- `reply_text` remains subtitles/log/debug context only and is not TTS input.

No real Provider traffic is introduced in this contract version.

## v1.2.3 Compliance Matrix

The LocalDev contract matrix must cover the safe Mock Server path:

```text
input_packet      -> output_state thinking, output_turn, output_state speaking
audio_frame       -> media_ack
camera_frame      -> media_ack
reply_audio_frame -> native output media frame, not TTS
interrupt         -> output_state interrupted
malformed message -> output_state error, connection remains usable
unsupported schema-> output_state error, connection remains usable
```

The matrix is implemented by `npm run test:localdev-contract-matrix` and is included in the safe smoke suite. It does not call real cloud APIs, real models, real hardware, real email, real AC, or real TTS.

## v1.2.2 Recovery Addendum

LocalDev adapters and clients must recover cleanly from disconnect and protocol-error paths:

- WebSocket disconnect during thinking/speaking must move Runtime toward `disconnected`, `recovering`, or `error`; it must not stay permanently in `model_thinking` or `model_speaking`.
- Output queue state must stop stale playback and clear queued `omni.reply_audio_frame.v1` frames when the stream disconnects mid-turn.
- Sending `omni.input_packet.v1`, `omni.audio_frame.v1`, `omni.camera_frame.v1`, or `omni.interrupt.v1` while the socket is unavailable must return an explicit failure and must not be counted as successfully sent media.
- Reconnect may emit `reconnecting` / `recovered`, but it must not automatically replay the old input packet.
- Malformed JSON and unsupported schemas should be reported as diagnostics while allowing later valid messages on the same connection.
- `omni.interrupt.v1` with no active turn remains a no-op warning/interrupted state, not a fatal error.

These rules do not change the core contract: `audio_frame` is not interrupt, `reply_audio_frame` is not user input, and `reply_text` is not TTS.

v1.2.0 is the stable LocalDev Adapter Contract baseline. It keeps LocalDev safe and Mock-first while making the Runtime <-> Adapter message surface explicit and testable.

Required contract schemas:

```text
Client -> Adapter:
- omni.input_packet.v1
- omni.audio_frame.v1
- omni.camera_frame.v1
- omni.interrupt.v1

Adapter -> Client:
- omni.output_state.v1
- omni.output_turn.v1
- omni.reply_audio_frame.v1
- cloudgenie.local_dev.media_ack.v1
```

Required safe error-path behavior:

- malformed JSON or malformed envelopes must return `omni.output_state.v1` with `state=error`.
- unsupported schemas must return `omni.output_state.v1` with `state=error` and must not crash the WebSocket session.
- media frames may arrive before an active output turn as realtime pre-roll; they must receive `cloudgenie.local_dev.media_ack.v1` with `sessionActive=false` and must not imply interrupt.
- `omni.interrupt.v1` with no active output turn must return `omni.output_state.v1` with `state=interrupted` and a no-op reason.
- duplicate `omni.reply_audio_frame.v1` frames are dropped by Runtime output queue accounting.
- out-of-order `omni.reply_audio_frame.v1` frames are retained in playback order and counted for diagnostics.
- adapter disconnects must clear active local output timers and must not leave the Runtime waiting indefinitely.

This document defines the minimum WebSocket contract that a real `LocalDevOmniAdapter` service should implement before replacing `scripts/localdev-omni-mock-server.mjs`.

The goal is to connect a local Omni model service, such as a Qwen-Omni compatible debug service, without changing the Web Runtime into a text chat app. The Web Runtime remains Omni-first: raw audio frames, selected camera frames, context packets, explicit interrupt controls, and normalized Omni output events.

## Endpoint

Default endpoint:

```text
ws://127.0.0.1:8000/omni/realtime
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

Run the Qwen-Omni compatible provider boundary with:

```bash
npm run adapter:localdev:qwen-omni
```

The older `adapter:localdev:qwen-stub` command is kept as a compatibility alias.

Run the reusable local Qwen WebSocket service template:

```bash
npm run service:localdev:qwen-template
```

In another terminal, run the LocalDev adapter against that template:

```bash
npm run adapter:localdev:qwen-websocket-template
```

The template listens on `ws://127.0.0.1:8010/qwen/realtime`, acknowledges realtime input messages, emits one native `omni.reply_audio_frame.v1`, and then emits one structured `omni.output_turn.v1`. It is meant as a replacement point for real local Qwen-Omni compatible inference code.

Check already-running LocalDev services without starting new child processes:

```bash
npm run health:localdev
```

Targeted checks:

```bash
npm run health:localdev:adapter
npm run health:localdev:qwen
```

These health checks only open and close WebSocket connections. They do not start adapter, template, model, or browser processes.

Runtime rule: normal development should use long-lived service processes and a reused realtime session. The `test:localdev-*` scripts may start temporary child processes, but they are test-only and must not be called from Web UI or Runtime code.

Run the one-shot contract smoke test:

```bash
npm run test:localdev-adapter-contract
```

This script finds a temporary local port, starts one adapter skeleton process, sends one audio frame, one camera frame, one input packet, and one explicit interrupt, then shuts the adapter down. It is a development verification tool only; it is not part of the Web UI startup path and should not run repeatedly during normal realtime calls.

Run the Qwen loopback contract smoke test:

```bash
npm run test:localdev-adapter-contract:qwen-loopback
```

This uses the Qwen-Omni compatible provider plus the local `loopback` realtime transport. It verifies that audio frames, camera frames, input packets, and explicit interrupts reach the same realtime session boundary. It still does not perform real model inference and should not emit fake reply audio.

Run the Qwen WebSocket adapter contract smoke test:

```bash
npm run test:localdev-adapter-contract:qwen-websocket
```

This starts a fake local model WebSocket server, starts one adapter skeleton process with `qwen_omni + websocket_json`, sends one audio frame, one camera frame, one input packet, and one explicit interrupt through the adapter, then verifies that the fake model service sees the realtime messages in one session. The fake service returns a structured `omni.output_turn.v1` and one native `omni.reply_audio_frame.v1`; no real model inference is implemented, and the audio frame is not generated from `reply_text`.

Run the template service adapter contract smoke test:

```bash
npm run test:localdev-adapter-contract:qwen-template
```

This starts `scripts/localdev-qwen-service-template.mjs` as a child process, starts one adapter skeleton process against it, and verifies the same native audio-before-output-turn behavior. Use this test when editing the reusable template service.

Run the Qwen WebSocket JSON transport smoke test:

```bash
npm run test:localdev-qwen-transport
```

This starts a fake local model WebSocket server, connects `scripts/localdev-qwen-realtime-client.mjs` through the `websocket_json` transport, and verifies that `session.start`, `audio_frame`, `camera_frame`, `input_packet`, `interrupt`, and `session.close` share one session id. It also verifies that inbound structured `omni.output_turn.v1` and native `omni.reply_audio_frame.v1` messages can be observed by the realtime client. It is transport validation only; it does not define the final Qwen service API.

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
qwen_omni    # Qwen-Omni compatible provider boundary without real model inference
qwen_stub    # compatibility alias for qwen_omni
```

Qwen provider configuration:

```text
LOCALDEV_QWEN_ENDPOINT      # future local Qwen-Omni compatible service endpoint
LOCALDEV_QWEN_TRANSPORT     # default: http_json
LOCALDEV_QWEN_TIMEOUT_MS    # default: 15000
LOCALDEV_QWEN_DRY_RUN       # default: enabled; set 0 only after a real client is implemented
```

The shared configuration checklist lives in:

```text
scripts/localdev-qwen-config.mjs
docs/LOCALDEV_QWEN_SETUP.md
```

Validate it with:

```bash
npm run test:localdev-qwen-config
```

`scripts/localdev-qwen-realtime-client.mjs` defines the realtime provider session boundary. `scripts/localdev-qwen-realtime-transport.mjs` owns the transport slot. Current transports:

```text
dry_run      # default; never opens a model connection
loopback     # local boundary test only; not real model inference
websocket_json# generic local WebSocket JSON carrier for realtime message testing
unimplemented# returned for unknown transports
```

`scripts/localdev-qwen-http-client.mjs` remains only a normalization/config helper until a real transport is chosen.

The generic `websocket_json` transport sends messages shaped as:

```json
{
  "schema": "localdev.qwen.realtime_message.v1",
  "type": "audio_frame",
  "sessionId": "qwen_rt_xxx",
  "requestId": "localdev_req_xxx",
  "frame": { "schema": "omni.audio_frame.v1" }
}
```

Allowed transport message types:

```text
session.start
audio_frame
camera_frame
input_packet
interrupt
session.close
```

The real provider may replace or extend this carrier after the actual local Qwen service contract is known. Until then, this transport must remain a session boundary test and must not synthesize audio from `reply_text`.

The generic transport can also receive a structured output turn:

```json
{
  "schema": "localdev.qwen.output_turn.v1",
  "type": "output_turn",
  "sessionId": "qwen_rt_xxx",
  "requestId": "localdev_req_xxx",
  "turn": { "schema": "omni.output_turn.v1" }
}
```

The Qwen-Omni compatible provider may normalize this structured turn into the standard LocalDev adapter output chain. Native model audio output is still a separate future step and should map to `omni.reply_audio_frame.v1`, not to TTS generated from `reply_text`.

The generic transport can receive native reply audio frames too:

```json
{
  "schema": "omni.reply_audio_frame.v1",
  "type": "omni.reply_audio_frame",
  "requestId": "localdev_req_xxx",
  "audio": {
    "kind": "reply_audio",
    "payloadIncluded": true
  }
}
```

The provider may forward these native frames through the adapter skeleton output path. This is still a contract test path; a final production adapter should stream native audio frames as they arrive rather than waiting on a text turn.

The adapter skeleton now supports that early-output behavior for providers that expose `onReplyAudioFrame(listener)`: native `omni.reply_audio_frame.v1` messages can be forwarded to the Web Runtime while the provider is still waiting for a structured `omni.output_turn.v1`. The structured turn remains useful for subtitles, expression updates, tool intents, logs, and traceability; it must not become the source of speech synthesis.

The WebSocket contract tests assert this ordering explicitly: in the `qwen_websocket` scenario, `omni.reply_audio_frame.v1` must reach the adapter client before the structured `omni.output_turn` envelope. This prevents the demo path from regressing into a text-turn-first playback pipeline.

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

Only this control message should stop the current output turn in the v1.2.0 demo contract.

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
