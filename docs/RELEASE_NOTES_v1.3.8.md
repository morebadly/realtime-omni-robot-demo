# Release Notes v1.3.8 — Provider Proxy Server Skeleton / Real Provider Handshake Sandbox

## 一、本轮目标

继 v1.3.7 “Provider Proxy Skeleton / Ephemeral Session Token” 之后，
v1.3.8 把 “未来真实 provider 必须经由 server-side proxy / Robot Gateway /
Device Runtime” 升级为可启动的本地 Mock HTTP skeleton + 可代码验证的
handshake 状态机，并引入 BigModel / DashScope 实时候选 placeholder。

它**不是**接真实通话，**不是**真实云端调用，**不是**真实 TTS：

- 不连真实 Realtime Omni Provider。
- 不打开真实 provider socket。
- 不上传真实麦克风 PCM。
- 不上传真实摄像头 JPEG。
- 不开启 realtime billing。
- 不读取 `BIGMODEL_API_KEY` / `DASHSCOPE_API_KEY` / `QWEN_API_KEY` /
  `OPENAI_API_KEY` / `MINIMAX_API_KEY` 等环境变量。
- 不发起任何 `fetch` / `WebSocket` 到真实 provider endpoint。
- 不把 `reply_text` 接到 TTS。
- 不让项目退化成 ASR → LLM → TTS。
- 不让真实 API key 进入前端 / Runtime config / descriptor / logs /
  Visible Context / localStorage / sessionStorage。
- 保留 `localdev_mock` fallback。

## 二、新增

| 文件 | 作用 |
| --- | --- |
| `src/runtime/providerProxyServerContract.js` | `omni.provider_proxy_server_contract.v1` / `omni.provider_proxy_health.v1` / `omni.provider_handshake_dry_run.v1` 描述 |
| `src/runtime/providerProxyHandshakeSandbox.js` | `omni.provider_proxy_handshake_sandbox.v1` 状态机（8 状态 / 6 事件，全部硬锁安全字段） |
| `scripts/provider-proxy-skeleton-server.mjs` | 本地 Mock HTTP skeleton；6 endpoints；无真实 fetch / WebSocket / 真实 env 读取 |
| `scripts/provider-proxy-server-smoke.mjs` | 24 项 v1.3.8 安全断言 |
| `docs/PROVIDER_PROXY_SERVER.md` | 设计与边界文档 |
| `docs/PROVIDER_PROXY_HANDSHAKE_SANDBOX.md` | 状态机文档 |
| `docs/RELEASE_NOTES_v1.3.8.md` | 本文 |
| `docs/UPDATE_GUIDE_v1.3.8.md` | 升级指南 |

## 三、扩展

| 文件 | 变化 |
| --- | --- |
| `src/runtime/providerCapabilities.js` | 新增 `bigmodel_glm_realtime_candidate` / `dashscope_qwen_omni_candidate`（`providerKind=real_cloud_candidate`，所有 supports* 锁为 false，`candidateOnly=true`）；`PROVIDER_KINDS` 新增 `real_cloud_candidate` |
| `src/runtime/providerSocketSandbox.js` | `isRealProviderKind` 加入 `real_cloud_candidate` |
| `src/runtime/providerProxyPolicy.js` | 新增 `evaluateProxyHandshakeDryRun` / `createProviderProxyHealth` / `createProviderProxyFallbackDecision`；保留 secret stripping 行为，并把候选 kind 视为 real-blocked |
| `src/runtime/providerAdapterContract.js` | `isRealOrCandidateKind` 把 real_cloud_candidate 一并视为 real-blocked，descriptor 新增 `real_cloud_candidate_blocked_by_default` reason |
| `src/runtime/useRuntimeCore.js` | 新增 `providerProxyServerContract` / `providerProxyHandshakeSandbox` / `providerProxyHandshakeDryRun` state；新增 `handleProviderProxyHandshakeDryRun` / `handleProviderProxyHandshakeFallback` |
| `src/components/OmniSessionPanel.jsx` | 新增 Proxy Server Skeleton + Handshake Sandbox 紧凑诊断卡 |
| `src/App.jsx` | 透传 3 个新 state |
| `package.json` | version → 1.3.8；新增 `proxy:provider:skeleton` 与 `test:provider-proxy-server` |
| `scripts/run-smoke-suite.mjs` | smoke 25 → 26 checks |
| `README.md` / `AGENTS.md` / `docs/ARCHITECTURE.md` / `docs/IMPLEMENTATION_PLAN.md` / `docs/LOCALDEV_ADAPTER_CONTRACT.md` / `docs/PROVIDER_ADAPTER_CONTRACT.md` / `docs/PROVIDER_SECRET_BOUNDARY.md` / `docs/PROVIDER_SOCKET_SANDBOX.md` / `docs/PROVIDER_PROXY_CONTRACT.md` | 更新到 v1.3.8 |

## 四、安全 invariants

代码 + 文档 + smoke 三重护栏：

- skeleton server 不读取真实 API key（`process.env[BIGMODEL_API_KEY]` 等
  永远不被引用，smoke 注入 canary 后任何响应都不包含原文）。
- skeleton server 不引用任何真实 provider hostname（smoke grep 验证）。
- skeleton server 不构造 `WebSocket`，不 `import 'ws'`，不调用 `fetch(`。
- 真实候选（`bigmodel_glm_realtime_candidate` /
  `dashscope_qwen_omni_candidate`）的 session 请求与 handshake 全部 denied，
  状态机停在 `provider_handshake_blocked`，sandbox 也是 `blocked`。
- 所有 token 仍是 `synthetic_only` / `dry_run_only`，safety 全锁 false。
- 任何含 `apiKey/secret/tokenRawValue/authorization` 的请求都会被剥离，
  返回信封不回显原文。
- `omni.reply_audio_frame.v1` 仍是语音输出主路径。
- `reply_text` 仍只是字幕 / 日志 / 调试。
- 没有 ASR → LLM → TTS 退化路径。
- `localdev_mock` fallback 在 contract / policy / sandbox / fallback
  endpoint 上一致保留。

## 五、验证

```bash
npm run verify
```

输出 26 checks 的 smoke suite 全部 PASS。

```bash
npm run proxy:provider:skeleton
# Provider proxy skeleton server listening on http://127.0.0.1:8011 (local Mock only; reads no real API key; calls no real provider).
```

## 六、为什么是 v1.3.8，不是 v1.4.0

- 没有引入新的 realtime 协议帧（仍是同一组 `omni.*.v1`）。
- 没有打开任何真实 provider socket。
- 没有真实云端调用，没有真实媒体上传，没有 billing。
- 没有改变 `omni.reply_audio_frame.v1` / `reply_text` 的语义。
- 没有改变 Runtime 输入路径。
- 仅在现有 Provider Proxy 合同层之下，新增：
  - 一个本地 Mock HTTP skeleton；
  - 一个 handshake dry-run 状态机；
  - 两个 real_cloud_candidate placeholder。
- UI 改动只是 OmniSessionPanel 两张诊断行。

v1.3 系列内向下兼容的稳定演进，主版本号不动。
