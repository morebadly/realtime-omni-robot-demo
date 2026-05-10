# Update Guide v1.0.6

## 1. 清理旧本地依赖

Windows CMD：

```cmd
rmdir /s /q node_modules
rmdir /s /q dist
```

如果提示找不到文件夹，可以忽略。

## 2. 安装依赖

```cmd
npm install
```

v1.0.6 新增了 `ws`，用于本地 LocalDev Omni Mock Server。

## 3. 启动 Web Demo

```cmd
npm run dev
```

浏览器打开：

```text
http://localhost:5173/
```

## 4. 测试 LocalDev Mock Server

另开一个 CMD 窗口，进入同一个项目目录：

```cmd
cd C:\Users\Administrator\Desktop\realtime-omni-robot-demo
npm run mock:localdev
```

默认监听：

```text
ws://127.0.0.1:8000/omni/realtime
```

然后在 Web 页面里：

1. 保持运行模式为 Local Dev。
2. 打开 Omni Session 面板。
3. 点击“构建 Omni 输入包”。
4. 点击“发送到 LocalDev Adapter”。

成功后会看到 LocalDev Mock 返回 `omni.output_turn.v1`，并继续走表情、ToolIntentRouter、插件权限和 Mock Tool Engine 链路。

## 5. Codex / GitHub 注意事项

不要提交：

```text
node_modules/
dist/
.env
.env.local
*.log
```

建议先把项目推到 GitHub，再让 Codex 阅读：

```text
AGENTS.md
README.md
docs/ARCHITECTURE.md
docs/IMPLEMENTATION_PLAN.md
src/runtime/*
src/components/*
```
