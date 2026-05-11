# Release Notes v1.3.7 — Provider Proxy Skeleton / Ephemeral Session Token

## 一、本轮目标

继 v1.3.6 “Real Socket Sandbox / Synthetic-only Provider Session” 之后，
v1.3.7 把 “未来真实 provider 必须由 server-side proxy / Robot Gateway /
Device Runtime 签发临时 token” 这件事，从口头规则升级到代码层的合同：

- 不连真实 Realtime Omni Provider。
- 不打开真实 provider socket。
- 不上传真实麦克风 PCM。
- 不上传真实摄像头 JPEG。
- 不开启 realtime billing。
- 不把 `reply_text` 接到 TTS。
- 不让项目退化成 ASR → LLM → TTS。
- 不让 API key 进入前端、Runtime config、descriptor、logs、Visible Context、
  localStorage、sessionStorage。
- 保留 `localdev_mock` fallback。
- UI 只小幅增加诊断卡片。

## 二、新增

| 文件 | 作用 |
| --- | --- |
| `src/runtime/providerProxyContract.js` | 定义 `omni.provider_proxy_contract.v1` |
| `src/runtime/providerEphemeralSession.js` | 定义 `omni.ephemeral_session_token.v1`（仅 synthetic / dry-run） |
| `src/runtime/providerProxyPolicy.js` | server-side proxy 决策的纯函数 |
| `scripts/provider-proxy-contract-smoke.mjs` | 20 项 v1.3.7 安全断言 |
| `docs/PROVIDER_PROXY_CONTRACT.md` | 设计与合同文档 |
| `docs/RELEASE_NOTES_v1.3.7.md` | 本文 |
| `docs/UPDATE_GUIDE_v1.3.7.md` | 升级指南 |

## 三、扩展

| 文件 | 变化 |
| --- | --- |
| `src/runtime/providerSocketSandbox.js` | 新增 `requiresEphemeralToken` / `acceptedTokenKinds` / `activeTokenId` 等字段；新增 `validateSocketSandboxToken` 与 `runSyntheticSocketSessionWithToken` |
| `src/runtime/providerAdapters/syntheticProviderAdapter.js` | 新增 `acceptEphemeralToken` / `openSyntheticSocketWithToken` / `getActiveEphemeralToken` / `getAcceptedTokenKinds` |
| `src/runtime/providerAdapterContract.js` | descriptor.socketSandbox 增加 token gating 字段；新增 `descriptor.providerProxy` 块 |
| `src/runtime/useRuntimeCore.js` | 增加 `providerProxyPolicy` / `providerProxyDecision` / `providerProxyDiagnostics`，及 `handleProviderProxyRequestEphemeralToken` / `handleProviderSocketSandboxRunSyntheticSessionWithToken` |
| `src/components/OmniSessionPanel.jsx` | 新增 Provider Proxy / Ephemeral Token 诊断卡片；扩展 Socket Sandbox 卡显示 token 字段 |
| `src/App.jsx` | 透传 `providerProxyDiagnostics` |
| `package.json` | version → 1.3.7；新增 `test:provider-proxy-contract` |
| `scripts/run-smoke-suite.mjs` | smoke 数量 24 → 25 |

## 四、安全 invariants

继续被代码 + 文档 + smoke 三重护栏：

- 没有真实 audio upload。
- 没有真实 camera upload。
- 没有 realtime billing。
- 没有真实 provider socket。
- 没有 `reply_text → TTS`。
- 没有 ASR → LLM → TTS 退化路径。
- `omni.reply_audio_frame.v1` 仍然是语音输出主路径。
- `localdev_mock` fallback 保留。
- 真实 API key 不进前端 / Runtime config / descriptor / logs /
  Visible Context / localStorage / sessionStorage。

## 五、验证

```bash
npm run verify
```

应输出 25 check 的 smoke suite 全部通过。

## 六、为什么是 v1.3.7，不是 v1.4.0

- 没有引入新的 realtime 协议帧。
- 没有打开真实 provider socket。
- 没有改变 reply_audio_frame / reply_text 的语义。
- 没有改变 Runtime 输入路径。
- 仅新增 “Provider Proxy / Ephemeral Token 合同层” 与 token 门控。
- UI 改动只增加一张诊断卡片。

因此这是 v1.3 系列内向下兼容的稳定演进。
