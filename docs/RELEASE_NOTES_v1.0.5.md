# Release Notes v1.0.5

## 核心改动

- 新增 `LocalDevOmniAdapter` WebSocket Client 骨架。
- Omni Session 面板新增“发送到 LocalDev Adapter”按钮。
- Runtime 可以把当前 `omni.input_packet.v1` 发往本地调试 endpoint。
- LocalDev Adapter 返回会被归一化为 `omni.output_turn.v1`，并复用现有输出处理链。
- 本地服务未启动、endpoint 错误或输出无法解析时，会写入 Action Log 和 Runtime Trace。

## 设计边界

- 仍不把项目改成“语音转文字 → 文本聊天 → TTS”。
- 发送给 LocalDev 的仍是统一 Omni 输入包。
- 当前版本不实现真实音频流/WebRTC，也不接真实云端 API。
- Mock Omni 回合仍保留，用于无本地模型时调试。

## 默认 endpoint

```text
ws://127.0.0.1:8000/omni/realtime
```
