# Release Notes v0.9

## 主题

v0.9 继续把项目从 Web Demo 推向 Runtime 平台：新增实时音频流面板、Network/Connection Manager、FramePolicyEngine，并把摄像头关键帧策略从组件内部移动到 Runtime。

## 新增

- `RealtimeAudioPanel`：浏览器麦克风模拟机器人麦克风，显示原始音频输入电平。
- `src/runtime/realtimeSession.js`：描述 LocalDev / Cloud / Offline 的实时音频路由。
- `ConnectionManagerPanel`：展示网络连接状态、延迟、丢包、信号和上传预算。
- `src/runtime/networkManager.js`：Network Profile、质量预设和 Connection Snapshot。
- `src/runtime/framePolicy.js`：统一计算关键帧频率、分辨率、JPEG 质量和上传策略。
- 网络质量模拟：稳定、拥塞、较差、断网。
- 自动降级策略：断网切离线宠物模式；网络差时进入音频优先和低频关键帧。

## 调整

- `CameraPreview` 改为读取 Runtime FramePolicy，不再在组件内部自己决定待机/说话/蜂窝/视觉问答策略。
- `VisibleContext` 增加实时音频路由、网络状态和 FramePolicy 透明展示。
- `RuntimeArchitecturePanel` 增加 RealtimeSession、ConnectionManager、FramePolicyEngine 模块说明。
- 版本号更新为 `0.9.0`。

## 仍然是 Mock / Demo 的部分

- 麦克风只是在浏览器中打开并显示输入电平，还没有真正连接 Qwen2.5-Omni。
- Network Manager 当前是模拟网络状态，还没有读取真实 eSIM / Wi‑Fi 状态。
- FramePolicyEngine 已集中到 Runtime，但关键帧上传仍未接真实云端。
