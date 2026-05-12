# Update Guide v1.3.8

## 1. 安装与运行

```bash
npm install
npm run dev
```

启动本地 Mock skeleton server：

```bash
npm run proxy:provider:skeleton
```

默认绑定 `127.0.0.1:8011`。可用环境变量覆盖：
`PROVIDER_PROXY_SKELETON_PORT` / `PROVIDER_PROXY_SKELETON_HOST`。

只验证（含 26 checks 的 smoke）：

```bash
npm run verify
```

## 2. v1.3.8 加了什么

- 本地 Mock HTTP skeleton：`scripts/provider-proxy-skeleton-server.mjs`。
- skeleton 描述：`src/runtime/providerProxyServerContract.js`。
- handshake 状态机：`src/runtime/providerProxyHandshakeSandbox.js`。
- BigModel / DashScope 实时候选 placeholder：
  `bigmodel_glm_realtime_candidate` / `dashscope_qwen_omni_candidate`，
  `providerKind=real_cloud_candidate`，全部锁 blocked。
- 在 `providerProxyPolicy` 增加：
  - `evaluateProxyHandshakeDryRun(request, policy?)`
  - `createProviderProxyHealth(input?)`
  - `createProviderProxyFallbackDecision(input?)`
- `useRuntimeCore` 新增 `providerProxyServerContract` /
  `providerProxyHandshakeSandbox` / `providerProxyHandshakeDryRun`，并暴露
  `actions.handleProviderProxyHandshakeDryRun` /
  `actions.handleProviderProxyHandshakeFallback`。
- `OmniSessionPanel` 在 Provider Proxy / Ephemeral Token 卡之外，增加：
  - Provider Proxy Server Skeleton 诊断行
  - Proxy Handshake Sandbox 诊断行
- 新增 smoke `scripts/provider-proxy-server-smoke.mjs`（24 项断言），
  纳入 `npm run verify` 和 `npm run test:smoke`（共 26 checks）。

## 3. v1.3.8 仍然不允许

- 不上传真实麦克风 PCM。
- 不上传真实摄像头 JPEG。
- 不开启 realtime billing。
- 不打开真实 provider socket。
- 不让 `reply_text` 进入 TTS。
- 不允许 ASR → LLM → TTS 退化路径。
- 不允许真实 API key 进入前端 / Runtime config / descriptor / logs /
  Visible Context / localStorage / sessionStorage。
- skeleton 不读取真实 provider 的 env key（`BIGMODEL_API_KEY` /
  `DASHSCOPE_API_KEY` / `OPENAI_API_KEY` / `MINIMAX_API_KEY` 等）。
- skeleton 不发起任何 `fetch` / `WebSocket` 到真实 provider endpoint。
- 不允许 MiniMax 或任何 text/TTS provider 接入主 realtime Omni 通道。
- 不允许破坏 `localdev_mock` fallback。

## 4. Endpoints

| Method | Path | Response schema |
| --- | --- | --- |
| GET | `/health` | `omni.provider_proxy_health.v1` |
| GET | `/provider-proxy/contract` | `omni.provider_proxy_server_contract.v1` |
| POST | `/provider-proxy/session/request` | `omni.provider_proxy_decision.v1` |
| POST | `/provider-proxy/session/validate` | `omni.provider_proxy_decision.v1` |
| POST | `/provider-proxy/handshake/dry-run` | `omni.provider_handshake_dry_run.v1` |
| POST | `/provider-proxy/fallback` | `omni.provider_proxy_fallback_decision.v1` |

所有响应均带头：

```
X-Provider-Proxy-Skeleton: local-mock-only
X-Reads-Real-Api-Key: false
X-Calls-Real-Provider: false
```

## 5. 新 smoke

```bash
npm run test:provider-proxy-server
```

覆盖 24 项安全断言（详见 `docs/PROVIDER_PROXY_SERVER.md` / 本文 §6）。

## 6. smoke 断言摘要

1. `/health` schema 正确，`productionReady=false`，`readsRealApiKeyEnv=false`。
2. `/provider-proxy/contract` 返回 `proxyRequired=true`。
3. `frontendCanHoldApiKey=false`。
4. `browserDirectProviderSocketAllowed=false`。
5. `localdev_mock` / `synthetic_test` 可获 synthetic_only token。
6. `dashscope_qwen_omni` / `custom_realtime_omni` denied。
7-10. handshake dry-run 不开真实 socket / 不上传 audio / 不上传 camera / 不开 billing。
11. 请求里的 secret 字段被剥离，响应不回显原文。
12. fallback 永远 localdev_mock。
13. `provider.realtime.open` denied。
14. `media.audio.upload` denied。
15. `media.camera.upload` denied。
16. `billing.start` denied。
17. `reply_text.tts` denied。
18. `omni.reply_audio_frame.v1` 仍是语音输出主路径。
19. ASR → LLM → TTS 退化路径不存在。
20. BigModel / DashScope 候选 capability 全部 blocked（session 请求 & dry-run 均 denied）。
21. skeleton 不读取真实 env key（设 canary 后任何响应不含原文）。
22. skeleton 源文件不含真实 provider hostname / `fetch(` / `new WebSocket(` / `import 'ws'`。
23. localdev_mock fallback 保留（contract / fallback endpoint / sandbox 三处一致）。
24. smoke 不需要真实 API key，全程跑在 `http://127.0.0.1` 本地回环。

## 7. 升级注意

- v1.3.7 既有 API 不变（`providerProxyContract` / `providerProxyPolicy` /
  `providerProxyHandshakeSandbox` 之外的旧函数行为保持）。
- 旧 socket sandbox 不受 handshake sandbox 影响，仍可 token-gated 走
  synthetic 生命周期。
- skeleton 仅用于开发期合约对齐；生产环境必须由独立 server-side proxy /
  Robot Gateway / Device Runtime 实现。
- 任何把 skeleton 改成真实 provider 接入的尝试都必须先：
  - 升级到下一个主要 v1.4.x；
  - 把 API key 与真实调用从前端彻底剥离；
  - 在 server-side 实现 token 签发、配额、风控；
  - 仍然保留 `omni.reply_audio_frame.v1` 主路径与 `reply_text` 不接 TTS。
