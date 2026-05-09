# Realtime Omni Robot Demo v1.1.0

这是一个用于投资人演示和后续工程开发的 **实时 Omni 机器人平台 Demo**。项目定位不是单纯本地部署机器人，而是：

> 云端优先、可本地调试、可移动、多网络、自带插件和权限系统的实时 Omni 机器人平台。

v1.1.0 是真实摄像头 JPEG 关键帧 payload 版：在 v1.0.9 真实麦克风 PCM chunk 基础上，浏览器摄像头关键帧也会携带 JPEG base64 payload，通过 `omni.camera_frame.v1` 发送到 LocalDev Adapter。

## 快速运行

```bash
npm install
npm run dev
```

如果要测试 LocalDev Adapter 链路，另开一个终端运行：

```bash
npm run mock:localdev
```

浏览器打开终端输出的地址，通常是：

```text
http://localhost:5173
```

Windows CMD 建议先进入项目目录，再执行：

```cmd
rmdir /s /q node_modules
rmdir /s /q dist
npm install
npm run dev
```

如果提示找不到 `node_modules` 或 `dist`，可以忽略；如果提示找不到 `package.json`，说明还没有 `cd` 进入项目文件夹。

## v1.1.0 新增内容

- `omni.camera_frame.v1` 现在会携带浏览器摄像头 JPEG base64 payload，不再只是关键帧元数据。
- `LocalDev Mock Server` 日志会显示摄像头帧 `payload=yes bytes=... 640x... selector=...`，用于确认真实 JPEG 关键帧已经通过 WebSocket 到达。
- Omni Session / Visible Context 面板显示最近视觉帧 bytes 和 payload 状态。
- `omni.audio_frame.v1` 保持 v1.0.9 的真实 PCM Float32 chunk 发送能力。
- 继续坚持 Omni-first：ASR 文本只作字幕、日志、调试和插件关键词辅助；摄像头关键帧不做前端情绪摘要。

## 当前实现

- Web 控制台布局
- RuntimeCore Hook：集中处理机器人状态、模式切换、网络、实时音频、关键帧策略、权限、插件、事实事件、模型配置、身份档案、Omni 输入包和 Mock 输出回合
- Robot Identity Profile：用户命名、唤醒名、默认角色、声音风格、称呼方式
- Robot Runtime Config：按 robot_id 存储权限、插件和模型 Adapter 配置
- Realtime Audio Stream：浏览器麦克风模拟机器人麦克风，主输入是原始音频流，不是 ASR 文本
- 浏览器摄像头预览，模拟未来机器人摄像头视角
- Visual Frame Buffer / Frame Selector / FramePolicyEngine 关键帧策略演示
- Omni Session Bridge：把音频、视觉、事件、身份、权限、插件和网络状态打包给 Adapter
- LocalDev Omni Client：保持 WebSocket 调试会话，把统一输入包通过 requestId 发送并匹配输出回合，同时可发送音频/摄像头媒体帧
- LocalDev Omni Mock Server：本地验证 `omni.input_packet.v1` → `omni.output_turn.v1`，并识别带真实 PCM payload 的 `omni.audio_frame.v1` 与带真实 JPEG payload 的 `omni.camera_frame.v1` 媒体帧
- Tool Intent Router：把 Omni 输出的工具/插件意图路由回插件触发器
- Mock Tool Engine：执行 Demo 级空调、邮件、表情、动作和角色切换
- LOOI 风格动态机器人表情
- 表情状态：idle / listening / thinking / speaking / happy / annoyed / angry / sad / shy / surprised / sleepy / error
- Runtime Mode：Local Dev / Wi‑Fi Cloud / eSIM/SIM Cloud / Self-hosted Cloud / Offline Pet
- Model Adapter Registry：配置模型供应商、地址、模型名和能力声明
- 插件中心：启用、关闭、删除、测试运行、新增无代码插件、多动作编排、代码插件
- 插件 manifest：触发器、权限、runtime、沙箱声明
- 插件动作库：表情、说话、动作、角色、空调、邮件
- 权限中心 + 插件执行权限守卫
- Runtime Trace：展示 Runtime 模块间事件流
- Mock 事实事件：触摸、NFC、语音意图、视觉问答、系统错误
- Mock 插件动作：空调状态、邮件草稿、角色切换、摇尾巴、机器人说话
- 机器人可见信息面板
- 行为日志

## 项目目录

```text
realtime-omni-robot-demo/
├── AGENTS.md
├── docs/
│   ├── ARCHITECTURE.md
│   ├── IMPLEMENTATION_PLAN.md
│   ├── INVESTOR_NOTES.md
│   ├── RELEASE_NOTES_v1.1.0.md
│   └── UPDATE_GUIDE_v1.1.0.md
├── src/
│   ├── components/
│   │   ├── RobotRegistryPanel.jsx
│   │   ├── OmniSessionPanel.jsx
│   │   ├── RealtimeAudioPanel.jsx
│   │   ├── ConnectionManagerPanel.jsx
│   │   ├── RobotFace.jsx
│   │   ├── RobotProfilePanel.jsx
│   │   ├── RuntimeArchitecturePanel.jsx
│   │   ├── CameraPreview.jsx
│   │   ├── EmotionInspector.jsx
│   │   ├── ModelProviderPanel.jsx
│   │   ├── StatusControls.jsx
│   │   ├── PermissionPanel.jsx
│   │   ├── PluginCenter.jsx
│   │   ├── VisibleContext.jsx
│   │   ├── ActionLog.jsx
│   │   └── MockEventButtons.jsx
│   ├── data/
│   │   └── demoConfig.js
│   ├── runtime/
│   │   ├── omniPacket.js
│   │   ├── omniTurnSimulator.js
│   │   ├── toolIntentRouter.js
│   │   ├── toolEngine.js
│   │   ├── localDevOmniClient.js
│   │   ├── omniMediaFrames.js
│   │   ├── visualFrameBuffer.js
│   │   ├── useRuntimeCore.js
│   │   ├── realtimeSession.js
│   │   ├── networkManager.js
│   │   ├── framePolicy.js
│   │   ├── actionLibrary.js
│   │   ├── codePluginSandbox.js
│   │   ├── eventBus.js
│   │   ├── expressionEngine.js
│   │   ├── modelAdapters.js
│   │   ├── mockRuntime.js
│   │   ├── permissionEngine.js
│   │   ├── pluginEngine.js
│   │   ├── pluginManifest.js
│   │   ├── robotRegistry.js
│   │   ├── robotProfile.js
│   │   ├── robotRuntimeConfig.js
│   │   └── storage.js
│   ├── styles/
│   │   └── app.css
│   ├── App.jsx
│   └── main.jsx
├── scripts/
│   └── localdev-omni-mock-server.mjs
├── index.html
├── package.json
└── README.md
```

## 核心架构方向

```text
Robot Body Client
- 麦克风 / 摄像头 / 扬声器 / 屏幕
- 触摸 / NFC / 舵机
- Wi‑Fi / eSIM / 实体 SIM

        ↓

Runtime Layer
- RuntimeCore
- Robot State Store
- Robot Identity Profile / Robot Profile Store
- Network Manager
- Connection Manager
- Runtime Mode Manager
- Model Adapter Registry
- Realtime Session
- Omni Session Bridge
- Event Bus
- Visual Frame Buffer
- Frame Selector
- Expression Engine
- Plugin Engine
- Plugin Manifest / Sandbox
- Permission Engine
- Tool Intent Router
- Tool Engine
- Action Log
- Visible Context Panel
- Robot Registry

        ↓

Client Layer
- WebUI：开发者控制台
- App：未来普通用户主入口
```

## 后续接入方向

1. 接入真实 `LocalDevOmniAdapter`，把本地 Qwen2.5-Omni 作为开发调试模型。
2. 将 `OmniSessionBridge` 的 Mock 发送层替换为 WebSocket/WebRTC/HTTP Adapter Client。
3. 将浏览器麦克风模拟替换为 RobotMicAdapter，原始音频直接进入 Omni。
4. 将浏览器摄像头模拟替换为 RobotCameraAdapter，并由真正的 Visual Frame Buffer / Frame Selector 控制 payload 上传。
5. 接入第三方云端 Omni API。
6. 将代码插件沙箱从 Demo Worker 升级为真正的设备端/服务端隔离沙箱。
7. 接入真实触摸/NFC 硬件。
8. 接入实体机器人屏幕与舵机。
9. WebUI 保持开发控制台，普通用户主入口迁移到 App。


## v1.1.0：真实摄像头 JPEG 关键帧 payload 版

这版让 `omni.camera_frame.v1` 从“关键帧元数据”升级为“真实浏览器摄像头 JPEG payload”。Mock Server 应看到 camera frame `payload=yes` 且 `bytes > 0`，同时打印关键帧尺寸和 selector 策略。音频通道继续沿用 v1.0.9 的真实 PCM Float32 chunk。

这仍然不是完整实时对话，因为还没有模型语音流返回、播放和打断机制，也还没有把 payload 转发给真实 Qwen2.5-Omni。

## v1.0.8：音频帧 / 关键帧媒体通道预留版

这版先把 LocalDev Adapter 的媒体通道边界打通：`omni.input_packet.v1` 负责低频上下文，`omni.audio_frame.v1` 负责音频帧，`omni.camera_frame.v1` 负责摄像头关键帧。v1.0.8 的音频仍是元数据和 payload 占位，不直接接真实 Qwen。


## v1.0.7：LocalDev Adapter Roundtrip 稳定版

这版修正了 v1.0.6 中 Mock Server 日志显示 `packet=unknown` 的问题，并让 LocalDev WebSocket 更接近实时 Omni 调试会话：

```text
WebUI / OmniSessionPanel
  ↓ envelope: cloudgenie.local_dev.envelope.v1
  ↓ requestId + omni.input_packet.v1
LocalDevOmniClient persistent bridge
  ↓ WebSocket keep-alive
scripts/localdev-omni-mock-server.mjs
  ↓ requestId + omni.output_turn.v1
Runtime output chain
  ↓
Expression / ToolIntentRouter / PluginEngine / PermissionEngine / ToolEngine / ActionLog
```

验证方式：

```bash
npm install
npm run mock:localdev
```

另开一个终端：

```bash
npm run dev
```

页面中点击“构建 Omni 输入包”后，再点击“发送到 LocalDev Adapter”。Mock Server 日志应显示类似：

```text
packet_schema=omni.input_packet.v1 packet_id=omni_xxx robot=robot_local_dev display_name=DemoBot 01 expression=idle intents=0 request=localdev_req_xxx
```

这仍然不是接入真实 Qwen2.5-Omni；它只稳定 Web → LocalDev Adapter → Web 的协议回环。真实音频 chunk 和图片 payload 已经在 v1.0.9 / v1.1.0 接入，回复语音流、播放和打断机制仍在后续版本实现。


## v1.0.6：Codex 迁移准备与 LocalDev Mock Server

这版不做大重构，重点是让项目更适合进入 Codex / GitHub 工作流，并让 LocalDev Adapter 链路可以在没有真实 Qwen2.5-Omni 服务时被验证。

- 发布包不再包含 `node_modules/` 和 `dist/`。
- 新增 `AGENTS.md`，作为 Codex 的项目级开发规则。
- 新增 `npm run mock:localdev`，启动本地 WebSocket Mock 服务。
- Mock 服务监听 `ws://localhost:8000/omni/realtime`，接收统一输入包并返回统一输出回合。
- 当前 Mock Server 只验证 Runtime 协议和回包链路；真实 PCM chunk 已在 v1.0.9 接入，真实 JPEG 关键帧 payload 已在 v1.1.0 接入，但仍不执行真实模型推理。

本地验证方式：

```bash
npm install
npm run mock:localdev
```

另开一个终端：

```bash
npm run dev
```

在页面里构建 Omni 输入包，然后点击“发送到 LocalDev Adapter”。


## v1.0.5：LocalDevOmniAdapter Client 骨架

这版开始为本地 Qwen2.5-Omni 调试做发送层准备，但仍保持 Demo 的安全边界：

- WebUI 不直接变成文本聊天机器人。
- Runtime 仍构建 `omni.input_packet.v1`，其中包含原始音频状态、关键帧摘要、事实事件、身份档案、权限和插件 manifest。
- `LocalDevOmniClient` 只负责 WebSocket 发送和接收统一输出。
- 本地 Adapter 返回的输出必须归一化为 `omni.output_turn.v1`，再进入 Runtime 的统一输出处理链。
- 当前版本还不实现真实音频流/WebRTC，也不接真实云端 API。

默认 endpoint：

```text
ws://localhost:8000/omni/realtime
```

## v1.0.4：Per-Robot Runtime 配置

这版把“一个 Web/App 控制多个机器人”继续往 Runtime 层推进：

- 每个 `robot_id` 都有自己的 Runtime 配置存储。
- 权限中心显示和修改的是当前 active robot 的权限。
- 插件中心显示和修改的是当前 active robot 的插件列表。
- Model Provider Panel 保存的是当前 active robot 的 Adapter 配置。
- 专属调控界面会展示当前 `robot_id`、`display_name`、mode、adapter、权限数量和启用插件数量。

当前仍是浏览器本地 Demo 存储；成熟产品中这些配置应迁移到 Cloud Robot Registry / Runtime API / Robot Gateway。

## v1.0.3：Tool Intent Router 与 Runtime 边界补强

这版在 v1.0.2 多机器人控制基础上，继续补齐 Runtime 内部链路：

- Mock Omni 输出的 `tool_intents` 不再只进入 Trace，而是由 `ToolIntentRouter` 映射为插件触发器。
- 匹配到启用插件后，仍然执行 `plugin.run`、manifest 权限声明和动作权限检查。
- 工具动作由 `Mock Tool Engine` 执行，当前仍只作用于 Demo 状态，不接真实邮箱、真实空调或真实硬件。
- 浏览器摄像头仍是模拟机器人摄像头；v1.1.0 起关键帧 payload 会通过 `omni.camera_frame.v1` 送到 LocalDev Adapter，后续可替换为真正 RobotCameraAdapter。
- WebUI 仍只是控制台：按钮、预览和 JSON 面板不拥有核心业务规则。

## v1.0.2：Robot Registry 删除与多机器人控制

这版在“一套 Web/App 控制台管理多个机器人”的基础上，补齐删除入口和安全守卫：

- 新增 `Robot Registry` 面板，可选择当前 active robot。
- 默认预置本地调试机器人、家庭 Wi-Fi 云端机器人、外出 eSIM 机器人三个实例。
- 新增机器人占位，用于后续绑定真实硬件、Robot Gateway、设备证书和云端注册。
- 机器人昵称仍然是 `display_name`，不会影响内部稳定 `robot_id`。
- Robot Identity Profile 改成按 `robot_id` 存储，不同机器人可以有不同昵称、唤醒名、声音风格和默认角色。
- 当前页面所有表情、模式、模型路由、插件测试、Omni 输入包都只作用于 active robot。

设计原则：Web 不是核心，只是 Client Layer；真正成熟形态应该由 Cloud Robot Registry / Runtime API 提供多机器人列表、在线状态、权限分组、远程控制和会话路由。

删除原则：当前 Demo 的删除只是本地注册占位移除。成熟产品里需要把“解绑当前账号”“注销设备证书”“删除云端记录”“保留或删除历史日志”拆成不同流程，不能只靠前端列表删除。
