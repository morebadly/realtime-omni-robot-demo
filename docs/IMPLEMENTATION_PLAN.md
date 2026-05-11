# 技术落地路线 v1.2.4

## v1.2.4 Provider Configuration Gate

Goal: prepare real provider configuration gates while keeping the demo safe Mock-only.

Completed:

1. Add a Runtime provider gate schema for `localdev_mock`, `dashscope_qwen_omni`, and `custom_realtime_omni`.
2. Keep real providers disabled by default and require explicit endpoint, API key, upload flags, billing flag, visible context, permission gate, and LocalDev Mock fallback.
3. Add `.env.example` placeholders without real secrets.
4. Add `test:provider-config-gate` and include it in the safe smoke suite.

Still out of scope:

1. Real Qwen/DashScope realtime sessions.
2. Real microphone PCM or camera JPEG upload.
3. Real realtime billing calls.
4. Real TTS or `reply_text -> playback`.

## v1.2.3 Adapter Contract Test Completion

Goal: complete a broader LocalDev contract compliance matrix before provider configuration work begins.

Completed:

1. Added Mock Server compliance coverage for malformed messages, unsupported schemas, media ack, input packet output lifecycle, reply audio frame output, and explicit interrupt.
2. Added `test:localdev-contract-matrix` and included it in the safe smoke suite.
3. Kept input/output/media/interrupt channels separate and Mock-only.

Out of scope:

1. Real provider configuration.
2. Real cloud health checks.
3. Real microphone/camera upload to cloud.
4. Real TTS or text-chat pipeline.

## v1.2.2 LocalDev Adapter Recovery Stabilization

Goal: make LocalDev reconnect and recovery behavior testable without adding real providers.

Completed:

1. LocalDev client reports explicit send failures and reconnect/recovered status.
2. Malformed service JSON no longer makes the client connection unusable; later valid messages can still resolve.
3. Unsupported server messages are protocol warnings instead of output turns.
4. Runtime session state and output queue can recover from socket disconnect and clear stale reply audio frames.
5. Added `test:localdev-reconnect-recovery` and included it in the smoke suite.

Still out of scope:

1. Real Qwen/DashScope realtime cloud traffic.
2. Real hardware, email, AC, or filesystem access.
3. Real TTS or `reply_text -> playback`.
4. Automatic VAD/AEC barge-in.

## v1.2.0 LocalDev Adapter Contract Stable Release

Goal: stabilize the LocalDev Adapter Contract before any real Omni provider work.

Completed in this release:

1. Keep the Runtime <-> Adapter schema list explicit: `omni.input_packet.v1`, `omni.audio_frame.v1`, `omni.camera_frame.v1`, `omni.output_state.v1`, `omni.output_turn.v1`, `omni.reply_audio_frame.v1`, `omni.interrupt.v1`, and `cloudgenie.local_dev.media_ack.v1`.
2. Strengthen contract tests for mock media ack, thinking/speaking/finished state, native reply audio, explicit interrupt cancellation, malformed message, unsupported schema, media before active output turn, and interrupt with no active turn.
3. Strengthen output queue diagnostics for duplicate and out-of-order `omni.reply_audio_frame.v1`.
4. Expand `npm run verify` so it explicitly includes build, version doctor, adapter contract, realtime readiness, LocalDev preflight, and the safe smoke suite.

Still not implemented in v1.2.0:

1. Real Qwen/DashScope realtime cloud traffic.
2. Real hardware, email, AC, or filesystem access from plugins.
3. Real TTS or `reply_text -> playback`.
4. Automatic VAD/AEC barge-in.

## 阶段 1：Web Demo + Runtime 骨架

目标：完成可演示的产品壳。

已包含：

- Web 控制台
- 动态机器人表情
- Runtime Mode 预留
- 插件中心模板版
- 权限中心
- 机器人可见信息面板
- 行为日志
- Mock 触摸/NFC/空调/邮件

## 阶段 1.5：v0.5 / v0.6 交互补强

已完成：

1. 修复机器人眼睛变形，优化 LOOI 风格表情。
2. 增加更明显的生气表情。
3. 优化傲娇表情，避免横向拉扁。
4. 增加插件删除功能。
5. 插件中心支持多动作编排。
6. 工具入口收敛为插件动作库。
7. 保留云端 Omni / 本地调试 / eSIM / 自建云 / 离线宠物架构。
8. 更新项目文档和版本说明。

## 阶段 1.7：v0.7 Runtime 正规化

已完成：

1. 待机表情优化，减少奇怪瞪眼感。
2. 移除情绪置信度百分比，避免把机器人表情误读成用户情绪判断。
3. 新增 Model Adapter Registry 配置中心。
4. 新增代码插件 Demo Worker 沙箱。
5. 插件执行前增加 `plugin.run` 检查。
6. 每个插件动作执行前检查对应权限。
7. 代码插件只返回动作意图，Runtime 继续负责权限和工具执行。


## 阶段 1.8：v0.8 RuntimeCore 与身份档案

已完成：

1. 新增 `useRuntimeCore`，把 App 中大量状态和动作处理移入 Runtime Hook。
2. 新增 Robot Identity Profile：昵称、唤醒名、用户称呼、默认角色、声音风格、性格提示。
3. 分离稳定 `robot_id` 和用户可变 `display_name`，不把 CloudGenie 硬编码为平台名。
4. Model Adapter 配置持久化到浏览器本地；API Key 不持久化。
5. 新增 Runtime Trace 面板，显示 Event Bus、PluginManager、PermissionEngine 等模块事件。
6. 新增插件 manifest 生成与展示。
7. 插件执行链增加“manifest 是否声明权限”的检查。


## 阶段 1.9：v0.9 实时音频、网络与关键帧策略 Runtime 化

已完成：

1. 新增 RealtimeAudioPanel，用浏览器麦克风模拟机器人麦克风原始音频流。
2. 明确 ASR 文本只用于字幕、日志、调试和插件关键词辅助，不作为主输入。
3. 新增 RealtimeSession 路由：LocalDev、Cloud Omni、Offline Pet 三种路径。
4. 新增 Network / Connection Manager 面板，展示延迟、丢包、信号、上传预算和网络状态。
5. 新增网络质量模拟：稳定、拥塞、较差、断网。
6. 新增自动降级策略：断网进入 Offline Pet；网络较差进入音频优先和低频关键帧。
7. 新增 FramePolicyEngine，根据运行模式、网络质量、说话状态和视觉询问计算关键帧频率、分辨率和上传策略。
8. CameraPreview 改为读取 Runtime 的 FramePolicy，不再在组件内部独立决定关键帧策略。

## 阶段 2.1：v1.0.6 Codex 迁移准备与 LocalDev Mock Server

已完成：

1. 删除发布包中的 `node_modules/` 和 `dist/`，避免把 Windows 本地依赖和构建产物迁移到 GitHub / Codex。
2. 补充 `.gitignore`，明确忽略依赖、构建产物、环境变量和日志。
3. 新增 `AGENTS.md`，作为 Codex / 代码代理的项目说明和开发边界。
4. 新增 `scripts/localdev-omni-mock-server.mjs`，监听 `ws://127.0.0.1:8000/omni/realtime`。
5. 新增 `npm run mock:localdev`，可端到端验证 Web → LocalDev Adapter → Web。
6. 统一 README、架构文档和路线图到 v1.0.6。

仍未完成：

1. 真实 PCM / Opus 音频 chunk 流式发送。
2. 真实摄像头图片帧 payload 发送。
3. Qwen2.5-Omni 真实模型服务适配。
4. 语音流式回放和打断控制。



## 阶段 2.4：v1.1.1 Mock Realtime Omni 双向媒体通道

已完成：

1. 新增 `omni.output_state.v1`，LocalDev Mock Server 可在同一 WebSocket session 中返回 thinking / speaking / finished。
2. 新增 `omni.reply_audio_frame.v1`，Mock Server 流式返回 PCM Float32 输出音频帧。
3. 新增 `src/runtime/realtimeOutputChannel.js`，把 Omni 输出状态、输出音频帧队列和播放进度从输入媒体通道中分离。
4. 新增 `src/runtime/omniOutputFrames.js`，统一输出状态与 reply audio frame 协议。
5. 新增 `RealtimeAudioOutputPlayer`，使用 AudioContext 播放服务端输出音频帧，并驱动 RobotFace speaking 状态。
6. Omni Session / Visible Context 面板新增实时输出通道状态。
7. 明确 `reply_text` 只作为字幕、日志和调试，不是 TTS 输入。

仍未完成：

1. 真实 Qwen2.5-Omni / 云端 Omni 的原生输出音频映射。
2. WebRTC / binary WebSocket 等生产级媒体传输。
3. barge-in / interrupt / jitter buffer / echo cancellation。
4. 真实机器人扬声器、麦克风阵列和硬件播放链路。

## 阶段 2：LocalDevOmniAdapter

接入本地调试模型，用于验证核心交互。

任务：

1. 将 v0.9 的浏览器麦克风模拟替换为 RobotMicAdapter / LocalDevOmniAdapter 真实音频流。
2. 接入摄像头关键帧。
3. 实现 Visual Frame Buffer。
4. 实现 Frame Selector。
5. 将原始音频和关键帧送入本地 Omni。
6. 接收语音输出、表情事件、插件意图。
7. 把 ModelProviderPanel 的本地 Endpoint 接到真实 Local Runtime。

## 阶段 3：云端 Omni Adapter

成熟产品应云端优先，因此需要接入第三方云端 Omni API。

任务：

1. 实现 `ThirdPartyCloudOmniAdapter`。
2. 实现语音流上传。
3. 实现关键帧上传策略。
4. 接入云端语音输出。
5. 统一输出格式：`reply_audio` / `expression` / `tool_intents`。
6. 在权限中心显示云端上传状态。
7. API Key 不再保存在前端内存，改由后端 Runtime / Robot Gateway 管理。

## 阶段 4：Network Manager

支持 Wi‑Fi、eSIM、实体 SIM 和无网络基础模式。

已在 v0.9 完成 Demo 层：

1. Network Profile 与网络质量模拟。
2. Connection Snapshot：延迟、丢包、信号、上传预算。
3. 断网进入 Offline Pet 的自动降级策略。
4. 蜂窝模式音频优先、关键帧低频或按需。

后续任务：

1. 接真实机器人网络状态。
2. 支持网络优先级和自动重连。
3. 支持会话恢复。
4. 支持 Robot Gateway 侧的云端连接心跳。

## 阶段 5：生产级插件系统

把 v0.7 的 Demo Worker 沙箱升级为真正插件平台。

任务：

1. 插件 manifest：名称、版本、入口、权限、触发器、依赖。
2. 沙箱执行：超时、内存、网络白名单、工具白名单。
3. 插件签名与版本管理。
4. 插件市场或本地导入。
5. 插件日志、禁用、回滚和安全审计。

## 阶段 6：真实硬件接入

替换 Mock：

- MockTouchAdapter → RealTouchSensorAdapter
- MockNFCAdapter → RealNFCAdapter
- MockExpressionTool → RobotScreenAdapter
- MockRobotMotionTool → ServoAdapter
- BrowserCamera → RobotCameraAdapter
- BrowserMic → RobotMicAdapter

## 阶段 7：App 化

Web 继续作为开发者控制台，普通用户使用 App。

App 需要支持：

- 账号系统
- 机器人绑定
- 配网
- eSIM / 实体 SIM 状态
- 权限管理
- 插件管理
- 远程查看
- 推送通知

## 阶段 1.10：v1.0.1 Omni Session Bridge

已完成：

1. 新增 `OmniSessionBridge`，把 Runtime 当前上下文打包成统一 Adapter 输入包。
2. 新增 `omni.input_packet.v1` 协议草案，包含：
   - routing：运行模式、Adapter、Endpoint、连接状态
   - identity：robot_id、display_name、wake_name、role、voice_style
   - input.audio：原始音频流状态、采样率、电平、ASR 用途说明
   - input.visual：关键帧策略、缓存帧数量、上传计划
   - input.factEvents：触摸、NFC、视觉问答、语音意图等事实事件
   - runtimeContext：表情、动作、FramePolicy、网络、权限、启用插件 manifest
   - guardrails：不做前端情绪摘要、工具必须过权限、用户代码只返回动作意图
3. 新增 `omni.output_turn.v1` Mock 输出，模拟模型返回：
   - reply_text
   - reply_audio
   - expression
   - tool_intents
   - transcript usage
4. 新增 Omni Session 面板，可查看输入包和输出回合 JSON。
5. Runtime Trace 增加 OmniSessionBridge、ModelAdapterManager 和 ToolIntentRouter 的调试轨迹。

后续任务：

1. 将 `omni.input_packet.v1` 发送给真实 `LocalDevOmniAdapter`。
2. 用 WebSocket / WebRTC / HTTP streaming 替换 Mock 输出。
3. 将 `tool_intents` 接入真正的 Plugin Engine 自动路由。
4. 增加回复音频播放和打断机制。
5. 将真实模型 API Key 移到后端 Runtime / Robot Gateway。


## v1.0.1 实施项

- 新增 `src/runtime/robotRegistry.js`。
- 新增 `src/components/RobotRegistryPanel.jsx`。
- `useRuntimeCore` 加入 `robotRegistry`、`activeRobotId`、`handleRobotSelect`、`handleRobotAdd`。
- `RobotProfileStore` 改为按 `robot_id` 分开保存，避免多个机器人共用同一个昵称配置。
- 表情切换、运行模式切换、网络状态模拟、插件触发结果会同步回当前 active robot 的 Registry 摘要。

后续 v1.1 建议：

- Robot Registry 接入后端 API。
- 每个机器人独立权限组、插件组、模型 Provider 和在线会话。
- 增加机器人绑定/解绑、设备证书、远程唤醒和多机器人分组。

## v1.0.2 补充计划：多机器人删除能力

- 已补上 Robot Registry 删除入口。
- 已实现删除 active robot 后的自动 fallback。
- 已实现“不能删除最后一个机器人”的前端与 Runtime 双层保护。
- 后续需要把删除动作拆分为：本地移除、账号解绑、云端注销、设备证书吊销、历史数据保留/删除。

## v1.0.3 补充计划：工具意图路由与 Runtime 边界补强

已完成：

1. 新增 `src/runtime/toolIntentRouter.js`，把 Mock Omni 输出里的 `tool_intents` 路由回插件触发器。
2. 新增 `src/runtime/toolEngine.js`，把 Mock 工具执行从 `pluginEngine` 中拆出。
3. `PluginEngine` 保持权限守卫职责：先检查 `plugin.run`，再检查 manifest 声明和动作权限，最后才进入 Tool Engine。
4. 新增 `src/runtime/visualFrameBuffer.js`，让 Omni 输入包包含关键帧摘要、选择策略和缓存摘要。
5. `CameraPreview` 仍只作为浏览器摄像头模拟器，真正的视觉输入协议由 Runtime 生成。

后续 v1.0.4 / v1.1 建议：

- 为每个 `robot_id` 建立独立权限组、插件组和模型 Provider 配置。
- 将 `ToolIntentRouter` 的映射表升级成 manifest 声明或插件注册表。
- 增加 Adapter Client Mock 接口，为真实 LocalDevOmniAdapter 做发送层准备。
- 增加结构化 Action Log 字段：`robot_id`、`plugin_id`、`permission_key`、`decision`、`tool_intent_id`。

## v1.0.4 补充计划：Per-Robot Runtime 配置

已完成：

1. 新增 `src/runtime/robotRuntimeConfig.js`，按 `robot_id` 保存 Runtime 配置。
2. 权限中心状态改为 active robot 专属配置。
3. 插件列表、插件启用状态、新增插件和删除插件改为 active robot 专属配置。
4. Model Adapter 配置改为 active robot 专属配置。
5. 切换 Robot Registry 中的 `robot_id` 时，Runtime 会加载该机器人的权限、插件和模型配置。
6. 删除机器人时同步清理该 `robot_id` 的本地 Runtime 配置。
7. 专属调控界面显示当前机器人配置摘要：权限数量、启用插件数量、mode 和 adapter。

后续 v1.0.5 / v1.1 建议：

- 将 Action Log 和 Runtime Trace 改为结构化对象，统一携带 `robot_id`。
- 将 `robotRuntimeConfig` 的本地存储接口抽象为未来 Cloud Runtime API。
- 支持导入/导出某台机器人的配置模板。
- 支持 Robot Registry 中复制某台机器人的插件和权限配置到另一台机器人。

## v1.0.5 补充计划：LocalDevOmniAdapter Client 骨架

已完成：

1. 新增 `src/runtime/localDevOmniClient.js`，提供 WebSocket 发送层。
2. Omni Session 面板新增“发送到 LocalDev Adapter”按钮。
3. Runtime 可将当前 `omni.input_packet.v1` 发往 `ws://127.0.0.1:8000/omni/realtime`。
4. LocalDev 返回会被归一化为 `omni.output_turn.v1`，继续走现有表情、回复、ToolIntentRouter、插件和权限链路。
5. 本地服务未启动、endpoint 非 WebSocket 或返回内容无法解析时，会写入 Action Log 和 Runtime Trace。

后续 v1.0.6 / v1.1 建议：

- 提供一个最小本地 Adapter Server Mock，便于端到端验证 WebSocket 协议。
- 把浏览器麦克风流升级为可传输的 RobotMicAdapter / LocalDev 音频通道。
- 把 Visual Frame Buffer 的选中帧升级为可传输的图像 payload。
- 增加模型回复音频播放、打断和会话恢复机制。

## v1.0.8 补充计划：LocalDev Adapter Roundtrip 稳定

已完成：

1. 修正 LocalDev Mock Server 对输入包的识别顺序，解决 `packet=unknown`。
2. `scripts/localdev-omni-mock-server.mjs` 现在输出 `packet_schema`、`packet_id`、`robot_id`、`display_name`、`requestId`。
3. `src/runtime/localDevOmniClient.js` 从一次性发送函数升级为 `LocalDevOmniBridge`。
4. WebSocket 会话可保持连接，后续发送会复用已打开的 LocalDev 连接。
5. 输入/输出通过 `requestId` 匹配，避免后续多回合调试时回包对应关系不清楚。
6. `OmniSessionPanel` 新增 LocalDev WebSocket 实时会话状态和“断开 LocalDev”按钮。
7. 发布包继续不带 `node_modules/`、`dist/` 和带内部 registry 的 `package-lock.json`。

后续 v1.0.8 / v1.1 建议：

- 增加 `RobotMicAdapter` 和 `LocalDevAudioChannel` 协议。
- 让浏览器麦克风产生的音频 chunk 可以发送到 LocalDev Adapter。
- 让 Visual Frame Buffer 的关键帧可以以 payload 方式发送到 LocalDev Adapter。
- 增加模型回复音频流播放占位。
- 增加实时打断 / barge-in 状态机。
- 将本地 Mock Server 的协议迁移成真实 LocalDev Qwen2.5-Omni Adapter 的参考实现。

## v1.0.8 Implementation Notes

本阶段目标是“媒体通道预留”，不是直接接真实 Qwen2.5-Omni。

已完成：定义 `omni.audio_frame.v1` / `omni.camera_frame.v1`，Web 麦克风和摄像头可产生媒体帧元数据，LocalDev Bridge 可发送媒体帧，Mock Server 可识别并返回 ACK。

下一步建议：新增 RobotMicAdapter / RobotCameraAdapter，并为 LocalDevAudioChannel、LocalDevFrameChannel 增加真实 PCM/Opus 和 JPEG payload 发送。

## v1.0.9 Implementation Notes

v1.0.9 focuses on one small step toward real realtime dialogue: send actual microphone PCM chunks over the existing LocalDev WebSocket bridge.

Implemented:

1. `RealtimeAudioPanel` captures microphone PCM Float32 samples using the browser audio graph.
2. Audio samples are chunked into about 250ms frames.
3. Each frame becomes `omni.audio_frame.v1` with `payloadIncluded=true`, `payloadEncoding=base64`, `sampleCount`, `durationMs`, and `byteLength`.
4. `LocalDev Mock Server` logs `payload=yes`, byte length, sample count, and duration for audio frames.
5. Omni Session and Visible Context panels surface the latest audio frame payload status.

Not implemented yet:

1. Model-side streaming inference.
2. Reply audio stream playback.
3. Interrupt / barge-in control.
4. Production binary transport or WebRTC media channel.

## v1.1.0 Implementation Notes

v1.1.0 adds the visual half of the LocalDev media path: selected browser camera frames now carry real JPEG payloads through `omni.camera_frame.v1`.

Implemented:

1. `CameraPreview` continues to capture selected frames as JPEG data URLs according to `FramePolicyEngine`.
2. `createCameraFrame` strips the JPEG data URL into base64 payload and marks `payloadIncluded=true`.
3. Each camera frame includes `byteLength`, dimensions, selector policy, upload plan, JPEG quality, and payload encoding.
4. `LocalDevOmniClient.sendMediaFrame` reuses the persistent LocalDev WebSocket bridge for camera frames.
5. `LocalDev Mock Server` logs `payload=yes`, byte length, dimensions, and selector policy for camera frames.
6. Omni Session and Visible Context panels surface the latest camera frame payload status.

Not implemented yet:

1. Model-side streaming inference over the received JPEG payload.
2. Reply audio stream playback.
3. Interrupt / barge-in control.
4. Production binary transport or WebRTC media channel.
5. Cloud upload gating beyond the current Demo permission/FramePolicy display.

Recommended next step: v1.1.1 should add mock streaming reply audio and playback state so the realtime dialogue loop can show listening → thinking → speaking more naturally.


## v1.1.1 Implementation Notes

v1.1.1 adds the output half of the LocalDev realtime session. The goal is bidirectional realtime communication, not text-to-speech.

Implemented:

1. `omni.output_state.v1` for thinking / speaking / finished state events.
2. `omni.reply_audio_frame.v1` for mock service-side PCM Float32 output audio chunks.
3. `realtimeOutputChannel.js` to keep Omni -> Web output state separate from Web -> Omni input media channels.
4. `RealtimeAudioOutputPlayer.jsx` to play reply audio frames with Web Audio.
5. `LocalDevOmniClient` handling for output state and reply audio frame messages without resolving the pending request too early.
6. `LocalDev Mock Server` streaming output state, output turn, reply audio frames, and final state over the same WebSocket session.

Not implemented yet:

1. Real Qwen2.5-Omni or cloud Omni native audio output.
2. Production binary transport / WebRTC.
3. Barge-in, interrupt, jitter buffer, and echo control.
4. Real robot speaker hardware output.

## 阶段 2.5：v1.1.3 Realtime Interrupt / Barge-in Mock Control

目标：在不做自动语音识别打断的前提下，先建立显式 interrupt 控制链路。

### 已实现

- `omni.interrupt.v1` 协议。
- Runtime 手动 interrupt action。
- Web Audio 播放源停止与播放队列清空。
- LocalDev Mock Server 当前输出 turn 取消。
- UI 面板展示 interrupted 状态、interrupt count 和 last reason。

### 原则

```text
audio_frame 是输入媒体
reply_audio_frame 是输出媒体
interrupt 是控制事件
```

三者不能混淆。

### 后续建议

下一步可以做 v1.1.3：

- output jitter buffer 稳定性。
- speaking/listening 并行状态细化。
- interrupt ack 和 turn cancellation trace 更细。
- 设计自动 barge-in 的 VAD/AEC 草案，但暂不默认启用。

## 阶段 2.6：v1.1.3 Realtime Session State Machine

目标：把实时输入、实时输出、播放和 interrupt 控制统一为一个可观察、可扩展的会话状态机。

### 已实现

- 新增 `src/runtime/realtimeSessionState.js`。
- 增加 `omni.realtime_session_state.v1` 状态结构。
- 在 `useRuntimeCore` 中接入状态转移：实时音频开启、输入帧 observed/sent、输入包发送、output_state、reply_audio_frame、播放完成、interrupt、error、reset。
- `OmniSessionPanel` 显示 sessionId、当前状态、turnId、requestId、输入/输出计数、是否可打断、麦克风是否保持监听。
- `VisibleContext` 透明展示状态机 guardrails。
- `RealtimeAudioOutputPlayer` 展示状态机摘要。

### 原则

```text
播放中可以继续监听
audio_frame 不自动触发 interrupt
reply_audio_frame 不回流成用户输入
reply_text 不进入 TTS 管线
interrupt 必须是显式控制事件
```

### 后续建议

v1.1.4 可以做：

- 更细的 playback jitter buffer。
- turn lifecycle trace 导出。
- 对自动 barge-in 的 VAD/AEC 设计草案，但默认仍不启用。
- 真实 Omni Adapter 接入前的协议兼容层设计。


## 阶段 2.9：v1.1.6 项目稳定性整理

目标：在继续进入 v1.2.0 LocalDev Adapter Contract 之前，先把脚本、版本、文档和验证流程整理成固定维护节奏。

### 已实现

1. `package.json` 统一到 v1.1.6。
2. 新增 `npm run verify`，执行构建和安全 smoke suite。
3. 新增 `npm run verify:quick`，用于小改动快速检查。
4. 新增 `npm run clean`，清理本地生成物和日志。
5. 新增 `npm run test:version-doctor`，检查版本一致性。
6. 新增 `npm run test:smoke`，集中运行当前安全 smoke tests。
7. 新增 `docs/MAINTENANCE.md`，固定 Git、build、smoke、tag 和 push 维护流程。

### 原则

```text
v1.1.6 不接真实模型
v1.1.6 不接真实云 API
v1.1.6 不接真实硬件
v1.1.6 不接真实 TTS
v1.1.6 只整理维护与验证流程
```

### 下一步

进入 v1.2.0：LocalDev Adapter Contract 稳定版，重点做协议合约、错误恢复、断线重连、media ack、interrupt 和 output frame 兼容测试。
