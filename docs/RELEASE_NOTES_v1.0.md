# Release Notes v1.0

## 核心目标

v1.0 的重点是新增 **Omni Session Bridge**：把 Runtime 当前掌握的多模态输入与执行上下文打包成统一 Adapter 输入协议，并用前端 Mock 模拟一次 Omni 输出回合。

这一步不是为了做“假模型”，而是为了先确定真实 LocalDevOmniAdapter / Cloud Adapter 将来要接收什么、返回什么。

## 新增功能

- 新增 `src/runtime/omniPacket.js`
  - 构建 `omni.input_packet.v1`
  - 包含原始音频状态、关键帧策略、摄像头帧缓存、事实事件、机器人身份档案、运行模式、网络状态、权限状态、插件 manifest
  - 明确 ASR 文本只作为字幕、日志、调试、插件关键词辅助

- 新增 `src/runtime/omniTurnSimulator.js`
  - 模拟 `omni.output_turn.v1`
  - 返回 `reply_text`、`reply_audio`、`expression`、`tool_intents`
  - 根据触摸、NFC、视觉问答、语音意图、离线模式等生成不同 Mock 输出

- 新增 `src/components/OmniSessionPanel.jsx`
  - 可以构建输入包
  - 可以模拟 Omni 回合
  - 可以查看发送给 Adapter 的完整 JSON
  - 可以查看 Adapter 返回的统一输出 JSON

- `useRuntimeCore` 新增状态：
  - `omniPacket`
  - `lastOmniTurn`

- `useRuntimeCore` 新增动作：
  - `handleOmniPacketBuild`
  - `handleOmniTurnSimulate`
  - `handleOmniTurnClear`

- Runtime Trace 新增：
  - `OmniSessionBridge`
  - `ToolIntentRouter`
  - `ModelAdapterManager.adapter.output`

## 架构意义

v1.0 开始把“模型输入输出协议”从 UI 和各个组件里抽出来：

```text
Runtime 状态 + 音频 + 视觉 + 事实事件 + 权限 + 插件 manifest
        ↓
Omni Session Bridge
        ↓
omni.input_packet.v1
        ↓
LocalDev / ThirdPartyCloud / SelfHosted Adapter
        ↓
omni.output_turn.v1
        ↓
Expression Engine / Plugin Engine / Tool Intent Router / Action Log
```

后续接真实模型时，Web 页面不需要知道具体模型供应商；只需要让 Adapter 发送 `omni.input_packet.v1`，并解析统一输出。

## 仍然是 Mock 的部分

- 没有真实连接 Qwen2.5-Omni。
- 没有真实云端 API。
- `reply_audio` 只是占位。
- `tool_intents` 只做展示和 Trace，没有完整自动路由到插件执行链。
- 摄像头帧仍然是浏览器摄像头模拟。
- 麦克风仍然是浏览器麦克风模拟。

## 验证

```bash
npm run build
```

构建通过。
