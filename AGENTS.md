# Realtime Omni Robot Demo - Agent Instructions

## Project identity

This project is a realtime Omni robot platform demo.

Current version: v1.3.7.

Tech stack:
- Vite
- React
- JavaScript / JSX
- Runtime modules under `src/runtime`
- UI components under `src/components`

The product is not just a local chatbot demo. It is intended to become a cloud-first, locally debuggable, mobile, multi-network realtime Omni robot platform with plugin and permission systems.

## Core architecture rules

1. WebUI is only a client/control console.
2. Core robot logic should live in Runtime, not directly inside UI components.
3. Robot identity must use stable `robot_id` internally.
4. User-facing robot names must use mutable `display_name`.
5. Do not hard-code CloudGenie as the platform name. It is only an example user-defined robot name.
6. One Web/App should eventually manage multiple robots through Robot Registry.
7. Model access must go through Model Adapter:
   - LocalDevOmniAdapter
   - ThirdPartyCloudOmniAdapter
   - SelfHostedCloudOmniAdapter
   - OfflinePetEngine
8. Plugins must go through:
   Trigger -> Condition -> Action -> Permission Engine -> Tool Engine -> Action Log.
9. Tools such as AC, email, expression, role switch, robot motion, touch, NFC should be plugin actions, not separate top-level user entrances.
10. User code plugins must return action intents. They must not directly access hardware, email, DOM, filesystem, or secrets.

## Input strategy

1. Raw microphone audio stream should go to Omni Adapter.
2. ASR text is only for subtitles, logs, debugging, and keyword helper logic.
3. Camera keyframes should go to Omni Adapter.
4. Camera should not produce independent emotion summaries.
5. Touch and NFC are factual events only:
   - `touch.head.tap`
   - `nfc.study_card.detected`
6. Runtime should not label the user as happy/sad/angry based on touch or NFC.

## Expression style

Robot expressions should follow the LOOI-like screen style:
- black screen
- blue-green glowing eyes
- purple/blue light effects
- simple symbols
- mouth animation
- angry mark
- stars
- shy/sleepy states

Expressions are robot reactions, not user emotion labels.

Avoid showing fake emotion confidence percentages such as `78%`.

## Current important modules

Runtime:
- `src/runtime/useRuntimeCore.js`
- `src/runtime/robotRegistry.js`
- `src/runtime/robotProfile.js`
- `src/runtime/robotRuntimeConfig.js`
- `src/runtime/modelAdapters.js`
- `src/runtime/localDevProtocol.js`
- `src/runtime/localDevOmniClient.js`
- `src/runtime/pluginEngine.js`
- `src/runtime/pluginManifest.js`
- `src/runtime/permissionEngine.js`
- `src/runtime/toolIntentRouter.js`
- `src/runtime/toolEngine.js`
- `src/runtime/actionLibrary.js`
- `src/runtime/networkManager.js`
- `src/runtime/framePolicy.js`
- `src/runtime/visualFrameBuffer.js`
- `src/runtime/omniPacket.js`
- `src/runtime/omniTurnSimulator.js`
- `src/runtime/omniOutputFrames.js`
- `src/runtime/realtimeOutputChannel.js`

UI:
- `src/App.jsx`
- `src/components/RobotRegistryPanel.jsx`
- `src/components/RobotProfilePanel.jsx`
- `src/components/ModelProviderPanel.jsx`
- `src/components/OmniSessionPanel.jsx`
- `src/components/RealtimeAudioOutputPlayer.jsx`
- `src/components/PluginCenter.jsx`
- `src/components/PermissionPanel.jsx`
- `src/components/RobotFace.jsx`
- `src/components/VisibleContext.jsx`
- `src/components/ActionLog.jsx`

Mock / local dev tools:
- `scripts/localdev-omni-mock-server.mjs`
- `scripts/localdev-omni-adapter-skeleton.mjs`
- `scripts/localdev-omni-provider-registry.mjs`
- `scripts/localdev-qwen-realtime-client.mjs`
- `scripts/localdev-qwen-realtime-transport.mjs`
- `scripts/localdev-qwen-http-client.mjs`
- `scripts/localdev-omni-placeholder-provider.mjs`
- `scripts/localdev-omni-qwen-provider-stub.mjs`
- `scripts/localdev-adapter-contract-smoke.mjs`
- `scripts/localdev-qwen-realtime-transport-smoke.mjs`
- `docs/LOCALDEV_ADAPTER_CONTRACT.md`

## Commands

Install dependencies:

```bash
npm install
```

Run development server:

```bash
npm run dev
```

Run LocalDev mock Omni server in another terminal:

```bash
npm run mock:localdev
```

Run LocalDev adapter skeleton in another terminal:

```bash
npm run adapter:localdev:skeleton
```

Run LocalDev Qwen provider stub:

```bash
npm run adapter:localdev:qwen-stub
```

Run LocalDev Qwen loopback transport boundary:

```bash
npm run adapter:localdev:qwen-loopback
```

Run the reusable LocalDev Qwen service template:

```bash
npm run service:localdev:qwen-template
```

Run the LocalDev adapter against the template service:

```bash
npm run adapter:localdev:qwen-websocket-template
```

Check already-running LocalDev services without starting child processes:

```bash
npm run health:localdev
```

Run the one-shot LocalDev adapter contract smoke test:

```bash
npm run test:localdev-adapter-contract
```

Run the Qwen loopback contract smoke test:

```bash
npm run test:localdev-adapter-contract:qwen-loopback
```

Run the Qwen WebSocket adapter contract smoke test:

```bash
npm run test:localdev-adapter-contract:qwen-websocket
```

Run the Qwen template service adapter contract smoke test:

```bash
npm run test:localdev-adapter-contract:qwen-template
```

Run the Qwen WebSocket JSON transport smoke test:

```bash
npm run test:localdev-qwen-transport
```

Build:

```bash
npm run build
```

Run quick project verification:

```bash
npm run verify:quick
```

Run the full safe smoke suite:

```bash
npm run verify
```

Clean generated local artifacts before packaging:

```bash
npm run clean
```

## Change policy

When making changes:
1. Keep the project runnable.
2. Run `npm run build` before finalizing.
3. Update docs when architecture changes.
4. Add release notes for meaningful versions.
5. Do not commit `node_modules` or `dist`.
6. Prefer small focused changes over large rewrites.
7. Do not migrate to TypeScript unless explicitly requested.
8. Do not connect real email, real AC, real hardware, or real cloud APIs unless explicitly requested.
9. Keep mock implementations safe and clearly labeled.

## Near-term roadmap

Near-term development should focus on:
1. Codex migration hygiene.
2. RuntimeCore separation.
3. LocalDevOmniAdapter mock and real connection preparation.
4. Real audio chunk / camera frame channel boundaries.
5. Multi-robot runtime sessions.
6. Plugin manifest and permission enforcement.
7. User code plugin sandbox hardening.
8. Docs and release packaging.


## v1.1.3 realtime media and interrupt rule

- `omni.input_packet.v1` carries low-frequency context and guardrails.
- `omni.audio_frame.v1` now carries real browser microphone PCM Float32 chunks during LocalDev testing.
- Audio payload is base64 encoded inside the demo JSON envelope so the mock server can verify `payload=yes` and `bytes > 0`.
- This is still a development bridge, not the final production transport; future RobotMicAdapter may use PCM, Opus, WebRTC, or binary WebSocket frames.
- `omni.camera_frame.v1` carries selected keyframe JPEG payloads during LocalDev testing.
- `omni.output_state.v1` carries service-side output state such as thinking / speaking / finished.
- `omni.reply_audio_frame.v1` carries Omni output audio frames. It must not be described or implemented as reply_text -> TTS.
- `omni.interrupt.v1` is the explicit barge-in control event. Do not make `omni.audio_frame.v1` automatically interrupt output in this mock version.
- Prevent self-interruption: robot playback captured by the mic is not enough to stop the current output turn.
- Do not make ASR text the primary input.
- Do not create frontend visual emotion summaries.

## v1.1.3 implementation boundary

- Keep LocalDev output audio as safe Mock realtime media frames.
- Do not connect real Qwen2.5-Omni, real cloud APIs, real TTS, real email, real AC, or real hardware unless explicitly requested.
- `reply_text` is subtitle/log/debug context only; do not make it the source for speech synthesis.
- Keep input and output media channels separate: `omniMediaFrames.js` is Web/Robot -> Omni; `realtimeOutputChannel.js` is Omni -> Web/Robot.
- v1.1.3 barge-in is manual Mock control only. Do not add automatic VAD/AEC-based interruption yet.

## v1.1.3 realtime session state machine rule

- `realtimeSessionState.js` owns the observable call lifecycle: idle / listening / user_speaking / model_thinking / model_speaking / interrupted / recovering / error.
- Do not bypass the state machine when adding future realtime input/output behavior.
- `omni.audio_frame.v1` is input media and may continue during model_speaking, but it must not automatically become interrupt.
- `omni.reply_audio_frame.v1` is output media and must never be fed back as user input.
- `omni.interrupt.v1` remains the explicit control event for user barge-in in this Mock demo.
- Any future automatic barge-in must first add VAD/AEC or equivalent self-interruption protection and must keep the manual interrupt path.


## v1.1.4 UI debug ergonomics

- Keep the top hero compact; do not re-add a large wall of architecture chips.
- Use DebugNavigation anchors for long-page debugging.
- Keep VisibleContext compact and readable; use collapsible details for long safety notes.
- Do not change realtime protocol semantics when making UI-only improvements.

## v1.1.5 UI rule

The app is now a click-first debug workbench. Do not keep adding large always-visible panels to the main page. Put lower-frequency tools such as Plugin Center, Permissions, Visible Context, Logs, and Omni Session details behind DebugNavigation views or internal component tabs.

## LocalDev Qwen provider rule

The future real Qwen provider must remain a realtime session adapter. Do not implement it as `reply_text -> streaming playback` or as a traditional text-chat request. Audio frames, camera frames, input packets, and interrupt controls must belong to the same provider session, and model-native audio output should map to `omni.reply_audio_frame.v1`.

The `websocket_json` Qwen transport is only a generic local realtime message carrier. It sends `session.start`, `audio_frame`, `camera_frame`, `input_packet`, `interrupt`, and `session.close` messages to a configured local WebSocket endpoint. It may receive structured `omni.output_turn.v1` and native `omni.reply_audio_frame.v1` messages, but it does not define real Qwen inference semantics and must not synthesize fake speech from `reply_text`.

Use `npm run test:localdev-adapter-contract:qwen-websocket` to verify the full LocalDev adapter path into a fake local Qwen WebSocket endpoint. Use `npm run test:localdev-qwen-transport` only when testing the transport module directly.

When a provider exposes `onReplyAudioFrame(listener)`, the adapter skeleton may forward native `omni.reply_audio_frame.v1` before the final structured `omni.output_turn.v1` arrives. Keep this early-output path intact; it is closer to realtime calling than waiting for text-like turn completion.

The `qwen_websocket` contract smoke test asserts that native reply audio reaches the adapter client before the structured output turn envelope. Do not relax that ordering unless the realtime adapter design changes explicitly.

Runtime code and Web UI must not call `test:localdev-*` scripts. Those scripts may start temporary child processes and are for development verification only. Use `health:localdev*` commands for no-side-effect connectivity checks.


## v1.1.6 maintenance rule

- Keep `package.json`, README, AGENTS, architecture docs, release notes, and update guide on the same version.
- Run `npm run verify:quick` for small edits and `npm run verify` before packaging or tagging.
- Use `npm run clean` before creating a zip package so `node_modules/`, `dist/`, `package-lock.json`, and local logs are not shipped.
- Do not treat Codex or ChatGPT-generated code as complete until the working tree is clean and verification commands pass.
- v1.1.x remains Mock-first. Do not enable real Qwen/DashScope traffic, real hardware, real email, or real AC by default.

## v1.2.0 LocalDev Adapter Contract rule

- v1.2.0 stabilizes the LocalDev Adapter Contract. It does not enable real Omni providers, DashScope/Qwen realtime cloud traffic, hardware, automatic VAD/AEC barge-in, real email, real AC, or real TTS.
- Runtime and adapters must keep these schemas aligned in docs and smoke tests: `omni.input_packet.v1`, `omni.audio_frame.v1`, `omni.camera_frame.v1`, `omni.output_state.v1`, `omni.output_turn.v1`, `omni.reply_audio_frame.v1`, `omni.interrupt.v1`, and `cloudgenie.local_dev.media_ack.v1`.
- Contract tests must cover safe success and error paths: media ack, thinking/speaking/finished output state, native reply audio, explicit interrupt cancellation, malformed messages, unsupported schemas, duplicate/out-of-order reply audio handling, interrupt without an active turn, and media frames before an active output turn.
- Media frames may arrive before an output turn as realtime pre-roll. They should be acknowledged and marked as not interrupting; they must not trigger barge-in by themselves.

## v1.2.2 LocalDev recovery rule

- v1.2.2 stabilizes LocalDev Adapter recovery after disconnects, send failures, mid-output-stream disconnects, no-op interrupts, malformed messages, and unsupported schemas.
- Reconnect recovery must not replay old `omni.input_packet.v1` automatically.
- Disconnected output must clear or stop stale `omni.reply_audio_frame.v1` playback state so RobotFace cannot stay speaking forever.
- Protocol warnings/errors are diagnostics; after malformed or unsupported messages, the same connection may continue processing later valid messages.
- This remains safe Mock-only work: no real Omni provider, DashScope/Qwen cloud realtime, hardware, email, AC, TTS, or automatic VAD/AEC barge-in.

## v1.2.3 Adapter Contract test matrix rule

- v1.2.3 expands LocalDev Adapter Contract smoke coverage. It does not change realtime protocol semantics or add real provider traffic.
- Contract matrix tests should cover input packets, audio frames, camera frames, output states, output turns, reply audio frames, explicit interrupts, malformed messages, and unsupported schemas.
- Mock server compliance remains safe and local only; no real cloud API, model, hardware, TTS, email, or AC access is allowed.

## v1.2.4 Provider Gate rule

- v1.2.4 only adds provider configuration gates, feature flags, visible safety state, and readiness placeholders. It must not open a real Omni provider session.
- The default provider remains `localdev_mock`; real providers are disabled unless explicit configuration and feature flags are present.
- `allowAudioUpload`, `allowCameraUpload`, and `allowRealtimeBilling` default to false and must stay false for the safe Mock demo.
- Real secrets must not be placed in frontend-readable Vite variables or committed files.
- Mock fallback, permission gate, and visible context are required before any future real provider experiment.
- `reply_text` remains subtitles/log/debug only and must not become TTS input.

## v1.3.0 Provider Health Check rule

- v1.3.0 adds provider health-check preflight only. It must not establish a real realtime Omni call.
- Health checks must return `canStartRealtime=false`, `canSendAudio=false`, `canSendCamera=false`, and `canStartBillingSession=false`.
- `health_check_only` may validate configuration/readiness, but it must not send `omni.audio_frame.v1`, `omni.camera_frame.v1`, or billing/session start messages.
- Missing endpoint/API key, disabled providers, failed health checks, or unsupported modes must keep fallback on `localdev_mock`.
- `health:dashscope-omni` remains dry-run/config validation only unless a future version explicitly changes that boundary.

## v1.3.1 Provider Handshake rule

- v1.3.1 adds provider handshake dry-run state and ready/error/fallback event contracts only.
- Handshake must return `canOpenRealtimeSocket=false`, `canSendAudio=false`, `canSendCamera=false`, and `canStartBillingSession=false`.
- `handshake_only` may become `ready_for_handshake` or `handshake_dry_run_ok`, but it must not open a real socket or send media.
- `realtime_experimental` remains blocked in v1.3.1.
- Handshake events are diagnostics only and must not trigger `omni.audio_frame.v1`, `omni.camera_frame.v1`, billing, or TTS.

## v1.3.2 Provider Audio Dry-run rule

- v1.3.2 adds an audio upload experiment gate and local dry-run payload validator only.
- Audio gate must return `canSendRealAudio=false`, `canSendCamera=false`, `canStartRealtime=false`, and `canStartBillingSession=false`.
- `audio_dry_run` may validate an `omni.audio_frame.v1` payload shape locally, but must not persist, upload, or send it to a real provider.
- Camera upload, realtime billing, real realtime sockets, and TTS remain blocked.
- `reply_text` remains subtitles/log/debug only and must not become speech synthesis input.

## v1.3.3 Provider Camera Dry-run rule

- v1.3.3 adds a camera upload experiment gate and local dry-run JPEG payload validator only.
- Camera gate must return `canSendRealCamera=false`, `canSendAudio=false`, `canStartRealtime=false`, and `canStartBillingSession=false`.
- `camera_dry_run` may validate an `omni.camera_frame.v1` JPEG payload shape locally, but must not persist, upload, or send it to a real provider.
- Audio upload, realtime billing, real realtime sockets, and TTS remain blocked.
- `reply_text` remains subtitles/log/debug only and must not become speech synthesis input.

## v1.3.4 Realtime Mux / Backpressure / Session Correlation rule

- v1.3.4 adds two Runtime-only modules: `realtimeSessionCorrelation` and `realtimeMediaMux`.
- `omni.interrupt.v1` is always highest priority and must never be blocked or deferred by media frames or context updates.
- `omni.audio_frame.v1` is protected; it must continue to send best-effort even when WebSocket `bufferedAmount` is elevated or overflow.
- `omni.camera_frame.v1` must drop old frames and keep the latest keyframe under elevated/high/overflow backpressure.
- `omni.input_packet.v1` may coalesce/replace as a low-frequency context update; it must not block audio.
- `cloudgenie.local_dev.media_ack.v1` is diagnostics-only. It must never be used as a per-frame send gate.
- All realtime envelopes/frames may carry optional `sessionId / streamId / sequence / timestampMs / source / priority` correlation fields, but the LocalDev contract stays backward compatible for consumers that ignore them.
- Real audio upload, real camera upload, realtime billing, real provider sockets, and `reply_text -> TTS` remain blocked.
- LocalDev Mock fallback remains required.

## v1.3.5 Provider Adapter Contract / Real Provider Safety Boundary rule

- v1.3.5 adds the Provider Adapter Contract (`omni.provider_adapter.v1`) and the synthetic-only `providerAdapters/syntheticProviderAdapter`.
- Every provider adapter (real, synthetic, mock, offline) must implement the 10 required surface methods: `createSession`, `closeSession`, `sendInputPacket`, `sendAudioFrame`, `sendCameraFrame`, `sendInterrupt`, `onOutputState`, `onOutputTurn`, `onReplyAudioFrame`, `onError`.
- Every adapter must hard-lock `canOpenRealtimeSocket=false`, `canSendRealAudio=false`, `canSendRealCamera=false`, `canStartBillingSession=false`, `replyTextToTts=false`, `fallbackProviderId='localdev_mock'`.
- `mergeProviderCapability` is narrowing-only; it cannot widen capabilities or weaken safety requirements.
- Synthetic adapter must reject any real audio or camera payload and must never report `sentToProvider=true`.
- Real provider API keys / tokens must never enter the frontend bundle, `import.meta.env.*`, `localStorage`, runtime config snapshots, action logs, traces, descriptor JSON, or Visible Context. Real secrets must live in a server-side proxy / Robot Gateway / Device Runtime.
- The Provider Adapter Contract is descriptive and safety-locking only. It does not start sessions or upload media in v1.3.5.
- LocalDev Mock fallback remains required and the LocalDev Adapter Contract on the wire is unchanged.

## v1.3.6 Real Socket Sandbox / Synthetic-only Provider Session rule

- v1.3.6 adds `omni.provider_socket_sandbox.v1`: a Runtime-only synthetic socket sandbox state machine with 9 states and 8 events.
- Real provider kinds (`real_cloud`, `self_hosted`) MUST be routed to `blocked` regardless of which sandbox event arrives.
- Synthetic / localdev_mock kinds may drive the full lifecycle: `requested → synthetic_opening → synthetic_open → synthetic_ready → synthetic_closed`, with a separate `provider.socket.fallback` event landing in `fallback_to_localdev_mock`.
- Every sandbox state and every adapter lifecycle method MUST report `opensRealSocket=false`, `sentToProvider=false`, `uploaded=false`, `persisted=false`, `billingStarted=false`, `syntheticOnly=true`.
- The realtime voice output is `omni.reply_audio_frame.v1` native audio frames. `reply_text` is subtitle / log / debug / Visible Context only and MUST NOT be sent to `speechSynthesis`, MiniMax TTS, DashScope TTS, browser TTS, or any other TTS provider as part of the main realtime path.
- ASR → LLM → TTS regression is explicitly forbidden by `guardrails.asrLlmTtsRegressionForbidden = true` in every descriptor.
- If a future provider can only return text and TTS (no native `omni.reply_audio_frame.v1`), it MUST be registered as a non-omni provider capability and MUST NOT become the main realtime Omni provider.
- Real provider API keys / tokens never enter the sandbox state, descriptor, logs, or Visible Context. The synthetic adapter and sandbox never carry a real secret.
- LocalDev Mock fallback remains required and the LocalDev Adapter Contract on the wire is unchanged.

## v1.3.7 Provider Proxy Skeleton / Ephemeral Session Token rule

- v1.3.7 adds three Runtime-only safety contracts: `omni.provider_proxy_contract.v1`, `omni.provider_proxy_request.v1`, `omni.provider_proxy_decision.v1`, plus the ephemeral token descriptor `omni.ephemeral_session_token.v1`.
- A future real Realtime Omni Provider session MUST be opened by a server-side proxy / Robot Gateway / Device Runtime. The browser MUST NOT hold a real API key and MUST NOT open a real provider socket directly.
- Ephemeral session tokens in v1.3.7 are `synthetic_only` or `dry_run_only` only. `safety.opensRealSocket`, `safety.canSendRealAudio`, `safety.canSendRealCamera`, `safety.canStartBillingSession`, `safety.replyTextToTts`, `safety.sentToProvider`, `safety.uploaded`, `safety.persisted` MUST all be `false`.
- `providerProxyPolicy.evaluateProviderProxyRequest()` MUST:
  - strip any `apiKey` / `secret` / `tokenRawValue` / `authorization` / `client_secret` / `password` etc. fields and mark `secretStripped=true`;
  - deny real audio / camera / billing / socket / TTS requests with explicit `blockReasons`;
  - deny `real_cloud` / `self_hosted` providers by default;
  - only grant `synthetic_only` / `dry_run_only` tokens to `synthetic_test` / `localdev_mock` / `offline_pet_engine`;
  - always return `fallbackProviderId="localdev_mock"`.
- `providerSocketSandbox` MUST require an accepted ephemeral token (`synthetic_only`) before driving synthetic_ready. A real-cloud / self-hosted provider MUST stay `blocked` even with a synthetic token.
- Real provider API keys / tokens never enter the descriptor, logs, Visible Context, localStorage, sessionStorage, or any UI state.
- `omni.reply_audio_frame.v1` remains the realtime voice output path. `reply_text` MUST NOT be a TTS input. ASR → LLM → TTS regression remains forbidden.
- LocalDev Mock fallback remains required and the LocalDev Adapter Contract on the wire is unchanged.
