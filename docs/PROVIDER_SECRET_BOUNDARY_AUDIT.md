# Provider Secret Boundary Audit v1.4.2

v1.4.2 是 secret boundary audit，不是真实 provider 接入。它只新增本地审计逻辑和 smoke 测试，用来检查 API key / token / credentials 是否可能进入输出面。

## Scope

新增模块：

- `src/runtime/providerSecretRedactionPolicy.js`
- `src/runtime/providerSecretBoundaryAudit.js`
- `scripts/provider-secret-boundary-audit-smoke.mjs`

这些模块只做本地对象审计，不读取真实 `BIGMODEL_API_KEY` / `DASHSCOPE_API_KEY` 值，不调用真实 endpoint，不打开真实 socket。

## Allowed Key Output

唯一允许的 key 状态输出是：

```json
{
  "keyPresent": true
}
```

`keyPresent` 必须是 boolean。以下输出全部禁止：

- raw key
- masked key
- key prefix
- key length
- key hash

审计结果也不能回显触发问题的值，只能输出 issue code 和 object path。

## Forbidden Sinks

真实 provider secret 不允许进入：

- frontend bundle
- Runtime config snapshot
- Visible Context
- Action Log
- logs / traces
- localStorage
- sessionStorage
- browser runtime
- provider descriptors
- preflight / probe plan output
- diagnostics output
- CLI output

## Safety Boundary

v1.4.2 仍然保持：

- no real provider integration
- no real handshake execution
- no real provider socket
- no audio upload
- no camera upload
- no billing
- no `reply_text -> TTS`
- no browser direct provider connection
- no real provider network in verify / smoke
- `localdev_mock` fallback required

`omni.reply_audio_frame.v1` 仍然是实时语音输出主路径。`reply_text` 只能用于字幕、日志、调试和 Visible Context。
