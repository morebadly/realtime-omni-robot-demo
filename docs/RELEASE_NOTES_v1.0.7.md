# Release Notes v1.0.7

## 主题

LocalDev Adapter Roundtrip 稳定版。

v1.0.7 主要修复 v1.0.6 中 LocalDev Mock Server 日志显示 `packet=unknown` 的问题，并把 LocalDev WebSocket 从“一次发送一次断开”的调试方式升级为可保持连接的 roundtrip bridge。

## 新增与修复

- 修正 `scripts/localdev-omni-mock-server.mjs` 的输入包识别逻辑：优先读取 envelope 内的 `packet.schema`，避免把 envelope 自身误判为 `omni.input_packet.v1`。
- Mock Server 日志现在会输出：
  - `packet_schema`
  - `packet_id`
  - `robot`
  - `display_name`
  - `expression`
  - `intents`
  - `request`
- `LocalDevOmniClient` 升级为 `LocalDevOmniBridge`：
  - 支持保持 WebSocket 连接。
  - 支持 `requestId` 匹配输入包和输出回合。
  - 支持复用已连接的 LocalDev 会话。
  - 支持手动断开。
- Omni Session 面板新增 LocalDev WebSocket 实时会话状态：
  - 未连接
  - 连接中
  - 已保持连接
  - 发送中
  - 已收到回合
  - 连接失败
  - 已断开
- 新增“断开 LocalDev”按钮。
- LocalDev Mock Server 返回 envelope：

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

## 保持不变

- Web 仍只是开发控制台，不是机器人核心。
- Runtime 仍构建 `omni.input_packet.v1`。
- 原始音频流和摄像头关键帧仍是主输入方向；ASR 文本仅用于字幕、日志、调试和插件关键词辅助。
- 触摸 / NFC 仍只作为事实事件，不做用户情绪判断。
- 当前 LocalDev Mock Server 仍不是真实 Qwen2.5-Omni。
- 当前版本仍不发送真实 PCM / Opus 音频 chunk，也不发送真实图片 payload。

## 验证命令

```bash
npm install
npm run build
```

LocalDev roundtrip 验证：

```bash
npm run mock:localdev
```

另开终端：

```bash
npm run dev
```

页面中点击：

```text
构建 Omni 输入包 → 发送到 LocalDev Adapter
```

Mock Server 日志应显示：

```text
packet_schema=omni.input_packet.v1 packet_id=omni_xxx robot=... display_name=... expression=... intents=... request=localdev_req_xxx
```

## 下一步建议

v1.0.8 建议开始做真实流式输入边界：

1. `RobotMicAdapter` / `LocalDevAudioChannel` 协议草案。
2. 浏览器麦克风 PCM / Opus chunk 发送 Demo。
3. 视觉关键帧 payload 发送 Demo。
4. 回复语音流播放占位。
5. 打断 / barge-in 控制状态机。
