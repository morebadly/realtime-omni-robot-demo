# v1.4.3 Provider Gateway Execution Shell / Synthetic-only

v1.4.3 是 Provider Gateway Execution Shell / Synthetic-only。它不是接入真实 provider，不是真实通话，也不是真实 network handshake。

这个版本只做一件事：把未来真实 provider 调用的唯一执行入口固定为 server-side gateway / Robot Gateway / Device Runtime，并在当前版本保持 synthetic-only / no-network / manual-only。

## 边界

- 不打开真实 provider socket。
- 不调用真实 BigModel endpoint。
- 不调用真实 DashScope endpoint。
- 不上传 `omni.audio_frame.v1`。
- 不上传 `omni.camera_frame.v1`。
- 不启动 realtime billing。
- 不把 `reply_text` 接到 TTS。
- 不允许 ASR -> LLM -> TTS 回退。
- 不允许浏览器直连真实 provider。
- 不允许 verify / smoke 触发真实网络调用。

## 新增 Runtime 层

`src/runtime/providerGatewayExecutionShell.js` 定义 schema：

```text
omni.provider_gateway_execution_shell.v1
```

shell metadata 保持：

- `manualOnly=true`
- `serverSideOnly=true`
- `syntheticOnly=true`
- `noNetworkDefault=true`
- `browserForbidden=true`
- `fallbackProviderId=localdev_mock`
- `safety.networkCallAttempted=false`
- `safety.opensRealSocket=false`
- `safety.callsRealEndpoint=false`
- `safety.sendsAudio=false`
- `safety.sendsCamera=false`
- `safety.startsBilling=false`
- `safety.replyTextToTts=false`

`src/runtime/providerGatewayExecutionPolicy.js` 负责把危险请求 blocking 掉，包括 browser runtime、network、real socket、provider endpoint、audio upload、camera upload、billing、`reply_text -> TTS`、ASR -> LLM -> TTS fallback 和 real provider execution。

## Secret boundary

v1.4.2 的 secret boundary audit 继续适用：

- key 只能以 `keyPresent=true/false` boolean 形式出现。
- raw key 禁止输出。
- masked key 禁止输出。
- key prefix 禁止输出。
- key length 禁止输出。
- key hash 禁止输出。
- diagnostics 必须 redacted。

## Realtime voice path

本项目的语音方向仍然是实时 Omni 语音通话链路：

```text
Realtime Omni Provider
  -> omni.output_state.v1
  -> omni.reply_audio_frame.v1
  -> omni.output_turn.v1
  -> Web Audio / Robot Speaker streaming
```

`omni.reply_audio_frame.v1` 是实时语音输出主路径。`reply_text` 只能作为字幕、日志、调试和 Visible Context，不能接 TTS。

## Manual CLI

```bash
npm run test:provider-gateway-execution-shell
node scripts/provider-gateway-execution-shell.mjs
```

CLI 默认 disabled / blocked / no-network。它只输出 redacted JSON shell / decision，不读取或打印真实 provider key value。

## Fallback

所有 blocked / unknown / candidate-only 路径都必须保留：

```text
fallbackProviderId=localdev_mock
```
