# Update Guide v1.4.3

## 版本定位

v1.4.3 是 Provider Gateway Execution Shell / Synthetic-only。它不是接入真实 provider，不是真实通话，不打开真实 socket，不上传 audio/camera，不启动 billing，也不把 `reply_text` 接到 TTS。

## 更新内容

1. 安装依赖保持不变：

```bash
npm install
```

2. 运行新增 smoke：

```bash
npm run test:provider-gateway-execution-shell
```

3. 运行完整验证：

```bash
npm run verify
```

safe smoke suite 现在是 31 checks。

## Secret boundary

v1.4.3 继续继承 v1.4.2 secret boundary audit：

- 只允许 `keyPresent` boolean。
- 不输出 raw key。
- 不输出 masked key。
- 不输出 key prefix。
- 不输出 key length。
- 不输出 key hash。
- diagnostics 必须 redacted。

## Gateway shell boundary

Provider Gateway Execution Shell 只产生 redacted metadata / blocked decision。未来真实 provider 调用必须从 server-side gateway / Robot Gateway / Device Runtime 发起，但 v1.4.3 不执行真实调用。

## Realtime voice path

`omni.reply_audio_frame.v1` 仍是实时语音输出主路径。`reply_text` 只能用于字幕、日志、调试和 Visible Context，不能接 TTS；项目不允许退化成 ASR -> LLM -> TTS。

## Fallback

所有 provider gateway shell 决策必须保留：

```text
fallbackProviderId=localdev_mock
```
