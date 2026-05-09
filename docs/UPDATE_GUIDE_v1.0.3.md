# Update Guide v1.0.3

## 更新方式

直接用本版本覆盖旧项目目录，或解压成新的 `realtime-omni-robot-demo` 目录。

Windows CMD：

```cmd
cd C:\Users\Administrator\Desktop\realtime-omni-robot-demo
npm install
npm run dev
```

## 验证 ToolIntentRouter

1. 打开 `http://localhost:5173/`。
2. 点击“构建 Omni 输入包”。
3. 点击“模拟 Omni 回合”。
4. 如果输入包里最近事实事件能匹配插件，`ToolIntentRouter` 会把工具意图路由到插件执行链。
5. 在行为日志和 Runtime Trace 中检查 `ToolIntentRouter`、`PluginManager`、`PermissionEngine` 和 `ToolEngine` 相关记录。

## 验证 Visual Frame Buffer 摘要

1. 开启摄像头预览。
2. 等待自动采集几帧，或点击“手动抓取关键帧”。
3. 点击“构建 Omni 输入包”。
4. 查看 `input.visual.selectedFrames` 和 `input.visual.bufferSummary`。

## 注意

v1.0.3 仍是 Demo / Mock Runtime：

- 不会发送真实邮件。
- 不会控制真实空调。
- 不会连接真实硬件。
- 不会调用真实云端 Omni API。
- 代码插件仍只能返回 action intents，不能直接访问硬件、DOM、文件系统或 secrets。
