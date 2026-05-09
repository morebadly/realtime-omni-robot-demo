# Release Notes v1.1.3

## 版本定位

v1.1.3 是 **Realtime Session State Machine** 版本。

它不接真实 Omni API、不接真实 TTS、不接真实硬件，也不做自动 VAD/AEC 打断。它的目标是把 v1.1.1 的流式输出通道和 v1.1.2 的手动 interrupt/barge-in 控制，收敛到一个清晰的实时会话生命周期模型里。

## 新增内容

### 1. 新增 Runtime 会话状态机

新增：

```text
src/runtime/realtimeSessionState.js
```

用于统一管理：

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

状态机记录：

```text
sessionId
currentTurnId
currentRequestId
currentPacketId
input audio/camera observed 与 sent 计数
output reply_audio_frame received 与 played 计数
interrupt count
last transition
transition history
guardrails
```

### 2. 输入与输出边界更明确

v1.1.3 明确区分：

```text
Input Channel:
- omni.audio_frame.v1
- omni.camera_frame.v1
- fact events
- omni.input_packet.v1

Output Channel:
- omni.output_state.v1
- omni.output_turn.v1
- omni.reply_audio_frame.v1
- expression.update
```

`reply_text` 仍然只作为字幕、日志和调试，不进入 TTS 管线。

### 3. 播放时可继续监听，但不会自动打断

状态机把这个原则写成 guardrail：

```text
micCanRemainOpenDuringOutput = true
explicitInterruptOnly = true
audioFrameDoesNotAutoInterrupt = true
replyAudioFrameCannotTriggerInterrupt = true
```

也就是说，模型输出时，麦克风可以继续采集并发送 `omni.audio_frame.v1`；但音频帧不会自动触发 interrupt。只有显式 `omni.interrupt.v1` 才能打断当前输出。

### 4. UI 调试信息增强

`OmniSessionPanel` 和 `VisibleContext` 新增状态机展示：

```text
sessionId
state
currentTurnId
currentRequestId
input audio/camera sent/observed
output received/played
interrupt count
can_interrupt
should_keep_mic_open
last_transition
last_reason
```

`RealtimeAudioOutputPlayer` 也显示当前 Session State Machine 摘要，便于确认播放、打断和恢复监听不是独立散落状态。

## 不做什么

v1.1.3 不做：

```text
真实 Qwen2.5-Omni
真实云 API
真实 TTS
真实 ASR 主链路
自动 VAD 打断
AEC 回声消除
真实硬件扬声器/麦克风
真实邮件/空调/硬件控制
```

## 验收标准

```text
1. npm run build 通过。
2. Web 打开后能看到 Realtime Session State Machine。
3. 开启实时音频后状态进入 listening。
4. 发送 LocalDev 输入包后状态进入 model_thinking。
5. 收到 reply_audio_frame 后状态进入 model_speaking。
6. 播放期间输入 audio_frame 仍可继续发送，但不会自动触发 interrupt。
7. 点击模拟用户插话后状态进入 interrupted，播放队列清空。
8. Mock Server 停止继续推当前 turn 的剩余 reply_audio_frame。
9. UI 能显示 sessionId、turnId、输入/输出计数和最后状态转移原因。
```
