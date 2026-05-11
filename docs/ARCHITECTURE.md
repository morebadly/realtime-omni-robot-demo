# 架构说明 v1.3.5

## v1.3.5 Provider Adapter Contract / Real Provider Safety Boundary Architecture

v1.3.5 adds a stable Provider Adapter Contract surface above the existing Provider Gate / Health Check / Handshake / Audio Dry-run / Camera Dry-run stack:

- `src/runtime/providerCapabilities.js` defines a built-in capability map for `localdev_mock`, `dashscope_qwen_omni`, `custom_realtime_omni`, `synthetic_test`, and `offline_pet_engine`. Per-adapter overrides via `mergeProviderCapability` are narrowing-only.
- `src/runtime/providerAdapterContract.js` exposes the `omni.provider_adapter.v1` descriptor, the 10 required surface methods, and `validateProviderAdapter`.
- `src/runtime/providerAdapters/syntheticProviderAdapter.js` is a synthetic-only stub: it implements every contract method but rejects any real audio/camera payload and never opens a real socket.

Every descriptor and adapter — real, synthetic, mock, or offline — hard-locks:

```text
canOpenRealtimeSocket = false
canSendRealAudio = false
canSendRealCamera = false
canStartBillingSession = false
replyTextToTts = false
fallbackProviderId = 'localdev_mock'
```

The new descriptor lives next to `realtimeMediaMux` and `realtimeSessionCorrelation` in the Runtime layer. It does not change the LocalDev Adapter Contract on the wire; it only describes the safety surface above it.

Secret boundary: real provider API keys are not allowed in the frontend bundle, in browser runtime config, in the descriptor, or in Visible Context. Server-side proxy / Robot Gateway / Device Runtime is required to hold real secrets when future real provider work begins.

## v1.3.4 Realtime Mux / Backpressure / Session Correlation Architecture

v1.3.4 adds two Runtime-only modules above the existing LocalDev Adapter path:

- `src/runtime/realtimeSessionCorrelation.js` issues a stable `sessionId` per Runtime session and per-stream `streamId / sequence` for `audio_input`, `camera_input`, `context_input`, `control`, and `audio_output`. It tags all realtime envelopes/frames with `sessionId / streamId / sequence / timestampMs / source / priority` without breaking existing consumers.
- `src/runtime/realtimeMediaMux.js` is a pure decision module: it classifies WebSocket `bufferedAmount` into `normal / elevated / high / overflow` and returns `send / drop_old / coalesce` decisions per priority.

Priority order (always enforced):

```text
highest   omni.interrupt.v1
high      omni.output_state.v1 / session control
realtime  omni.audio_frame.v1 / omni.reply_audio_frame.v1
medium    omni.camera_frame.v1
low       omni.input_packet.v1 / context / log
```

Backpressure rules:

- audio is protected: best-effort send even under overflow.
- camera drops old frames and keeps the latest keyframe under elevated/high/overflow.
- input packet coalesces under elevated/high/overflow.
- interrupt always sends regardless of buffer pressure.

`media_ack` stays diagnostics-only — it is never used as a per-frame send gate. The fix in `useRuntimeCore.js:handleReplyAudioFramePlayed` now reads the freshly computed `next` state from `markReplyAudioFramePlayed` instead of a stale React snapshot, so "output done" is correctly observed.

This release stays Mock-first and Omni-first. No real provider realtime call, no real audio upload, no real camera upload, no realtime billing, and no `reply_text -> TTS` path.

## v1.3.3 Provider Camera Dry-run Architecture

v1.3.3 adds `providerCameraGate` above Provider Gate as a local-only camera experiment guard:

- `camera_dry_run` can become `ready_for_camera_dry_run` or `camera_dry_run_ok`.
- `canSendRealCamera`, `canSendAudio`, `canStartRealtime`, and `canStartBillingSession` are always false.
- dry-run validation checks `omni.camera_frame.v1` JPEG payload shape locally and reports validation only.
- no payload is persisted, uploaded, or sent to a real provider.

The Runtime remains Omni-first and Mock-safe. This release does not add real realtime calls, audio upload, billing, TTS, or ASR-to-LLM-to-TTS behavior.

## v1.3.2 Provider Audio Dry-run Architecture

v1.3.2 adds `providerAudioGate` above Provider Gate as a local-only audio experiment guard:

- `audio_dry_run` can become `ready_for_audio_dry_run` or `audio_dry_run_ok`.
- `canSendRealAudio`, `canSendCamera`, `canStartRealtime`, and `canStartBillingSession` are always false.
- dry-run validation checks `omni.audio_frame.v1` payload shape locally and reports validation only.
- no payload is persisted, uploaded, or sent to a real provider.

The Runtime remains Omni-first and Mock-safe. This release does not add real realtime calls, camera upload, billing, TTS, or ASR-to-LLM-to-TTS behavior.

## v1.3.1 Provider Handshake Architecture

v1.3.1 adds `providerHandshake` above Provider Health Check. It models a dry-run handshake and event contract without creating a real provider session:

- statuses: disabled, blocked, unconfigured, ready_for_handshake, handshake_dry_run_ok, handshake_failed.
- events: `provider.handshake.started`, `provider.handshake.ready`, `provider.handshake.blocked`, `provider.handshake.failed`, and `provider.handshake.fallback`.
- `canOpenRealtimeSocket`, `canSendAudio`, `canSendCamera`, and `canStartBillingSession` are always false.
- fallback remains `localdev_mock`.

The architecture still does not open a real realtime socket, upload audio/camera media, start billing, or connect TTS.

## v1.3.0 Provider Health Check Architecture

v1.3.0 adds `providerHealthCheck` as a preflight layer above Provider Gate. It converts gate/config state into a stable health result:

- disabled, unconfigured, blocked, ready_for_health_check, health_check_ok, or health_check_failed.
- `canStartRealtime`, `canSendAudio`, `canSendCamera`, and `canStartBillingSession` are always false in v1.3.0.
- failed, disabled, or unconfigured real providers keep `localdev_mock` fallback.
- UI panels may display health status, but Runtime still routes real media away from real providers.

This is not a real Omni call architecture. No DashScope/Qwen realtime WebSocket session, microphone upload, camera upload, billing session, or TTS path is enabled.

## v1.2.4 Provider Gate Architecture

v1.2.4 adds a Runtime-level Provider Gate before any real provider work. The gate is a configuration/readiness layer only:

- `localdev_mock` remains the default provider and fallback.
- `dashscope_qwen_omni` and `custom_realtime_omni` remain disabled unless explicit flags are present.
- `health_check_only` may describe readiness, but it must not send media frames or open realtime billing sessions.
- `allowAudioUpload`, `allowCameraUpload`, and `allowRealtimeBilling` default to false.
- Visible Context and Model Provider UI can show why real provider traffic is blocked.

This release does not establish a real DashScope/Qwen realtime WebSocket session, does not upload microphone PCM or camera JPEG frames, and does not add real TTS.

## v1.2.3 Contract Test Matrix Architecture

v1.2.3 does not change Runtime architecture. It adds a stronger LocalDev contract compliance matrix around the existing Mock Server and adapter boundary:

- input/media/control paths are tested separately.
- output state, structured output turn, and native reply audio frames are verified as separate channels.
- malformed and unsupported messages are diagnostics, not reasons to convert the product into text chat.
- no real provider, cloud, hardware, email, AC, TTS, or automatic VAD/AEC behavior is enabled.

## v1.2.2 LocalDev Recovery Architecture

v1.2.2 keeps the architecture Mock-first and Omni-first. It adds recovery semantics around the existing LocalDev Adapter boundary:

- LocalDev client status can distinguish `reconnecting`, `recovered`, `send_failed`, protocol diagnostics, and disconnected-during-pending-output.
- Realtime session state can move to `recovering` after socket disconnect or send failure, then back to `listening` after recovery.
- Realtime output channel clears queued reply audio frames on disconnect so speaking playback cannot remain stuck.
- Recovery does not replay old input packets automatically and does not change protocol semantics.

No real provider, cloud API, hardware, TTS, or automatic VAD/AEC barge-in is enabled.

## v1.2.0 LocalDev Adapter Contract Stable Baseline

v1.2.0 does not change the product into text chat and does not enable real cloud/model/hardware integrations. The architecture focus is the LocalDev realtime contract between Runtime and Adapter:

```text
Runtime -> Adapter:
omni.input_packet.v1
omni.audio_frame.v1
omni.camera_frame.v1
omni.interrupt.v1

Adapter -> Runtime:
omni.output_state.v1
omni.output_turn.v1
omni.reply_audio_frame.v1
cloudgenie.local_dev.media_ack.v1
```

The adapter boundary remains Omni-first: media frames are native input media, `reply_text` is subtitles/log/debug context only, and interruption is only `omni.interrupt.v1`. Contract tests now cover the happy path plus malformed message, unsupported schema, media-before-active-turn, no-active-turn interrupt, and duplicate/out-of-order reply audio diagnostics.

## 1. 产品定位

成熟产品不是单纯“本地部署机器人”，而是：

> 云端优先、可本地调试、可移动、多网络、自带插件和权限系统的实时 Omni 机器人平台。

交互模型：

- 在家：Wi‑Fi + 云端 Omni 模式，主体验。
- 出门：eSIM / 实体 SIM + 云端 Omni 模式，移动体验。
- 无网络：基础宠物模式，只保留表情、触摸、NFC、预设动作、基础插件。
- 开发阶段：本地 Qwen2.5-Omni 调试 Demo，通过 `LocalDevOmniAdapter` 接入。

## 2. 三层架构

```text
Robot Body Client
- 麦克风
- 摄像头
- 扬声器
- 屏幕表情
- 触摸
- NFC
- 舵机
- Wi‑Fi / eSIM / 实体 SIM

        ↓

Runtime Layer
- RuntimeCore
- Robot State Store
- Robot Identity Profile / Robot Profile Store
- Robot Runtime Config Store
- Network Manager
- Connection Manager
- Runtime Mode Manager
- Model Adapter Registry
- LocalDev Omni Client
- Realtime Output Channel
- LocalDev Omni Mock Server（开发辅助，不进入正式产品核心）
- Event Bus
- Visual Frame Buffer
- Frame Selector
- Expression Engine
- Plugin Engine
- Permission Engine
- Code Plugin Sandbox
- Tool Intent Router
- Tool Engine
- Action Log
- Visible Context Panel
- Robot Registry

        ↓

Client Layer
- Mobile App：普通用户主入口
- WebUI：开发调试和高级控制台
```

Web 不是核心，只是客户端。当前 v1.0.6 已把多机器人注册、身份档案、每机器人 Runtime 配置、插件 manifest、权限执行链、Adapter 配置、LocalDev Omni Client、LocalDev Mock Server 和 Runtime Trace 纳入项目结构。

## 3. RuntimeCore 与 Robot Identity Profile

`RuntimeCore` 是当前 Demo 的运行时中枢。它负责接收 UI 操作和 Mock 事实事件，再统一调用事件总线、表情引擎、插件引擎、权限引擎和模型适配配置。

机器人名字不硬编码为平台名，而是 Robot Identity Profile 的一部分：

```json
{
  "robotId": "robot_demo_001",
  "displayName": "CloudGenie",
  "wakeName": "小云",
  "ownerCalling": "主人",
  "defaultRole": "companion",
  "voiceStyle": "warm_young"
}
```

核心原则：

- `robot_id` 稳定，用于绑定、权限、日志、云端注册和实体设备识别。
- `display_name` 可变，用于 UI 展示和对话身份。
- `wake_name` 后续可单独用于唤醒词或称呼。
- `voice_style`、`default_role`、`personality` 是后续接入语音和角色系统的预留字段。

当前文件：

```text
src/runtime/useRuntimeCore.js
src/runtime/robotProfile.js
src/runtime/robotRuntimeConfig.js
src/runtime/realtimeOutputChannel.js
src/runtime/omniOutputFrames.js
src/components/RobotProfilePanel.jsx
src/components/RealtimeAudioOutputPlayer.jsx
```

## 4. Model Adapter Registry

所有模型能力都通过统一 Adapter Profile 接入：

```text
Model Adapter Registry
├── LocalDevOmniAdapter
├── ThirdPartyCloudOmniAdapter
├── ThirdPartyCloudOmniAdapter / cellular profile
├── SelfHostedCloudOmniAdapter
└── OfflinePetEngine
```

每个 Profile 包含：

- Provider 名称
- Endpoint / Realtime 地址
- Model ID
- API Key
- Transport
- 输入策略说明
- 上传策略说明
- 能力声明，例如 `audio_in`、`audio_out`、`image_frame`、`tool_intent`、`interrupt`

当前文件：

```text
src/runtime/modelAdapters.js
src/runtime/localDevProtocol.js
src/components/ModelProviderPanel.jsx
```

## 5. 输入设计

主输入：

```text
原始音频流 + 摄像头关键帧 + 当前上下文 + 最近事实事件 → Omni
```

约束：

- 原始语音音频流直接给 Omni，不要只做 ASR 文本输入。
- 摄像头关键帧直接给 Omni，不做视觉情绪摘要。
- 触摸和 NFC 只作为事实事件，例如 `touch.head.tap`、`nfc.study_card.detected`，不做情绪判断。
- ASR 文本只用于字幕、日志、调试、插件关键词辅助。

## 6. 摄像头关键帧策略

`CameraPreview` 模拟以下策略：

- 待机：1fps。
- 用户说话：2-5fps。
- 触摸/NFC/明显交互事件：短时间 burst。
- 用户问“你看这个是什么”：上传高清当前帧 + 最近几帧。
- eSIM / 实体 SIM 模式：音频优先，关键帧低频或按需上传。
- 离线基础宠物模式：仅本地预览，不上传 Omni。

## 7. 事实事件

触摸和 NFC 不做情绪判断，只做事实事件：

```json
{
  "type": "touch.event",
  "area": "head",
  "gesture": "tap"
}
```

```json
{
  "type": "nfc.detected",
  "tagId": "study_card_001",
  "label": "学习卡"
}
```

简单反应由插件中心执行；复杂场景再把事实事件作为上下文给 Omni。

## 8. 表情系统

Expression Engine 输出统一表情事件：

```json
{
  "type": "expression.update",
  "expression": "annoyed",
  "eyes": "slanted",
  "symbol": "anger_mark",
  "mouth": "closed"
}
```

同一套协议同时用于 Web 预览、App 预览和实体机器人屏幕。

v0.9 继续沿用的表情风格：

- 黑色屏幕。
- 蓝绿色发光眼睛。
- 紫蓝光效。
- 简洁符号。
- 嘴巴动画。
- 更自然的待机短胶囊眼。
- 怒气符号、星星、害羞腮红、困倦 Z 符号。

## 9. 插件和工具关系

工具不作为独立用户入口。用户入口是插件中心，工具只是插件动作库：

```text
Plugin Center
  Trigger
    ↓
  Action Sequence / Code Plugin
    ↓
  Plugin Manifest
    ↓
  Permission Engine
    ↓
  Tool Engine / Robot Adapter / Mock Device
```

动作示例：

```text
摸头 → 开心表情 + 说一句话 + 摇尾巴
NFC 学习卡 → 切换学习助手 + thinking 表情 + 说一句话
```

当前 Runtime 文件：

```text
src/runtime/actionLibrary.js
src/runtime/toolIntentRouter.js
src/runtime/toolEngine.js
src/runtime/pluginEngine.js
src/runtime/permissionEngine.js
src/runtime/codePluginSandbox.js
src/runtime/expressionEngine.js
```

## 10. 代码插件安全边界

v0.9 的代码插件仍是 Demo 级 Worker 沙箱，但新增 manifest 权限声明检查：

- 用户写 JS 函数体。
- 插件只能返回动作意图。
- Runtime 检查 `plugin.run`、插件 manifest 声明权限，以及每个动作的系统权限。
- Tool Engine / Mock Tool 执行动作。
- Worker 有超时限制。
- 不允许插件直接访问 DOM 或真实硬件。

生产版本还需要更强沙箱：权限签名、资源限制、网络白名单、依赖审核、插件市场审核和设备端隔离。


## v0.9 Runtime 新增模块

### RealtimeSession

负责描述实时音频链路。主输入是原始语音音频流，不把 ASR 文本作为唯一输入。ASR 文本只用于字幕、日志、调试和插件关键词辅助。

- local_dev：原始音频进入 LocalDevOmniAdapter。
- cloud：在权限允许时，原始音频进入云端 Omni Adapter。
- offline_pet：不连接 Omni，只保留基础宠物模式。

### Network / Connection Manager

负责描述当前连接方式、网络质量、延迟、丢包、信号、上传预算和降级建议。v0.9 先做前端 Runtime 模拟，后续由 Robot Gateway 或设备端网络探针提供真实数据。

### FramePolicyEngine

FramePolicyEngine 根据运行模式、网络质量、机器人状态和用户事件生成关键帧策略：

- 待机：1fps 缓存。
- 说话/聆听：2-5fps。
- 触摸/NFC/明显交互：短时间 burst。
- 视觉问答：高清当前帧 + 最近几帧。
- 蜂窝模式：音频优先，关键帧低频或按需。
- 离线模式：本地预览，不上传 Omni。

CameraPreview 不再自己决定策略，而是读取 Runtime 的 FramePolicy。

## v1.0.1 Omni Session Bridge

v1.0.1 新增 Omni Session Bridge，用于连接 Runtime 内部状态和不同 Model Adapter。它的目标不是绑定某个模型供应商，而是先稳定输入输出协议。

### 输入协议：omni.input_packet.v1

输入包由 RuntimeCore 构建，包含：

```text
routing
- 当前 Runtime Mode
- 当前 Model Adapter
- Endpoint / Model ID
- Realtime route
- Connection status

identity
- robot_id
- display_name
- wake_name
- role
- voice_style
- owner_calling

input
- raw_audio_stream 状态
- camera keyframe policy
- visual frame buffer 摘要
- recent fact events
- ASR/text 的辅助用途说明

runtimeContext
- 当前表情、动作、状态
- FramePolicy
- Connection snapshot
- Permission state
- Enabled plugin manifests

guardrails
- 不在前端做视觉情绪摘要
- 触摸/NFC 只作为事实事件
- 工具执行必须经过权限系统
- 用户代码插件只能返回动作意图
```

### 输出协议：omni.output_turn.v1

真实 Adapter 后续应返回统一结构：

```json
{
  "reply_text": "好，我帮你处理一下。",
  "reply_audio": "audio_stream_or_url",
  "expression": { "type": "expression.update", "expression": "happy" },
  "tool_intents": [{ "type": "plugin.trigger", "intent": "nfc_study_card", "confidence": 0.82 }],
  "transcript": { "partial_asr": "仅作为字幕和调试", "usage": "subtitles_logs_debug_plugin_keywords_only" }
}
```

### 为什么要先做 Bridge

没有 Bridge 时，Web 组件、插件、权限、摄像头和模型配置容易互相耦合。Bridge 把这些信息收敛成统一协议，后续本地 Qwen、第三方云 Omni 和自建云 Omni 只需要实现同一个 Adapter 接口。


## v1.0.1 补充：Robot Registry / 多机器人控制

一个 Web 或 App 不应该只控制单个写死机器人。成熟产品需要 Robot Registry：

- `robot_id`：稳定设备 ID，用于绑定、权限、日志、云端注册和会话路由。
- `display_name`：用户自定义昵称，只用于展示和对话，不参与权限和绑定。
- `active_robot_id`：当前客户端正在控制的机器人。
- `Robot Identity Profile`：按 `robot_id` 存储昵称、唤醒名、默认角色、声音风格、称呼方式。
- `Runtime Session`：当前 Demo 先在前端切换 active robot，后期由后端 Runtime / Robot Gateway 维护多机器人在线状态。

前端控制台的职责是选择机器人、显示状态、发起操作；核心仍在 Runtime：模型路由、插件权限、关键帧策略、行为日志、网络降级都必须绑定到当前 `robot_id`。

## v1.0.2：Robot Registry 删除与安全边界

Robot Registry 需要支持新增、切换和删除机器人实例，但删除不能破坏 Runtime 的 active robot 约束。v1.0.2 中加入删除守卫：

- 至少保留一个机器人实例，不能删除最后一个 robot_id。
- 删除当前 active robot 时，Runtime 自动选择下一个可用 robot_id。
- 删除机器人时同步清理当前浏览器里的 Robot Identity Profile。
- 删除动作进入 Action Log 与 Runtime Trace。

成熟产品中，前端删除按钮不应直接等同于物理设备删除。真实流程应由 Cloud Robot Registry / Robot Gateway 处理解绑、设备证书吊销、权限回收、日志留存和数据合规策略。

## v1.0.3：Tool Intent Router / Tool Engine / Visual Frame Buffer 摘要

v1.0.3 继续推进 Runtime 边界清晰化，重点不是接真实模型或真实硬件，而是补齐 Mock Runtime 内部执行链：

- `ToolIntentRouter` 接收 `omni.output_turn.v1` 里的 `tool_intents`，将可识别意图映射回插件触发器。
- 工具意图不会直接调用空调、邮件、动作或 DOM；匹配到插件后仍然经过 `plugin.run`、manifest 权限声明和动作权限检查。
- `ToolEngine` 从 `PluginEngine` 中拆出，当前只执行 Demo 级 Mock 工具状态变更，后续可替换为真实 Robot Adapter / Home Adapter / Mail Adapter。
- `VisualFrameBuffer` 摘要进入 `omni.input_packet.v1`：Runtime 会记录最近关键帧的时间、尺寸、策略和选择摘要，但不在前端生成视觉情绪判断。
- WebUI 仍负责展示和触发调试动作，不拥有工具路由、权限决策或模型输入包协议。

当前新增文件：

```text
src/runtime/toolIntentRouter.js
src/runtime/toolEngine.js
src/runtime/visualFrameBuffer.js
```

## v1.0.4：Per-Robot Runtime Config

v1.0.4 将多机器人能力从“可切换 active robot”推进到“每台机器人拥有自己的 Runtime 配置”。当前 Demo 使用浏览器本地存储，按 `robot_id` 保存：

- `permissions`：权限中心状态。
- `plugins`：插件列表、启用状态、manifest、动作编排和代码插件配置。
- `adapterProfiles`：Local / Cloud / Cellular / SelfHosted / Offline Adapter 配置。
- `preferences`：后续可扩展网络质量偏好、默认运行模式等 Runtime 偏好。

切换 `active_robot_id` 时，Runtime 会重新加载该机器人的配置，并刷新权限中心、插件中心和模型配置面板。修改权限、插件或模型配置时，只写入当前 `robot_id` 的配置，不影响其他机器人。

这个版本仍不接后端；成熟形态应由 Cloud Robot Registry / Runtime API 提供配置同步、权限分组、设备绑定和审计日志。

## v1.0.5：LocalDevOmniAdapter Client 骨架

v1.0.5 开始实现本地调试 Adapter 发送层，但不改变 Omni-first 输入策略。WebUI 不把语音转成文本聊天，而是继续由 Runtime 构建统一输入包：

```text
RuntimeCore
  → OmniSessionBridge / omni.input_packet.v1
  → LocalDevOmniClient
  → ws://127.0.0.1:8000/omni/realtime
  → omni.output_turn.v1
  → Expression / ToolIntentRouter / Plugin / Permission / ToolEngine
```

当前 `LocalDevOmniClient` 只做 WebSocket 连接、发送输入包、接收输出回合和错误提示。真实音频流、关键帧二进制上传、打断机制和本地 Qwen2.5-Omni 服务本身仍是后续任务。

新增文件：

```text
src/runtime/localDevOmniClient.js
```


## 14. v1.0.6 Codex 迁移与 LocalDev Mock 边界

v1.0.6 的重点不是新增真实模型能力，而是保证项目进入 Codex / GitHub 后仍能被准确理解和安全演进。

新增 `AGENTS.md` 作为项目级代理说明文件，强调：

- WebUI 只是控制台。
- Runtime 是核心。
- 不能退化成 ASR-only 文本聊天机器人。
- `robot_id` 稳定，`display_name` 用户可改。
- 插件必须经过 Permission Engine 和 Tool Engine。
- 用户代码插件只能返回 action intents。
- 真实邮件、空调、硬件、云端 API 暂不接入。

新增 `scripts/localdev-omni-mock-server.mjs`：

```text
WebUI / OmniSessionPanel
  ↓ omni.input_packet.v1
LocalDevOmniClient
  ↓ WebSocket
scripts/localdev-omni-mock-server.mjs
  ↓ omni.output_turn.v1
Runtime output chain
  ↓
Expression / ToolIntentRouter / PluginEngine / PermissionEngine / ToolEngine / ActionLog
```

这个 Mock Server 只验证协议链路，不代表真实 Qwen2.5-Omni 已接入。真实流式音频、图片帧 payload、语音流回放和打断控制仍属于后续阶段。

## 15. v1.0.8 LocalDev Adapter Roundtrip

v1.0.8 对 v1.0.6 的 LocalDev Mock Server 进行协议稳定化，重点不是接入真实模型，而是让 Web → LocalDev Adapter → Web 的回合协议更接近真实实时 Omni 调试会话。

### 15.1 输入 envelope

Web 端通过 `LocalDevOmniBridge` 发送 envelope：

```json
{
  "schema": "cloudgenie.local_dev.envelope.v1",
  "type": "omni.input_packet",
  "requestId": "localdev_req_xxx",
  "packetSchema": "omni.input_packet.v1",
  "packetId": "omni_xxx",
  "robotId": "robot_local_dev",
  "packet": {
    "schema": "omni.input_packet.v1"
  }
}
```

其中 `packet` 仍然是 Runtime 构建的统一 Omni 输入包，包含身份、音频状态、视觉摘要、事实事件、权限、插件和网络状态。

### 15.2 输出 envelope

Mock Server 返回：

```json
{
  "schema": "cloudgenie.local_dev.envelope.v1",
  "type": "omni.output_turn",
  "requestId": "localdev_req_xxx",
  "receivedPacket": {
    "schema": "omni.input_packet.v1",
    "packetId": "omni_xxx",
    "robotId": "robot_local_dev"
  },
  "turn": {
    "schema": "omni.output_turn.v1"
  }
}
```

Web 端使用 `requestId` 匹配 pending 请求，再把 `turn` 归一化为 `omni.output_turn.v1`，继续进入：

```text
ExpressionEngine → ToolIntentRouter → PluginEngine → PermissionEngine → ToolEngine → ActionLog / RuntimeTrace
```

### 15.3 会话状态

LocalDev WebSocket 不再是纯一次性请求，而是由 `LocalDevOmniBridge` 负责保持连接、复用连接、手动断开和错误提示。UI 会展示：

- 未连接
- 连接中
- 已保持连接
- 发送中
- 已收到回合
- 连接失败
- 已断开

这为下一步真实流式音频、关键帧 payload、回复语音流和打断机制提供连接状态基础。

## v1.0.8 Architecture Addendum: Media Frame Channels

v1.0.8 在 LocalDev Adapter Roundtrip 之外新增独立媒体帧协议：

```text
RealtimeAudioPanel / CameraPreview
→ RuntimeCore
→ omniMediaFrames
→ LocalDevOmniClient.sendMediaFrame
→ LocalDev Mock Server
→ media_ack
→ Omni Session Panel / Visible Context
```

- `omni.input_packet.v1`：低频上下文包。
- `omni.audio_frame.v1`：音频帧通道，后续承载 PCM/Opus chunk。
- `omni.camera_frame.v1`：摄像头关键帧通道，后续承载 JPEG/视频帧 payload。
- `cloudgenie.local_dev.media_ack.v1`：LocalDev Adapter / Mock Server 对媒体帧的确认。

## v1.0.9 Architecture Addendum: Real Microphone PCM Chunk Channel

v1.0.9 upgrades `omni.audio_frame.v1` from metadata-only to a LocalDev debug payload channel. The browser microphone is still a development stand-in for the future Robot Body Client microphone, but it now produces real PCM Float32 chunks.

### Audio channel split

- `omni.input_packet.v1`: low-frequency context packet containing robot identity, runtime mode, adapter routing, permissions, plugins, recent fact events, network state, frame policy, and media-channel counters.
- `omni.audio_frame.v1`: realtime audio media frame. In v1.0.9 it carries base64-encoded PCM Float32 payload in the demo JSON envelope.
- `omni.camera_frame.v1`: selected camera keyframe channel. Full JPEG payload is added in v1.1.0.

### Guardrails

ASR text remains secondary. The realtime path is microphone audio chunk → LocalDevOmniAdapter bridge → future Omni model. ASR text may be used for subtitles, logs, debugging, or plugin keyword assistance, but not as the primary model input.

### Current transport limitation

The v1.0.9 LocalDev transport keeps JSON envelopes for easier inspection in the browser and mock server. A production RobotMicAdapter can later switch to binary WebSocket frames, WebRTC, Opus, or another model-provider-specific streaming transport without changing the UI-level product principle.


## v1.1.0 Architecture Addendum: Real Camera JPEG Keyframe Channel

v1.1.0 upgrades `omni.camera_frame.v1` from metadata-only to a LocalDev debug payload channel. The browser camera is still a development stand-in for the future Robot Body Client camera, but selected keyframes now carry base64-encoded JPEG payloads.

### Camera channel split

- `omni.input_packet.v1`: low-frequency context packet containing frame policy, recent frame summary, network state, permissions, plugins, and identity.
- `omni.camera_frame.v1`: selected camera keyframe media frame. In v1.1.0 it carries `payloadIncluded=true`, `payloadEncoding=base64`, `byteLength`, JPEG dimensions, selector policy, and JPEG payload.
- `cloudgenie.local_dev.media_ack.v1`: LocalDev Adapter / Mock Server acknowledgement for camera and audio frames.

### Guardrails

The frontend still does not generate a visual emotion summary. It only selects frames according to FramePolicy / FrameSelector and forwards the selected JPEG frame to the Adapter path. Interpretation belongs to the Omni model.

### Current transport limitation

The v1.1.0 LocalDev transport keeps JPEG payloads inside JSON envelopes for easy inspection. A production RobotCameraAdapter can later switch to binary WebSocket frames, WebRTC data/media channels, object storage handles, or model-provider-specific upload APIs without changing the Runtime principle.


## 11. v1.1.1 Realtime Output Channel

`Realtime Output Channel` 负责 Omni 服务端到 Web/机器人扬声器方向的输出媒体流。它与 `omniMediaFrames.js` 的输入媒体通道分离：

```text
Input media channel:  Web/Robot Mic + Camera -> Omni
Output media channel: Omni -> Web/Robot Speaker + Expression
```

当前 Mock 协议：

- `omni.output_state.v1`：thinking / speaking / finished / interrupted / error。
- `omni.reply_audio_frame.v1`：服务端输出 PCM Float32 音频帧，Web 端按 sequence 播放。
- `omni.output_turn.v1`：保留 reply_text、expression、tool_intents；其中 `reply_text` 是字幕、日志和调试文本，不是 TTS 输入。

LocalDev Mock Server 的语义是“模拟 Realtime Omni 服务端流式输出”，不是 `reply_text -> TTS -> 播放`。真实模型接入后，应把模型原生音频输出映射到 `reply_audio_frame`，而不是把文本回复再送入前端语音合成。

## 12. v1.1.3 Realtime Interrupt / Barge-in Mock Control

v1.1.3 在 v1.1.1 的 Realtime Output Channel 上增加显式打断控制。

核心原则：

```text
omni.audio_frame.v1 ≠ interrupt
omni.reply_audio_frame.v1 ≠ interrupt
只有 omni.interrupt.v1 才能停止当前输出 turn
```

这样可以避免机器人播放声音被麦克风采回后，被误判成用户插话，导致 Omni 自己打断自己。

### 12.1 新协议

`omni.interrupt.v1` 表达用户插话 / barge-in intent：

```js
{
  schema: 'omni.interrupt.v1',
  turnId,
  robotId,
  displayName,
  reason: 'user_barge_in',
  source: 'client_runtime_manual_button',
  target: 'current_output'
}
```

### 12.2 Runtime 状态

`realtimeOutputChannel` 维护：

```text
interruptCount
interruptToken
lastInterrupt
queuedAudioFrames
playbackActive
```

`interruptToken` 用于通知 Web Audio 播放组件停止当前 `AudioBufferSourceNode`，并清空旧帧播放状态。

### 12.3 LocalDev Mock Server

LocalDev Mock Server 为每个 active turn 保存定时器集合。收到 `omni.interrupt.v1` 后：

1. 标记当前 stream cancelled。
2. 清除尚未发送的 `reply_audio_frame` 定时器。
3. 返回 `omni.output_state.v1`，state=`interrupted`。
4. 不再发送当前 turn 的剩余输出帧。

### 12.4 非目标

v1.1.3 不做自动 VAD / AEC / 回声抑制，不根据麦克风声音自动打断。自动 barge-in 需要后续版本在能够区分用户真实插话和机器人回声后再做。

## 13. v1.1.3 Realtime Session State Machine

v1.1.3 在 v1.1.1 的 Realtime Output Channel 和 v1.1.2 的显式 interrupt 控制上增加 `omni.realtime_session_state.v1`。

状态机由 `src/runtime/realtimeSessionState.js` 实现，目标不是替代输入/输出协议，而是把它们统一到可观测的会话生命周期里。

### 13.1 状态集合

```text
idle
listening
user_speaking
model_thinking
model_speaking
interrupted
recovering
error
```

### 13.2 生命周期语义

```text
SESSION_OPEN              -> listening
INPUT_AUDIO_FRAME         -> user_speaking 或保持 model_speaking
INPUT_PACKET_SENT         -> model_thinking
OUTPUT_STATE thinking     -> model_thinking
OUTPUT_STATE speaking     -> model_speaking
REPLY_AUDIO_FRAME         -> model_speaking
REPLY_AUDIO_FRAME_PLAYED  -> listening 或保持 model_speaking
INTERRUPT_LOCAL           -> interrupted
OUTPUT_STATE interrupted  -> interrupted
SESSION_CLOSE             -> idle
```

### 13.3 Guardrails

```text
inputOutputSeparated = true
replyTextIsSubtitleOnly = true
audioFrameDoesNotAutoInterrupt = true
replyAudioFrameCannotTriggerInterrupt = true
explicitInterruptOnly = true
micCanRemainOpenDuringOutput = true
```

这意味着：模型输出时麦克风可以继续采集和发送 `omni.audio_frame.v1`，但音频帧本身不会自动触发 `omni.interrupt.v1`。只有明确的控制事件才能打断当前输出 turn。

### 13.4 UI 观察面板

`OmniSessionPanel` 和 `VisibleContext` 会展示：

```text
sessionId
currentTurnId
currentRequestId
state
input audio/camera sent/observed
output received/played
interrupt count
last transition
last reason
canInterruptOutput
shouldKeepMicOpen
```

这样后续接真实 Omni API、WebRTC 或实体机器人硬件时，不需要再从零梳理 listening / thinking / speaking / interrupted 的边界。


## 14. v1.1.6 Maintenance Layer

v1.1.6 不改变 realtime 协议语义，而是增加维护层约束，确保后续 v1.2.0 Adapter Contract 迭代更稳定。

新增维护脚本：

```text
scripts/run-smoke-suite.mjs
scripts/version-doctor.mjs
scripts/clean-local-artifacts.mjs
```

维护层职责：

- `verify`：构建项目并运行安全 smoke suite。
- `verify:quick`：用于小改动的快速验证。
- `version-doctor`：检查 package、README、AGENTS、架构文档和版本文档一致性。
- `clean`：清理本地生成物，避免把 `node_modules/`、`dist/`、lockfile 和日志带入发布包。

这些脚本不属于 Runtime 业务链路，也不会默认调用真实云 API、真实硬件、真实邮箱或真实空调。
