# Release Notes v0.6

## 版本目标

把 v0.4 从“Web Demo 壳”继续推进到“Runtime 逻辑更清晰、插件动作库更像真实产品、表情更接近 LOOI 风格”的版本。

## 主要改动

### 1. LOOI 风格表情优化

- 重写 `RobotFace.css` 的眼睛形状。
- 默认眼睛保持蓝绿色发光和紫蓝投影。
- 生气表情更强烈：红粉光效、怒气符号、斜切眼、硬质嘴型。
- 傲娇表情不再横向拉扁：左右眼分别设置 clip-path，不用 `scaleX(-1)` 镜像拉伸。

### 2. 插件多动作编排

- `PluginCenter` 支持动作序列。
- 可以加入动作、上移、下移、移除。
- 默认插件已改成组合动作。

示例：

```text
摸头 → 开心表情 + 说一句话 + 摇尾巴
NFC 学习卡 → 切换学习助手 + thinking 表情 + 说一句话
```

### 3. 工具入口收敛

工具不再作为独立用户入口。当前动作库包括：

- 表情切换
- 机器人说话
- 机器人动作
- 角色切换
- Mock 空调
- Mock 邮件草稿

### 4. Runtime 文件新增

```text
src/runtime/actionLibrary.js
src/runtime/expressionEngine.js
src/runtime/modelAdapters.js
src/runtime/pluginEngine.js
```

这些文件把原本散落在 `App.jsx` 中的核心逻辑迁出，后续方便接入真实 Runtime。

### 5. 输入策略修正

- 原始音频流直接给 Omni。
- 摄像头关键帧直接给 Omni。
- 触摸和 NFC 是事实事件，不做情绪判断。
- ASR 文本只用于字幕、日志、调试、插件关键词辅助。

## 验证记录

- 已用 TypeScript 编译器做 JSX/JS 语法检查：通过。
- 当前上传包里的 `node_modules` 来自旧环境，Linux 容器中缺少 Vite/Rolldown native optional dependency，因此没有依赖旧 `node_modules` 完成 `npm run build`。建议在本地删除 `node_modules` 后重新 `npm install`。
