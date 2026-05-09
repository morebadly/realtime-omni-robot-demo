# Release Notes v1.1.2

v1.1.2 是 **Realtime Interrupt / Barge-in Mock Control** 版本。

本版本不是自动语音打断，也不是 TTS。它在 v1.1.1 的 Mock Realtime Omni 双向媒体通道基础上，新增显式 `omni.interrupt.v1` 控制事件，用手动按钮模拟用户插话，验证 Runtime、LocalDev Mock Server、播放队列和 RobotFace 状态能否正确停止当前输出流。

## 新增能力

- 新增 `omni.interrupt.v1` 协议，用于表达明确的用户插话 / barge-in 控制事件。
- `RealtimeAudioOutputPlayer` 支持停止当前播放源、清空本地播放队列，并通过 `interruptToken` 防止旧帧继续播放。
- `realtimeOutputChannel` 增加 `interruptCount`、`interruptToken`、`lastInterrupt` 等状态字段。
- `localDevOmniClient` 增加 `sendInterrupt()`，通过同一个 LocalDev WebSocket realtime session 发送 interrupt 控制消息。
- LocalDev Mock Server 支持取消当前 turn 的后续 `reply_audio_frame` 定时推送，并返回 `omni.output_state.v1: interrupted`。
- `OmniSessionPanel` 和 `RealtimeAudioOutputPlayer` 新增“模拟用户插话 / Interrupt”按钮。
- `VisibleContext` 明确展示 interrupt 状态，并说明 `audio_frame` 不会自动触发 barge-in。

## 重要安全边界

- 播放时可以继续采集并发送 `omni.audio_frame.v1`。
- `omni.audio_frame.v1` 只是输入媒体帧，不等于用户插话。
- 只有明确的 `omni.interrupt.v1` 才能停止当前输出流。
- v1.1.2 不做自动 VAD/AEC，不根据“麦克风检测到声音”自动打断。
- 这样可以避免机器人自己的播放声音被麦克风重新采到后，导致 Omni 自己打断自己。

## 保留能力

- v1.1.0：真实 PCM Float32 输入 payload。
- v1.1.0：真实 JPEG 摄像头关键帧 payload。
- v1.1.1：`omni.output_state.v1`、`omni.reply_audio_frame.v1`、Web Audio 流式播放、RobotFace speaking 联动。
- 插件、权限、Tool Engine 仍然保持安全 Mock，不接真实邮件、真实空调、真实硬件或真实云 API。

## 验收标准

1. 启动 `npm run mock:localdev`。
2. 启动 `npm run dev`。
3. Web 发送到 LocalDev Adapter 后，应收到 `reply_audio_frame` 并播放。
4. 播放中点击“模拟用户插话 / Interrupt”。
5. Web 端播放停止，队列清空，RobotFace 离开 speaking。
6. Mock Server 停止继续发送当前 turn 的后续 `reply_audio_frame`。
7. 面板显示 `output_state=interrupted` 和 interrupt count。

## 非目标

- 不接真实 Qwen2.5-Omni。
- 不接真实云 API。
- 不接真实 TTS。
- 不做自动用户插话检测。
- 不做回声消除 AEC。
- 不接真实硬件扬声器或麦克风阵列。
