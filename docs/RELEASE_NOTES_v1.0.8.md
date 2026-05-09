# Release Notes v1.0.8

v1.0.8 是 **音频帧 / 关键帧媒体通道预留版**。

这版不急着接真实 Qwen2.5-Omni，而是在 v1.0.7 稳定 LocalDev Roundtrip 的基础上，把真实实时 Omni 需要的媒体通道边界先打通：

```text
omni.input_packet.v1     低频上下文包：身份、权限、插件、网络、策略、事实事件
omni.audio_frame.v1      音频帧：后续承载 PCM / Opus chunk
omni.camera_frame.v1     关键帧：后续承载 JPEG / 视频帧 payload
media_ack                LocalDev Adapter 对媒体帧的确认
```

## 新增

- 新增 `src/runtime/omniMediaFrames.js`。
- `RealtimeAudioPanel` 在麦克风开启后会按低频节奏生成 `omni.audio_frame.v1` 元数据帧。
- `CameraPreview` 每次抓取关键帧时会生成 `omni.camera_frame.v1` 元数据帧。
- `LocalDevOmniClient` 新增 `sendMediaFrame()`，可在保持连接的 WebSocket 上发送媒体帧。
- `LocalDev Mock Server` 支持识别 `omni.audio_frame.v1` / `omni.camera_frame.v1`，并返回 `cloudgenie.local_dev.media_ack.v1`。
- Omni Session 面板新增媒体通道摘要：audio observed/sent、camera observed/sent、LocalDev ACK。
- Visible Context 面板新增媒体帧可见性说明。
- `omni.input_packet.v1` 增加媒体通道摘要。

## 保持不变

- Web 仍然只是控制台。
- Runtime 仍然是核心逻辑承载层。
- 不接真实邮件、真实空调、真实硬件、真实云 API。
- ASR 文本仍只用于字幕、日志、调试和插件关键词辅助。
- 摄像头关键帧不会在前端转换成情绪摘要。
- 触摸和 NFC 仍然只是事实事件。

## 测试方式

第一个终端：

```bash
npm run mock:localdev
```

第二个终端：

```bash
npm run dev
```

浏览器中先点击“发送到 LocalDev Adapter”建立保持连接的调试 WebSocket，然后开启麦克风或摄像头。Mock Server 控制台应能看到类似：

```text
media_frame schema=omni.audio_frame.v1 frame_id=aud_... kind=audio codec=pcm_float32_placeholder
media_frame schema=omni.camera_frame.v1 frame_id=cam_... kind=camera codec=image/jpeg
```
