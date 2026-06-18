# Release Notes v1.4.3

## Provider Gateway Execution Shell / Synthetic-only

v1.4.3 新增 Provider Gateway Execution Shell / Synthetic-only。这个版本不是接入真实 provider，也不执行真实通话；它只是把未来真实 provider 调用的唯一入口固定为 server-side gateway / Robot Gateway / Device Runtime。

## Added

- `src/runtime/providerGatewayExecutionShell.js`
  - 新增 `omni.provider_gateway_execution_shell.v1` shell metadata。
  - 保持 manual-only / server-side-only / synthetic-only / no-network / browser-forbidden。
- `src/runtime/providerGatewayExecutionPolicy.js`
  - 默认 disabled / blocked。
  - 拒绝 browser runtime、network、real socket、provider endpoint call、audio upload、camera upload、billing、`reply_text -> TTS`、ASR -> LLM -> TTS fallback、real provider execution。
- `scripts/provider-gateway-execution-shell.mjs`
  - 手动 CLI shell，默认 disabled / blocked / no-network。
  - 只输出 `keyPresent` boolean，不输出 raw / masked / prefix / length / hash key。
- `scripts/provider-gateway-execution-shell-smoke.mjs`
  - 覆盖 gateway shell 边界、candidate metadata、secret audit、realtime voice path 和静态 no-network 检查。

## Updated

- `package.json` version 更新到 `1.4.3`。
- 新增 `npm run test:provider-gateway-execution-shell`。
- safe smoke suite 从 30 checks 增加到 31 checks。
- README / AGENTS / architecture / implementation plan 增加 v1.4.3 边界说明。

## Still Out Of Scope

- 真实 Omni provider 接入。
- 真实 BigModel / DashScope endpoint 调用。
- 真实 network handshake。
- 真实 provider socket。
- audio upload。
- camera upload。
- billing。
- `reply_text -> TTS`。
- ASR -> LLM -> TTS。
- 浏览器直连 provider。

`omni.reply_audio_frame.v1` 仍然是实时语音输出主路径，`reply_text` 只能作为字幕、日志、调试和 Visible Context。`localdev_mock` fallback 保留。
