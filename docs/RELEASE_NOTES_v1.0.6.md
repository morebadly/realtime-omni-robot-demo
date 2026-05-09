# Release Notes v1.0.6

v1.0.6 是 Codex 迁移准备版，重点是清理项目包、补充代理说明文件，并提供可运行的 LocalDev Omni Mock Server。

## 新增

- 新增 `AGENTS.md`，用于 Codex / 代码代理理解项目定位、Runtime 边界、插件权限链和禁止事项。
- 新增 `scripts/localdev-omni-mock-server.mjs`。
- 新增 `npm run mock:localdev`。
- 新增 `ws` 依赖，用于本地 WebSocket Mock 服务。
- 新增本地端到端验证链路：

```text
Web / OmniSessionPanel
  → LocalDevOmniClient
  → ws://localhost:8000/omni/realtime
  → LocalDev Mock Server
  → omni.output_turn.v1
  → Runtime 输出处理链
```

## 调整

- `package.json` 版本更新为 `1.0.6`。
- `.gitignore` 补齐 `node_modules/`、`dist/`、`.env*`、日志和 `.vite/`。
- README、架构文档和路线图统一更新到 v1.0.6。
- 发布包不再包含 `node_modules/` 和 `dist/`。

## 保持不变

- 仍然不接真实邮件、真实空调、真实硬件或真实云 API。
- 仍然不把项目改成 ASR-only 文本聊天机器人。
- LocalDev Mock Server 只验证协议链路，不代表真实 Qwen2.5-Omni 已接入。
- 真实音频 chunk、关键帧图片 payload、语音流回放和打断控制仍留给后续版本。
