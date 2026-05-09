# Release Notes v1.1.1

## 版本定位

v1.1.1 是 **Mock Realtime Omni 双向媒体通道** 版本。

本版本不是 TTS 版本，也不是 `ASR -> LLM -> TTS` 的传统聊天机器人路线。它在 v1.1.0 的真实输入媒体帧基础上，补齐 LocalDev Mock Server 到 Web Runtime 的输出媒体流：

```text
麦克风 PCM / 摄像头 JPEG / 事实事件
-> Runtime Core
-> LocalDev Adapter WebSocket session
-> LocalDev Mock Omni Server
-> omni.output_state.v1
-> omni.reply_audio_frame.v1
-> Web Audio 播放 / RobotFace speaking / Action Log
```

`reply_text` 只用于字幕、日志和调试；`reply_audio_frame` 才是 Omni 输出媒体帧。

## 新增内容

1. 新增 `src/runtime/omniOutputFrames.js`。
   - 定义 `omni.output_state.v1`。
   - 定义 `omni.reply_audio_frame.v1`。
   - 提供 LocalDev 输出消息 normalize 工具。

2. 新增 `src/runtime/realtimeOutputChannel.js`。
   - 独立管理 Omni -> Web 的输出通道。
   - 记录 output state、turnId、received / played / queued audio frames、final frame、播放状态和错误。
   - 与输入侧 `omniMediaFrames.js` 分离。

3. 新增 `src/components/RealtimeAudioOutputPlayer.jsx`。
   - 使用 Web Audio `AudioContext` 播放 `reply_audio_frame` PCM Float32 payload。
   - 播放后回写 Runtime，推进 playedFrames 和 queue 状态。

4. 更新 `scripts/localdev-omni-mock-server.mjs`。
   - 在同一个 WebSocket realtime session 中返回：
     - `omni.output_state.v1: thinking`
     - `omni.output_turn.v1`
     - `omni.output_state.v1: speaking`
     - 多个 `omni.reply_audio_frame.v1`
     - `omni.output_state.v1: finished`
   - Mock 音频是服务端生成的 PCM Float32 分片，不是由 reply_text 生成的 TTS。

5. 更新 `src/runtime/localDevOmniClient.js`。
   - 支持接收 `output_state` 和 `reply_audio_frame`。
   - 避免把 state/audio frame 当成最终 output turn 提前 resolve。

6. 更新 `src/runtime/useRuntimeCore.js`。
   - 接入 realtimeOutput 状态。
   - 通过 output state / reply audio frame 驱动 speaking 状态。
   - 保持 plugin / permission / tool intent 链路不变。

7. 更新 UI 面板。
   - `OmniSessionPanel` 显示实时输出通道。
   - `VisibleContext` 显示当前输出状态、reply audio frame 统计和播放状态。
   - `RobotFace` speaking 动画可由输出音频帧播放状态驱动。

## 未改变内容

- 不接真实 Qwen2.5-Omni。
- 不接真实云 API。
- 不接真实 TTS。
- 不接真实邮件、真实空调、真实硬件。
- 不改变插件权限执行链。
- 不把 CloudGenie 写死为平台名。
- 不把 ASR 文本作为主输入。
- 不做前端视觉情绪摘要。

## 验收方式

1. 运行：

```bash
npm install
npm run mock:localdev
npm run dev
```

2. 在 Web 中构建 Omni 输入包并发送到 LocalDev Adapter。
3. 观察：
   - LocalDev Bridge 收到 output state。
   - Realtime Output Channel 收到 reply audio frames。
   - Web Audio 播放 Mock 输出音频。
   - RobotFace 进入 speaking 状态。
   - 播放结束后输出通道进入 finished / idle-like 状态。
