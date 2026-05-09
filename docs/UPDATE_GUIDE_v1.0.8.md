# Update Guide v1.0.8

## 更新步骤

Windows CMD：

```cmd
cd C:\Users\Administrator\Desktop\realtime-omni-robot-demo
taskkill /F /IM node.exe
rmdir /s /q node_modules
rmdir /s /q dist
del package-lock.json
npm install
npm run dev
```

如果提示找不到 `node_modules`、`dist` 或 `package-lock.json`，可以忽略。

## 测试 LocalDev 媒体通道

另开一个 CMD：

```cmd
cd C:\Users\Administrator\Desktop\realtime-omni-robot-demo
npm run mock:localdev
```

浏览器中：

1. 切换到 Local Dev 模式。
2. 点击“构建 Omni 输入包”。
3. 点击“发送到 LocalDev Adapter”，确认 WebSocket 保持连接。
4. 开启实时音频，观察 Omni Session 面板的 Audio Frame observed/sent。
5. 开启摄像头预览或手动抓取关键帧，观察 Camera Frame observed/sent。
6. 查看 Mock Server 控制台是否出现 `media_frame schema=...` 日志。

## 常见问题

### 只看到 observed，没有 sent

说明浏览器已经生成媒体帧，但还没有连接 LocalDev WebSocket。先点击“发送到 LocalDev Adapter”，让 Web 与 Mock Server 建立保持连接。

### Mock Server 只有 packet_schema，没有 media_frame

说明只发送了 `omni.input_packet.v1`，还没有开启麦克风或摄像头关键帧。
