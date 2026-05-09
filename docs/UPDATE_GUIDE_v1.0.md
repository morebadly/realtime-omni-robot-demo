# Update Guide v1.0

## 从 v0.9 更新

1. 解压 `realtime-omni-robot-demo-v1.0-update.zip`。
2. 进入项目目录。
3. 重新安装依赖并启动。

Windows CMD：

```cmd
rmdir /s /q node_modules
rmdir /s /q dist
npm install
npm run dev
```

如果 `node_modules` 或 `dist` 不存在，CMD 会提示“系统找不到指定的文件”，可以忽略。

## 重点测试

1. 打开页面后确认顶部版本显示为 v1.0。
2. 点击左侧触摸/NFC/视觉问答模拟按钮。
3. 在中间区域找到 **Omni Session Bridge**。
4. 点击“构建 Omni 输入包”。
5. 查看 JSON 中是否包含：
   - `routing`
   - `identity`
   - `input.audio`
   - `input.visual`
   - `input.factEvents`
   - `runtimeContext.permissions`
   - `runtimeContext.enabledPlugins`
6. 点击“模拟 Omni 回合”。
7. 确认机器人说话文本、表情和 Runtime Trace 会更新。

## 注意事项

- v1.0 仍然不是真实模型接入。
- API Key 仍然不会持久化。
- Omni Session Bridge 目前用于协议调试和后续 Adapter 对接准备。
- 真实模型接入时，应把发送层放到 Runtime / Robot Gateway，不应把云端 API Key 暴露在 Web 前端。
