# Update Guide v1.3.6

## What Changed

v1.3.6 adds a synthetic-only Provider Socket Sandbox lifecycle and extends the synthetic provider adapter with explicit socket lifecycle methods. It is a Runtime/descriptor change only. There is no real cloud realtime, no real audio upload, no real camera upload, no realtime billing, and no `reply_text → TTS` path. The realtime voice output remains `omni.reply_audio_frame.v1` native audio frames.

## Commands

```bash
npm install
npm run verify
```

Run only the new smoke test:

```bash
npm run test:provider-socket-sandbox
```

The full safe smoke suite is now **24 checks** (`npm run test:smoke`).

## Why This Is Not "Real Realtime Call"

This release does not change the realtime call definition. The realtime voice path remains:

```text
user mic PCM / camera JPEG / runtime context / fact events
  -> Realtime Omni Provider
  -> omni.output_state.v1
  -> omni.reply_audio_frame.v1   <-- realtime voice output (native audio frames)
  -> omni.output_turn.v1         <-- reply_text is subtitle / log / debug only
  -> Web Audio / Robot Speaker plays reply_audio_frame
```

`reply_text` is never sent to `speechSynthesis`, MiniMax TTS, DashScope TTS, browser TTS, or any other TTS provider as part of the main realtime path. Providers that only support text + TTS cannot be registered as omni realtime providers.

## What Is New

- `omni.provider_socket_sandbox.v1` state machine with 9 states and 8 events. Real provider kinds are always routed to `blocked`.
- Synthetic provider adapter lifecycle methods: `createSyntheticSession`, `openSyntheticSocket`, `closeSyntheticSocket`, `emitSyntheticReady`, `emitSyntheticError`, `emitSyntheticFallback`, plus `onSocketLifecycle`, `onReady`, `onFallback` listeners.
- `providerAdapterDescriptor.socketSandbox` field with `socketSandboxAvailable`, `socketSandboxMode`, `canOpenSyntheticSocket`, `opensRealSocket`, `syntheticOnly`, `realMediaBlocked`, `billingStarted`, `replyAudioFrameNative`, `replyTextSubtitleOnly`, `replyTextToTts`, and `fallbackProviderId`.
- Runtime state `providerSocketSandbox` and actions to drive the synthetic lifecycle from UI / debug logs (no real socket is opened).
- Small Provider Socket Sandbox diagnostic card in `OmniSessionPanel`.

## Safety Boundary

- Real audio upload, real camera upload, realtime billing, real provider socket, and `reply_text → TTS` remain blocked.
- Real provider IDs (`dashscope_qwen_omni`, `custom_realtime_omni`) cannot transition out of `blocked` in the sandbox.
- `mergeProviderCapability` is still narrowing-only; widening or weakening safety is impossible.
- Synthetic-only path is required for contract tests and Runtime experiments.
- `localdev_mock` fallback remains required.
- API keys / secrets stay on server-side proxy / Robot Gateway / Device Runtime.

## Safety Notes

- ASR → LLM → TTS regression is explicitly forbidden by `guardrails.asrLlmTtsRegressionForbidden = true` in the descriptor.
- `cloudgenie.local_dev.media_ack.v1` remains diagnostics-only.
- `omni.audio_frame.v1` does not auto-interrupt; `omni.reply_audio_frame.v1` does not feed back as user input.
- `mergeProviderCapability` is narrowing-only; widening is impossible.
