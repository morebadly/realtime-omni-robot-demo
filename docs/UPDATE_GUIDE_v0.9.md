# Update Guide v0.9

## Windows CMD

进入项目目录后运行：

```cmd
rmdir /s /q node_modules
rmdir /s /q dist
npm install
npm run dev
```

如果 `node_modules` 或 `dist` 不存在，CMD 会提示“系统找不到指定的文件”，可以忽略。

## 本次重点验证

1. 打开页面后确认左上角版本显示 `v0.9`。
2. 在实时音频面板点击“开启实时音频”，浏览器会请求麦克风权限。
3. 说话时音频电平条应该变化。
4. 在 Network / Connection Manager 中切换“稳定 / 拥塞 / 较差 / 断网”。
5. 点击“执行自动降级策略”：
   - 断网时应切到 Offline Pet。
   - 较差网络时应进入音频优先和低频关键帧策略。
6. 切换 Wi‑Fi 云端 / eSIM 云端模式后观察 FramePolicy 文案变化。
7. 打开摄像头预览后，关键帧策略应由 Runtime FramePolicyEngine 控制。

## 注意

v0.9 仍不连接真实 Omni 服务。它验证的是 Runtime 路由、权限、网络降级和关键帧策略的工程骨架。
