# Update Guide v1.0.7

## 更新目标

v1.0.7 让 LocalDev Adapter 调试链路更稳定，主要解决：

- Mock Server 日志中 `packet=unknown` 的问题。
- WebSocket 每次发送后立即断开，不像实时会话的问题。
- Web 页面缺少 LocalDev roundtrip 状态的问题。

## 本地更新步骤

Windows CMD：

```cmd
cd C:\Users\Administrator\Desktop\realtime-omni-robot-demo
taskkill /F /IM node.exe
rmdir /s /q node_modules
rmdir /s /q dist
del package-lock.json
npm config set registry https://registry.npmjs.org/
npm install
npm run dev
```

如果在国内访问官方源较慢，可以使用：

```cmd
npm config set registry https://registry.npmmirror.com
npm install
```

## 测试 LocalDev Mock Server

终端 1：

```cmd
cd C:\Users\Administrator\Desktop\realtime-omni-robot-demo
npm run mock:localdev
```

终端 2：

```cmd
cd C:\Users\Administrator\Desktop\realtime-omni-robot-demo
npm run dev
```

浏览器打开：

```text
http://localhost:5173
```

在页面里操作：

```text
构建 Omni 输入包 → 发送到 LocalDev Adapter
```

终端 1 应看到类似：

```text
LocalDev mock connected: 127.0.0.1
packet_schema=omni.input_packet.v1 packet_id=omni_xxx robot=robot_local_dev display_name=DemoBot 01 expression=idle intents=0 request=localdev_req_xxx
```

页面 Omni Session 面板应显示：

```text
LocalDev WebSocket 实时会话：已收到回合
request / packet / turn：localdev_req_xxx / omni_xxx / turn_xxx
```

## 注意事项

- v1.0.7 发布包不包含 `node_modules/`、`dist/` 和 `package-lock.json`。
- 本地首次 `npm install` 会自动生成新的 `package-lock.json`。
- 不要把旧的、带内部 registry 的 `package-lock.json` 提交到 GitHub / Codex。
- 这版仍不接真实 Qwen2.5-Omni，只验证 LocalDev Adapter 协议回环。
