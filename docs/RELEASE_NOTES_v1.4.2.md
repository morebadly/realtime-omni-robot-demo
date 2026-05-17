# Release Notes v1.4.2

v1.4.2 是 Provider Secret Boundary Audit。它不是接入真实 provider，而是把 secret / API key / token / credentials 的输出边界做成可审计、可 smoke 的本地机制。

## Added

- `src/runtime/providerSecretRedactionPolicy.js`
  - 集中定义 secret-like 字段名、derived key output 字段、synthetic canary、forbidden sinks。
- `src/runtime/providerSecretBoundaryAudit.js`
  - 审计 descriptor-like、preflight/probe output-like、diagnostics-like、Runtime config-like、Visible Context-like、Action Log-like、CLI output-like、browser/storage sink payload。
- `scripts/provider-secret-boundary-audit-smoke.mjs`
  - 覆盖 raw / masked / prefix / length / hash key 输出禁止、`keyPresent` boolean-only、forbidden sinks、canary 不泄露、`localdev_mock` fallback、no-network 静态检查。
- `docs/PROVIDER_SECRET_BOUNDARY_AUDIT.md`

## Updated

- `package.json` version -> `1.4.2`
- 新增 `npm run test:provider-secret-boundary-audit`
- `scripts/run-smoke-suite.mjs` safe smoke suite 从 29 checks 变成 30 checks。
- README 顶部新增 v1.4.2 中文说明。

## Safety Boundary

仍然没有：

- 真实 provider 接入
- 真实 handshake execution
- 真实 provider socket
- audio upload
- camera upload
- billing
- `reply_text -> TTS`
- 浏览器直连真实 provider
- verify / smoke 真实网络调用

key 只能以 `keyPresent` boolean 出现。raw key、masked key、key prefix、key length、key hash 都不能输出。

`omni.reply_audio_frame.v1` 仍然是实时语音输出主路径，`localdev_mock` fallback 仍然保留。
