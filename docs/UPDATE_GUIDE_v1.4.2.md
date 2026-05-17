# Update Guide v1.4.2

v1.4.2 增加 Provider Secret Boundary Audit。升级目标是先加固 secret 输出边界，不进入真实 provider 接入。

## What Changed

新增：

- `src/runtime/providerSecretRedactionPolicy.js`
- `src/runtime/providerSecretBoundaryAudit.js`
- `scripts/provider-secret-boundary-audit-smoke.mjs`
- `docs/PROVIDER_SECRET_BOUNDARY_AUDIT.md`

更新：

- `package.json` version 为 `1.4.2`
- 新增 `npm run test:provider-secret-boundary-audit`
- safe smoke suite 为 30 checks

## Verify

运行：

```bash
npm run test:provider-secret-boundary-audit
npm run build
npm run verify:quick
npm run verify
```

## Secret Boundary

只允许输出：

```json
{
  "keyPresent": false
}
```

禁止输出：

- raw key
- masked key
- key prefix
- key length
- key hash

禁止 secret sink：

- frontend bundle
- Runtime config snapshot
- Visible Context
- Action Log
- localStorage
- sessionStorage
- browser runtime

## Still Out Of Scope

v1.4.2 不做：

- 真实 provider 接入
- 真实 handshake execution
- 真实 provider socket
- audio upload
- camera upload
- billing
- `reply_text -> TTS`
- 浏览器直连真实 provider
- verify / smoke 真实网络调用

`omni.reply_audio_frame.v1` 仍然是实时语音输出主路径。`localdev_mock` fallback 必须保留。
