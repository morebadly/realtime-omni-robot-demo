# Update Guide v1.1.3

## 升级目标

把 v1.1.2 的 Mock interrupt / barge-in 控制升级为更清晰的 **Realtime Session State Machine**。

## 主要新增文件

```text
src/runtime/realtimeSessionState.js
docs/RELEASE_NOTES_v1.1.3.md
docs/UPDATE_GUIDE_v1.1.3.md
```

## 主要修改文件

```text
package.json
README.md
AGENTS.md
docs/ARCHITECTURE.md
docs/IMPLEMENTATION_PLAN.md
src/runtime/useRuntimeCore.js
src/components/OmniSessionPanel.jsx
src/components/VisibleContext.jsx
src/components/RealtimeAudioOutputPlayer.jsx
src/App.jsx
```

## 本地验证步骤

```bash
npm install
npm run build
```

运行 Mock Server：

```bash
npm run mock:localdev
```

另开一个终端运行 Web：

```bash
npm run dev
```

在 Web 中检查：

```text
1. 开启实时音频。
2. 构建 Omni 输入包。
3. 发送到 LocalDev Adapter。
4. 观察 Session State Machine 从 listening / model_thinking / model_speaking 变化。
5. 等 reply_audio_frame 流式播放。
6. 点击模拟用户插话 / Interrupt。
7. 确认状态进入 interrupted，输出队列清空，Mock Server 停止继续发送剩余音频帧。
```

## Git 提交建议

```bash
git status
git add .
git commit -m "feat: add realtime session state machine"
git tag v1.1.3
git push
git push origin v1.1.3
```

## 注意事项

v1.1.3 仍然不是：

```text
ASR → LLM → TTS
```

也不是自动 barge-in。自动打断必须等后续具备 VAD/AEC 或其他可靠判定后再做，否则容易让机器人自己的播放声音被麦克风采回，造成 Omni 自己打断自己。
