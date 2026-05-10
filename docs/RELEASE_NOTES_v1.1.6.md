# Release Notes v1.1.6

## 版本定位

v1.1.6 是项目稳定性整理版。它不新增真实模型能力，不接真实云 API、不接真实硬件、不接真实 TTS，而是把 v1.1.5 之后的 Codex / LocalDev Adapter 改动沉淀成更容易维护的脚本、文档和版本检查流程。

## 新增内容

- `package.json` 版本提升到 `1.1.6`。
- 新增 `npm run verify`：执行构建和当前安全 smoke suite。
- 新增 `npm run verify:quick`：执行构建、版本一致性、readiness 和 LocalDev preflight 快速检查。
- 新增 `npm run clean`：清理本地生成物，方便重新打包或迁移。
- 新增 `npm run test:smoke`：统一运行当前安全 smoke tests。
- 新增 `npm run test:version-doctor`：检查 package、README、AGENTS 和核心文档版本一致性。
- 新增 `scripts/run-smoke-suite.mjs`。
- 新增 `scripts/version-doctor.mjs`。
- 新增 `scripts/clean-local-artifacts.mjs`。
- 新增 `docs/MAINTENANCE.md`。

## 保持不变

- v1.1.x 仍是安全 Mock Demo。
- `reply_text` 仍只用于字幕、日志和调试，不进入 TTS 管线。
- `omni.reply_audio_frame.v1` 仍是 Omni 输出媒体帧语义。
- `omni.interrupt.v1` 仍是显式手动 barge-in 控制事件。
- LocalDev Qwen / DashScope 相关脚本仍是配置、health check、transport slot 或 contract boundary，不代表默认启用真实推理。

## 已验证

- `npm run build`
- `npm run test:smoke`
- `npm run verify`
