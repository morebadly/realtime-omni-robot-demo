# Update Guide v1.3.7

## 1. 安装与运行

```bash
npm install
npm run dev
```

或者只验证：

```bash
npm run verify
```

`npm run verify` 期望 25 个 smoke checks 全部通过。

## 2. v1.3.7 加了什么

- 新增 server-side proxy 合同：`omni.provider_proxy_contract.v1`。
- 新增临时 token 描述：`omni.ephemeral_session_token.v1`。
- 新增 server-side proxy 决策纯函数（synthetic / dry-run）。
- 与 v1.3.6 的 Provider Socket Sandbox 互通：sandbox 需要 token 才能进入
  synthetic_ready 状态。
- Provider Adapter Contract descriptor 新增 `providerProxy` 块和
  `socketSandbox.requiresEphemeralToken` 字段。
- UI 在 Omni Session 调试视图增加一张 Provider Proxy / Ephemeral Token 诊断卡。

## 3. v1.3.7 仍然不允许

- 不上传真实麦克风 PCM。
- 不上传真实摄像头 JPEG。
- 不开启 realtime billing。
- 不打开真实 provider socket。
- 不让 `reply_text` 进入 TTS。
- 不允许 ASR → LLM → TTS 退化路径。
- 不允许真实 API key 进入前端、Runtime config、descriptor、logs、
  Visible Context、localStorage、sessionStorage。
- 不允许 MiniMax 或任何 text/TTS provider 接入主 realtime Omni 通道。
- 不允许破坏 `localdev_mock` fallback。

## 4. 新模块速览

### `src/runtime/providerProxyContract.js`
- `createProviderProxyContract()` — 默认合同对象。
- `validateProviderProxyContract(contract)` — 安全字段校验。
- `summarizeProviderProxyContract(contract)` — 简短摘要。
- 常量：`PROVIDER_PROXY_CONTRACT_SCHEMA`、
  `PROVIDER_PROXY_TOKEN_KINDS`、`PROVIDER_PROXY_DENIED_SCOPES`、
  `PROVIDER_PROXY_ALLOWED_SYNTHETIC_SCOPES`、
  `PROVIDER_PROXY_ALLOWED_DRY_RUN_SCOPES`、
  `PROVIDER_PROXY_DEFAULT_TTL_MS`。

### `src/runtime/providerEphemeralSession.js`
- `createEphemeralSessionToken(input)` — 仅 synthetic / dry-run。
- `validateEphemeralSessionToken(token)` — schema + 安全 + 过期校验。
- `isTokenActive(token)` — TTL 检查。
- `summarizeEphemeralToken(token)` / `describeTokenForUi(token)`。

### `src/runtime/providerProxyPolicy.js`
- `createDefaultProviderProxyPolicy()`
- `requestEphemeralProviderSession(input)`
- `evaluateProviderProxyRequest(request, policy)`
- `validateEphemeralSessionToken(token)`
- `summarizeProviderProxyDecision(decision)`
- `describeProxyForUi(policy, lastDecision)`

行为：
- `real_cloud` / `self_hosted` 默认 denied。
- `synthetic_test` / `localdev_mock` 可获 synthetic_only 或 dry_run_only token。
- 请求中的 secret-like 字段（`apiKey`、`secret`、`tokenRawValue`、
  `authorization`、`client_secret` 等）会被剥离，且决定信封不会回显原文。
- 请求带 `realAudioUpload` / `realCameraUpload` / `realtimeBilling` /
  `realProviderSocket` / `replyTextToTts` 时一律 denied。

### `src/runtime/providerSocketSandbox.js`（扩展）
- 新增字段：`requiresEphemeralToken`、`acceptedTokenKinds`、
  `activeTokenId`、`activeTokenKind`、`tokenAcceptedCount`、
  `tokenRejectedCount`、`lastTokenDecision`。
- 新增函数：
  - `validateSocketSandboxToken(state, token)`
  - `runSyntheticSocketSessionWithToken(prev, token, { providerId, providerKind })`
- 真实 provider 即使带 synthetic_only token 仍然只能停在 `blocked`。
- 没有 token 时 synthetic provider 也不会进入 `synthetic_ready`。

### `src/runtime/providerAdapters/syntheticProviderAdapter.js`（扩展）
- 新增方法：`acceptEphemeralToken`、`openSyntheticSocketWithToken`、
  `getActiveEphemeralToken`、`getAcceptedTokenKinds`。
- 关闭 socket 时 token 引用会被清理。

### `src/runtime/providerAdapterContract.js`（扩展）
- `descriptor.socketSandbox` 增加 `requiresEphemeralToken` 与
  `acceptedTokenKinds`。
- 新增 `descriptor.providerProxy` 块，内嵌
  `omni.provider_proxy_contract.v1` 描述。

### `src/runtime/useRuntimeCore.js`（扩展）
- 新增 state / memo：`providerProxyPolicy`、`providerProxyDecision`、
  `providerProxyDiagnostics`。
- 新增 actions：
  - `handleProviderProxyRequestEphemeralToken(overrides?)`
  - `handleProviderSocketSandboxRunSyntheticSessionWithToken()`

### `src/components/OmniSessionPanel.jsx`（扩展）
- Provider Socket Sandbox 卡新增 token 门信息（required /
  acceptedTokenKinds / activeTokenId）。
- 新增 Provider Proxy / Ephemeral Token 诊断卡片。

## 5. 新 smoke

```bash
npm run test:provider-proxy-contract
```

覆盖 20 项安全断言（详见 `docs/PROVIDER_PROXY_CONTRACT.md`）。

## 6. 全量验证

```bash
npm run verify
```

期望 25 个 smoke checks 全部通过。

## 7. 升级注意

- 升级到 v1.3.7 不会改变现有 UI 操作流程。
- 现有 v1.3.6 的 Synthetic Socket Sandbox 路径仍然可用，相容性保留。
- 若旧代码直接调用 `runSyntheticSocketSession`，行为不变。
- 新功能需要走 `runSyntheticSocketSessionWithToken` 或
  `adapter.openSyntheticSocketWithToken`。
