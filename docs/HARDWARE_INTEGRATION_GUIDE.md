# Hardware Integration Guide

This document describes how a real robot body should connect to the Realtime Omni Robot platform after the current Web demo evolves beyond mock runtime.

The key rule is: **Web is a console, not the robot core**. Real microphones, cameras, speakers, motors, touch sensors, NFC readers, batteries, network modems, and local secrets should be owned by the robot-side Runtime or a Robot Gateway, not by the browser UI.

## 1. Target Topology

```text
Mobile App / Web Console
  - robot selection
  - permission management
  - logs and traces
  - connection status
  - debug controls

        ⇅ authenticated control channel

Cloud Control Plane
  - Robot Registry
  - robot_id binding
  - user / tenant auth
  - plugin manifest distribution
  - permission policy
  - cloud Omni adapter routing
  - action log sync

        ⇅ realtime session / command channel

Robot Gateway / Device Runtime
  - stable robot_id
  - hardware adapters
  - local permission guard
  - realtime media session
  - tool/action executor
  - offline pet engine
  - local action log buffer

        ⇅ hardware bus / OS APIs

Robot Body
  - microphone array
  - camera
  - speaker
  - screen / face display
  - touch sensors
  - NFC reader
  - servos / motors
  - Wi-Fi / eSIM / physical SIM
  - battery / charging dock
```

During development, the `LocalDevOmniAdapter` and mock scripts stand in for the Robot Gateway and model service. In production, the Web console should not directly connect to hardware.

## 2. Identity And Binding

Every physical robot must have a stable `robot_id`.

Recommended fields:

```json
{
  "robot_id": "robot_home_002",
  "hardware_serial": "CG-DEV-2026-0002",
  "display_name": "Home Robot",
  "owner_user_id": "user_xxx",
  "tenant_id": "tenant_xxx",
  "device_public_key_id": "key_2026_05",
  "runtime_version": "device-runtime-0.1.0",
  "capabilities": [
    "audio_in",
    "audio_out",
    "image_frame",
    "touch_event",
    "nfc_event",
    "screen_expression",
    "motor_motion",
    "wifi",
    "cellular"
  ]
}
```

Rules:

- `robot_id` is stable and used for binding, permissions, logs, cloud registration, model adapter config, plugin config, and hardware identity.
- `display_name` is user editable and only affects UI and conversational presentation.
- Hardware serials and device keys should never be used as display names.
- Rebinding a used robot should require owner confirmation and should rotate or revoke previous session credentials.

## 3. Device Runtime Modules

The robot-side Runtime should mirror the Web demo architecture, but own real hardware access.

Minimum modules:

```text
DeviceRuntimeCore
RobotIdentityStore
ConnectionManager
RealtimeSessionManager
ModelAdapterClient
PermissionEngine
PluginIntentRunner
ToolEngine
HardwareAdapterRegistry
ActionLogBuffer
RuntimeTraceBuffer
OfflinePetEngine
```

Hardware adapters:

```text
RobotMicAdapter
RobotCameraAdapter
RobotSpeakerAdapter
RobotScreenFaceAdapter
RobotTouchAdapter
RobotNfcAdapter
RobotMotionAdapter
RobotNetworkAdapter
RobotBatteryAdapter
```

The Web demo's `RuntimeCore` should gradually become a console/runtime simulator. The production robot should not depend on the browser being open.

## 4. Realtime Media Path

The platform must stay Omni-first:

```text
microphone PCM / Opus frames
  → RobotMicAdapter
  → RealtimeSessionManager
  → ModelAdapterClient
  → Cloud Omni / LocalDev Omni / Self-hosted Omni

camera keyframes
  → RobotCameraAdapter
  → Frame Buffer
  → Frame Selector
  → ModelAdapterClient
  → Omni
```

Do not convert the product into:

```text
ASR text → text chat → TTS
```

ASR text may exist, but only for subtitles, logs, debugging, and plugin keyword assistance.

Recommended frame types:

```text
omni.audio_frame.v1
omni.camera_frame.v1
omni.input_packet.v1
omni.interrupt.v1
omni.output_state.v1
omni.reply_audio_frame.v1
omni.output_turn.v1
```

`media_ack` is a health and diagnostics signal. It must not become a per-frame blocking gate for microphone or camera frame sending. Realtime media should continue flowing while ack counts are used to detect lag, disconnection, or adapter failure.

For real hardware, prefer a low-latency media transport such as WebRTC, RTP, or a persistent binary WebSocket. The current JSON WebSocket mock is acceptable for development and contract testing, but it is not the final high-performance media transport.

## 5. Control And Tool Path

All hardware actions should go through the unified plugin/tool chain:

```text
Trigger
  → Condition
  → Action Intent
  → Permission Engine
  → Tool Engine
  → Hardware Adapter
  → Action Log
  → Runtime Trace
```

Examples:

```text
robot.expression.write → RobotScreenFaceAdapter
robot.motion.write     → RobotMotionAdapter
touch.read             → RobotTouchAdapter
nfc.read               → RobotNfcAdapter
voice.output           → RobotSpeakerAdapter
```

User code plugins must only return action intents. They must not directly access motors, files, DOM, email, air conditioners, secrets, or OS APIs.

## 6. Permission Guard On Device

Cloud permissions are not enough. The device Runtime must enforce permissions locally before executing sensitive actions.

Required checks:

```text
plugin.run
voice.input
voice.output
voice.cloud_upload
camera.read
camera.cloud_upload
touch.read
nfc.read
robot.expression.write
robot.motion.write
home.ac.write
email.draft
email.send
plugin.device_control
```

Every allow/deny decision should be logged:

```json
{
  "robot_id": "robot_home_002",
  "event": "permission.check",
  "permission": "robot.motion.write",
  "status": "allowed",
  "source": "plugin.touch_head_cute",
  "timestamp": "2026-05-10T10:00:00.000Z"
}
```

## 7. Network Modes

The robot should support these connection modes:

| Mode | Transport | Omni Route | Notes |
| --- | --- | --- | --- |
| Home | Wi-Fi | Cloud Omni | Main product experience |
| Mobile | eSIM / physical SIM | Cloud Omni | Audio-first, lower keyframe rate |
| Local Dev | LAN / localhost gateway | LocalDevOmniAdapter | Development and debugging |
| Self-hosted | Wi-Fi / WAN | SelfHostedCloudOmniAdapter | Future private deployment |
| Offline | No network | OfflinePetEngine | Expressions, touch, NFC, preset motions, basic plugins |

Network switching should be requested through Runtime APIs, not by Web directly controlling system network interfaces.

## 8. Suggested Device API Boundary

Initial Robot Gateway endpoints:

```text
GET  /health
GET  /identity
GET  /capabilities
POST /session/realtime/start
POST /session/realtime/interrupt
POST /session/realtime/stop
POST /tools/intent
GET  /logs/recent
GET  /trace/recent
```

Realtime channel:

```text
wss://robot-gateway.local/robots/{robot_id}/realtime
```

Development equivalent:

```text
ws://127.0.0.1:8000/omni/realtime
```

The API should authenticate both user and robot. A console connection should not be able to send arbitrary motor commands without the device Runtime checking permissions.

## 9. Hardware Bring-up Phases

Recommended order:

1. **Loopback hardware simulator**
   - Keep current Web demo.
   - Add a Robot Gateway mock that exposes device health, identity, and fake sensor events.
   - No real motors or cloud APIs.

2. **Audio device bridge**
   - Replace browser microphone with `RobotMicAdapter`.
   - Send real audio frames to LocalDev or cloud adapter.
   - Keep reply audio as native `omni.reply_audio_frame.v1`, not TTS from text.

3. **Camera keyframe bridge**
   - Replace browser camera preview with `RobotCameraAdapter`.
   - Add real Frame Buffer and Frame Selector.
   - Send only selected keyframes to Omni.

4. **Screen face bridge**
   - Move LOOI-style face rendering to robot display.
   - Web remains a preview/control console.

5. **Touch / NFC bridge**
   - Emit fact events only, such as `touch.head.tap` or `nfc.study_card.detected`.
   - Do not infer user emotion from these events.

6. **Motion bridge**
   - Add `RobotMotionAdapter`.
   - All motion commands require permission checks and rate/safety limits.

7. **Offline pet mode**
   - Ensure expressions, touch, NFC, preset motions, and basic plugins work without cloud.

8. **Cloud registration and fleet control**
   - Add secure registration, multi-robot control, remote logs, and update strategy.

## 10. Safety And Reliability Checklist

Before connecting real hardware:

- Stable `robot_id` exists and survives reboot.
- Device credentials are provisioned and rotatable.
- Web cannot directly control hardware.
- Local Permission Engine runs before every sensitive action.
- Motion commands have rate limits and emergency stop.
- Audio path supports interrupt/barge-in without treating input audio as automatic interruption.
- Camera keyframes use Frame Selector policy, not frontend emotion summaries.
- Offline mode works without cloud.
- Logs and traces are buffered locally when network is down.
- Plugin sandbox cannot access secrets, files, hardware, or OS APIs directly.

## 11. What This Demo Already Prepares

Current repo pieces that map to future hardware integration:

```text
src/runtime/useRuntimeCore.js
src/runtime/robotRegistry.js
src/runtime/robotProfile.js
src/runtime/modelAdapters.js
src/runtime/localDevProtocol.js
src/runtime/localDevOmniClient.js
src/runtime/omniMediaFrames.js
src/runtime/omniOutputFrames.js
src/runtime/realtimeOutputChannel.js
src/runtime/permissionEngine.js
src/runtime/pluginEngine.js
src/runtime/toolIntentRouter.js
src/runtime/toolEngine.js
scripts/localdev-omni-mock-server.mjs
scripts/localdev-omni-adapter-skeleton.mjs
```

The next real implementation should add a `RobotGateway` or `DeviceRuntime` layer instead of pushing hardware logic into `App.jsx` or UI components.
