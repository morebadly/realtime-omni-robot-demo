# Provider Proxy Skeleton / Ephemeral Session Token (v1.3.7, extended in v1.3.8)

## v1.3.8 Addendum

v1.3.8 adds an actually-runnable local Mock skeleton (`scripts/provider-proxy-skeleton-server.mjs`) and a pure handshake dry-run state machine (`src/runtime/providerProxyHandshakeSandbox.js`). Both are local-only. Neither holds a real API key, contacts a real provider, opens a real socket, uploads real media, starts billing, or runs TTS. See `docs/PROVIDER_PROXY_SERVER.md` and `docs/PROVIDER_PROXY_HANDSHAKE_SANDBOX.md`.

BigModel and DashScope realtime candidates (`bigmodel_glm_realtime_candidate`, `dashscope_qwen_omni_candidate`) are registered as capability placeholders with `providerKind='real_cloud_candidate'` and `candidateOnly=true`. They are always blocked by the policy, by the socket sandbox, and by the handshake sandbox. No real key is read; no real endpoint is contacted.


v1.3.7 把 “未来真实 provider 必须由 server-side proxy / Robot Gateway / Device
Runtime 出 token” 这件事，从口头规则升级到可代码验证的安全合同层。

它不是接真实云端实时通话，不是真实通话，不是真实媒体上传，不是真实计费。
它只是描述：当未来要打开真实 Realtime Omni Provider Socket 时，必须遵循什么
样的边界。

## 1. 实时通话定义（不变）

```
用户麦克风 PCM / 摄像头 JPEG / Runtime 上下文 / 事实事件
  -> Realtime Omni Provider
  -> omni.output_state.v1
  -> omni.reply_audio_frame.v1
  -> omni.output_turn.v1
  -> Web Audio / Robot Speaker 流式播放 reply_audio_frame
```

- `omni.reply_audio_frame.v1` 是语音输出主路径。
- `reply_text` 只是字幕 / 日志 / 调试 / Visible Context。
- `reply_text` 绝对不能作为 TTS 输入。
- 项目不允许退化成 ASR → LLM → TTS。

## 2. v1.3.7 的边界

未来真实 provider 调用必须：

1. **不能**让前端直接持有真实 API key。
2. **不能**让前端直接打开真实 provider socket。
3. 必须由 server-side proxy / Robot Gateway / Device Runtime 持有 API key。
4. server-side 根据权限 / 预算 / session policy 决定是否签发临时 token。
5. token 只能是 `synthetic_only` 或 `dry_run_only`。
6. token 永远不能解锁真实 audio upload、camera upload、realtime billing、
   real provider socket、`reply_text → TTS`。
7. 任何失败必须 fallback 到 `localdev_mock`。

v1.3.7 仍然全面禁止：
- 真实 audio upload；
- 真实 camera upload；
- realtime billing；
- 真实 provider socket；
- `reply_text → TTS`；
- 任何把项目改回 ASR → LLM → TTS 退化路径的设计。

## 3. 新增 Schema

| Schema | 文件 | 含义 |
| --- | --- | --- |
| `omni.provider_proxy_contract.v1` | `src/runtime/providerProxyContract.js` | server-side proxy 合同描述 |
| `omni.provider_proxy_request.v1` | `src/runtime/providerProxyPolicy.js` | Web Console → proxy 受限请求 |
| `omni.provider_proxy_decision.v1` | `src/runtime/providerProxyPolicy.js` | proxy → 客户端的决定信封 |
| `omni.ephemeral_session_token.v1` | `src/runtime/providerEphemeralSession.js` | 仅 synthetic / dry-run 的临时 token 描述 |

## 4. Provider Proxy Contract 字段

```json
{
  "schema": "omni.provider_proxy_contract.v1",
  "proxyRequired": true,
  "frontendCanHoldApiKey": false,
  "browserDirectProviderSocketAllowed": false,
  "robotGatewayRecommended": true,
  "deviceRuntimeRecommended": true,
  "serverSideSecretRequired": true,
  "defaultMode": "blocked",
  "fallbackProviderId": "localdev_mock",
  "supportedTokenKinds": ["synthetic_only", "dry_run_only"],
  "realMediaUploadAllowed": false,
  "realtimeBillingAllowed": false,
  "replyTextToTts": false,
  "replyAudioFrameNative": true,
  "deniedScopes": [
    "provider.realtime.open",
    "media.audio.upload",
    "media.camera.upload",
    "billing.start",
    "reply_text.tts"
  ]
}
```

`validateProviderProxyContract()` 会确保以上字段在未来不会被悄悄放宽。

## 5. Ephemeral Session Token 字段

```json
{
  "schema": "omni.ephemeral_session_token.v1",
  "tokenId": "eph_sess_xxx",
  "tokenKind": "synthetic_only",
  "providerId": "synthetic_test",
  "robotId": "r_xxx",
  "sessionId": "omni_xxx",
  "issuedAt": 1234567890,
  "expiresAt": 1234568190,
  "ttlMs": 300000,
  "scope": [
    "provider.synthetic.open",
    "provider.synthetic.ready",
    "provider.synthetic.close"
  ],
  "deniedScopes": [
    "provider.realtime.open",
    "media.audio.upload",
    "media.camera.upload",
    "billing.start",
    "reply_text.tts"
  ],
  "safety": {
    "opensRealSocket": false,
    "canSendRealAudio": false,
    "canSendRealCamera": false,
    "canStartBillingSession": false,
    "replyTextToTts": false,
    "sentToProvider": false,
    "uploaded": false,
    "persisted": false
  },
  "fallbackProviderId": "localdev_mock"
}
```

重要约束：
- token 没有任何 “真实 provider 可用” 的字段。
- token 永远不会被发送给真实 provider（`sentToProvider=false`）。
- token 不写入任何持久化存储（`persisted=false`）。
- token 不会进入前端 localStorage / sessionStorage / cookie。
- token 不能让 `real_cloud` / `self_hosted` provider 升级到 ready 状态。

## 6. Provider Proxy Policy

`src/runtime/providerProxyPolicy.js` 提供纯函数：

- `createDefaultProviderProxyPolicy()`
- `requestEphemeralProviderSession(input)` / `evaluateProviderProxyRequest(request, policy)`
- `validateEphemeralSessionToken(token)`
- `summarizeProviderProxyDecision(decision)`
- `describeProxyForUi(policy, lastDecision)`

策略行为：

| 请求条件 | 决定 |
| --- | --- |
| `providerId` 是 `real_cloud` 或 `self_hosted` | `denied`（默认） |
| 请求 `realAudioUpload=true` | `denied` |
| 请求 `realCameraUpload=true` | `denied` |
| 请求 `realtimeBilling=true` | `denied` |
| 请求 `realProviderSocket=true` | `denied` |
| 请求 `replyTextToTts=true` | `denied` |
| `synthetic_test` / `localdev_mock` 申请 `synthetic_only` | `granted`，返回 synthetic_only token descriptor |
| `synthetic_test` / `localdev_mock` 申请 `dry_run_only` | `granted`，返回 dry_run_only token descriptor |

任何 secret-like 字段（`apiKey` / `secret` / `tokenRawValue` /
`authorization` / `client_secret` 等）都会在评估前被剥离，决定信封会包含
`secretStripped=true` 与 `strippedFields` 列表，但**绝不**回显 secret 原文。

## 7. 与 v1.3.6 Socket Sandbox 的连接

`providerSocketSandbox.js` 在 v1.3.7 新增字段：

- `requiresEphemeralToken: true`
- `acceptedTokenKinds: ['synthetic_only']`
- `activeTokenId` / `activeTokenKind`
- `tokenAcceptedCount` / `tokenRejectedCount`
- `lastTokenDecision`

并新增两个工具：

- `validateSocketSandboxToken(state, token)`：纯函数，校验 token 是否可被
  当前 sandbox 接受。
- `runSyntheticSocketSessionWithToken(prev, token, { providerId, providerKind })`：
  在 token 校验通过后才推进 synthetic 生命周期；
  - 没有 token 时只能停在 `requested`，不进入 `synthetic_ready`；
  - `real_cloud` / `self_hosted` 即使带 token 也只会到 `blocked`。

`syntheticProviderAdapter.js` 新增：

- `acceptEphemeralToken(token)` — 校验并保存 token；
- `openSyntheticSocketWithToken(token)` — 等价于 accept + open；
- `getActiveEphemeralToken()` / `getAcceptedTokenKinds()`。

`providerAdapterContract.js` 在 `descriptor.socketSandbox` 里增加：

- `requiresEphemeralToken: true`
- `acceptedTokenKinds: ['synthetic_only']`

并新增 `descriptor.providerProxy`：

```json
{
  "schema": "omni.provider_proxy_contract.v1",
  "proxyRequired": true,
  "frontendCanHoldApiKey": false,
  "browserDirectProviderSocketAllowed": false,
  "serverSideSecretRequired": true,
  "supportedTokenKinds": ["synthetic_only", "dry_run_only"],
  "realMediaUploadAllowed": false,
  "realtimeBillingAllowed": false,
  "replyTextToTts": false,
  "replyAudioFrameNative": true,
  "fallbackProviderId": "localdev_mock"
}
```

## 8. UI 诊断（小幅展示）

`OmniSessionPanel` 在 Provider Adapter Contract / Provider Socket Sandbox
卡片旁，增加一个紧凑的 Provider Proxy / Ephemeral Token 诊断卡：

- `proxy=required`
- `direct_socket=blocked`
- `frontend_api_key=forbidden`
- `server_side_secret=required`
- `tokens=synthetic_only|dry_run_only`
- `ttl=300s`
- `real_media=blocked`
- `billing=blocked`
- `reply_text→TTS=blocked`
- `fallback=localdev_mock`
- 最近一次决策摘要（`granted/synthetic_only` 或 `denied + 原因`）

## 9. smoke

新增 `scripts/provider-proxy-contract-smoke.mjs`，覆盖 20 项安全断言：

1. Provider Proxy Contract 存在，schema=`omni.provider_proxy_contract.v1`。
2. `frontendCanHoldApiKey=false`。
3. `browserDirectProviderSocketAllowed=false`。
4. `serverSideSecretRequired=true`。
5. `synthetic_test` / `localdev_mock` 可获得 `synthetic_only` token。
6. `real_cloud` / `self_hosted` 默认 denied。
7. token scope 只允许 `provider.synthetic.*` 或 `provider.dry_run.*`。
8. token `deniedScopes` 包含 realtime.open / audio.upload / camera.upload /
   billing.start / reply_text.tts。
9. token `safety.*` 所有字段必须 `false`。
10. 请求里出现 `apiKey` / `secret` / `tokenRawValue` 时返回信封不能包含 secret 原文。
11. 所有决定的 `fallbackProviderId` 必须是 `localdev_mock`。
12. 真实 audio upload 请求必须 denied。
13. 真实 camera upload 请求必须 denied。
14. realtime billing 请求必须 denied。
15. real provider socket 请求必须 denied。
16. `reply_text → TTS` 请求必须 denied。
17. synthetic socket sandbox 在拿到 `synthetic_only` token 时才能推进
   synthetic 生命周期；没有 token 时不能进入 ready。
18. synthetic token 不能让 `real_cloud` provider 打开 socket。
19. `omni.reply_audio_frame.v1` 仍然是语音输出主路径。
20. ASR → LLM → TTS 退化路径不存在。

运行方式：

```bash
npm run test:provider-proxy-contract
```

或作为完整 smoke suite（v1.3.7 共 25 checks）：

```bash
npm run test:smoke
```

## 10. 路线图前瞻

未来若要真的接通真实 Realtime Omni Provider：

- 必须先在 server-side（Robot Gateway / Device Runtime / 后端微服务）实现：
  - 真实 API key 持有；
  - 真实 provider socket 打开 / 维持；
  - 真实计费、配额、风控；
  - 短期 token 签发与撤销；
- 然后才在 v1.4.x 引入新 schema（例如 `omni.realtime_session_token.v1`），
  并继续保留：
  - `omni.reply_audio_frame.v1` 是语音输出主路径；
  - `reply_text` 不接 TTS；
  - `localdev_mock` fallback；
  - 前端绝不持有 API key。
