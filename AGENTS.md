# Realtime Omni Robot Demo - Agent Instructions

## Project identity

This project is a realtime Omni robot platform demo.

Current version: v1.1.5.

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
