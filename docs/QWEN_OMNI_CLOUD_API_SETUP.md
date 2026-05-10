# Qwen-Omni Cloud Realtime API Setup

This project can use a cloud Qwen-Omni realtime API through a provider adapter without changing the Web Runtime into text chat.

The cloud path must preserve the same runtime contract:

```text
omni.input_packet.v1
omni.audio_frame.v1
omni.camera_frame.v1
omni.interrupt.v1
  -> provider adapter
  -> cloud Qwen-Omni realtime session
  -> omni.output_state.v1
  -> omni.reply_audio_frame.v1
  -> omni.output_turn.v1
```

`reply_text` remains subtitle/log/debug text. It is not the source of speech playback.

## DashScope / Alibaba Cloud Model Studio

Known realtime WebSocket endpoints:

```text
Beijing:   wss://dashscope.aliyuncs.com/api-ws/v1/realtime
Singapore: wss://dashscope-intl.aliyuncs.com/api-ws/v1/realtime
```

The native WebSocket URL appends the model as a query parameter:

```text
wss://dashscope.aliyuncs.com/api-ws/v1/realtime?model=qwen3.5-omni-flash-realtime
```

Known realtime model ids:

```text
qwen3.5-omni-plus-realtime
qwen3.5-omni-flash-realtime
qwen3-omni-flash-realtime
```

The shared config helper lives in:

```text
scripts/dashscope-omni-realtime-config.mjs
```

Environment variables:

```powershell
$env:DASHSCOPE_API_KEY='sk-...'
$env:DASHSCOPE_OMNI_MODEL='qwen3.5-omni-flash-realtime'
$env:DASHSCOPE_OMNI_REGION='beijing'
```

Optional explicit endpoint override:

```powershell
$env:DASHSCOPE_OMNI_ENDPOINT='wss://dashscope.aliyuncs.com/api-ws/v1/realtime'
```

Validate local config shape without opening a cloud session:

```bash
npm run test:dashscope-omni-config
```

After setting `DASHSCOPE_API_KEY`, test only the WebSocket connection:

```bash
npm run health:dashscope-omni
```

This health check opens and closes the realtime WebSocket. It does not send microphone audio, camera frames, plugin intents, or secrets beyond the required bearer token.

## Implementation Notes

The first cloud adapter should be added as a provider client behind the same interface used by LocalDev:

```js
{
  observeMediaFrame(frame, requestId) {},
  getMediaSnapshot() {},
  async runInference({ packet, requestId }) {},
  createReplyAudioPlan({ turn, packet, requestId }) {},
  sendInterrupt(interrupt) {}
}
```

For realtime cloud mode, prefer streaming native model audio as `omni.reply_audio_frame.v1` while the structured output turn is still pending.

Do not connect cloud APIs directly from UI components. Keep cloud credentials and provider-specific message formats behind the adapter/client layer.
