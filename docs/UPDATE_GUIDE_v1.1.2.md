# Update Guide v1.1.2

本指南用于从 v1.1.1 升级到 v1.1.2。

v1.1.2 的目标是建立 **显式 interrupt / barge-in 控制链路**。它不是自动语音打断，而是先用 Mock 按钮验证实时通讯协议和播放中止流程。

## 更新步骤

1. 覆盖项目文件。
2. 删除旧构建产物。
3. 重新安装依赖并构建。

Windows CMD 示例：

```cmd
cd /d C:\Users\Administrator\Desktop\realtime-omni-robot-demo
rmdir /s /q node_modules
rmdir /s /q dist
npm install
npm run build
```

如果 `node_modules` 或 `dist` 不存在，提示可以忽略。

## 运行验证

终端 1：

```cmd
npm run mock:localdev
```

终端 2：

```cmd
npm run dev
```

在 Web 中：

1. 确认机器人处于 `local_dev` 模式。
2. 点击“发送到 LocalDev Adapter”。
3. 等待 `reply_audio_frame` 开始播放。
4. 点击“模拟用户插话 / Interrupt”。
5. 检查输出通道状态是否变为 `interrupted`。

## 新增文件 / 修改重点

新增或扩展：

```text
src/runtime/omniOutputFrames.js        # 增加 omni.interrupt.v1
src/runtime/realtimeOutputChannel.js   # 增加 interrupt 状态与队列清空
src/runtime/localDevOmniClient.js      # 增加 sendInterrupt()
scripts/localdev-omni-mock-server.mjs # 支持 cancel current output turn
src/components/RealtimeAudioOutputPlayer.jsx
src/components/OmniSessionPanel.jsx
src/components/VisibleContext.jsx
```

## 设计边界

- `reply_text` 仍然只是字幕、日志、调试，不进入 TTS。
- `reply_audio_frame` 仍然是 Omni 输出媒体帧。
- `audio_frame` 仍然是用户/机器人麦克风输入媒体帧。
- `audio_frame` 不会自动触发 interrupt。
- 用户插话必须由 `omni.interrupt.v1` 明确表示。

## 后续版本建议

v1.1.3 或后续版本可以继续做：

- 更稳定的 output jitter buffer。
- 更清晰的 listening / speaking 并行状态。
- 自动 barge-in 的 VAD/AEC 设计草案。
- 服务端回合取消 ack 与错误恢复。

自动打断必须等到能够区分用户语音、机器人回声和环境噪声后再做。
