# v0.8 更新指南

## Windows CMD

进入项目目录后执行：

```cmd
rmdir /s /q node_modules
rmdir /s /q dist
npm install
npm run dev
```

如果 `rmdir` 提示找不到目录，可以忽略。

## macOS / Linux

```bash
rm -rf node_modules dist
npm install
npm run dev
```

## 验证点

1. 页面左上角应显示 `Realtime Omni Robot Demo v0.8`。
2. 左侧应出现“机器人身份档案”。
3. 中间应出现“Runtime 架构进度 / Runtime Trace”。
4. 模型接入中心保存配置后刷新页面，Provider / Endpoint / Model ID 会保留；API Key 不会被持久化。
5. 插件卡片里应出现 manifest 预览。
6. 代码插件如果返回未声明权限的动作，会被 Runtime Guard 阻止。

## 注意

v0.8 仍然是前端 Demo + Mock Runtime，不是真实本地 Qwen2.5-Omni 接入版。下一步应开始做 LocalDevOmniAdapter 的真实连接与音频流通道。
