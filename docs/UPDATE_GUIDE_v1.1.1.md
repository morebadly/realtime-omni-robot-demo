# Update Guide v1.1.1

## 更新目标

把 v1.1.0 的输入媒体帧能力升级为 v1.1.1 的 **Mock Realtime Omni 双向媒体通道**。

v1.1.1 的核心不是 TTS，而是：

```text
同一个 LocalDev WebSocket realtime session
输入：omni.input_packet.v1 / omni.audio_frame.v1 / omni.camera_frame.v1
输出：omni.output_state.v1 / omni.reply_audio_frame.v1 / omni.output_turn.v1
```

## 从 v1.1.0 更新到 v1.1.1

1. 替换或新增以下 Runtime 文件：

```text
src/runtime/omniOutputFrames.js
src/runtime/realtimeOutputChannel.js
src/runtime/localDevOmniClient.js
src/runtime/useRuntimeCore.js
```

2. 替换或新增以下 UI 文件：

```text
src/components/RealtimeAudioOutputPlayer.jsx
src/components/OmniSessionPanel.jsx
src/components/VisibleContext.jsx
src/App.jsx
src/styles/app.css
```

3. 替换 LocalDev Mock Server：

```text
scripts/localdev-omni-mock-server.mjs
```

4. 更新版本与文档：

```text
package.json
README.md
AGENTS.md
docs/ARCHITECTURE.md
docs/IMPLEMENTATION_PLAN.md
docs/RELEASE_NOTES_v1.1.1.md
docs/UPDATE_GUIDE_v1.1.1.md
```

## 运行方式

```bash
npm install
npm run mock:localdev
npm run dev
```

在 Web 中点击“发送到 LocalDev Adapter”。如果浏览器允许播放音频，应该能听到 Mock Server 返回的短促音频分片，同时 UI 显示：

- `omni.output_state.v1`
- `omni.reply_audio_frame.v1`
- received / played / queued frame 统计
- RobotFace speaking 状态

## 注意事项

- 不要把 `reply_text` 接到浏览器 SpeechSynthesis 或任何 TTS 服务。
- 不要把输出通道塞进输入 `mediaChannels`。
- `omniMediaFrames.js` 负责 Web/Robot -> Omni。
- `realtimeOutputChannel.js` 负责 Omni -> Web/Robot。
- 当前输出音频是 Mock PCM Float32 frame，只验证 realtime 通讯形态，不代表真实模型音色。
