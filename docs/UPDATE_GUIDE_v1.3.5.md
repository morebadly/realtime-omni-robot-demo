# Update Guide v1.3.5

## What Changed

v1.3.5 adds a Provider Adapter Contract surface, a capability map, a synthetic-only provider adapter stub, and a secret boundary document. It is a Runtime/descriptor change only. There is no real cloud realtime, no real audio upload, no real camera upload, no realtime billing, and no `reply_text -> TTS` path.

## Commands

```bash
npm install
npm run verify
```

Run only the new smoke test:

```bash
npm run test:provider-adapter-contract
```

The full safe smoke suite is now **23 checks** (`npm run test:smoke`).

## What Is New

- `omni.provider_adapter.v1` descriptor produced by `createProviderAdapterDescriptor(...)`.
- 10 required contract methods: `createSession`, `closeSession`, `sendInputPacket`, `sendAudioFrame`, `sendCameraFrame`, `sendInterrupt`, `onOutputState`, `onOutputTurn`, `onReplyAudioFrame`, `onError`.
- Built-in capability map for `localdev_mock`, `dashscope_qwen_omni`, `custom_realtime_omni`, `synthetic_test`, and `offline_pet_engine`.
- Synthetic-only provider adapter that lets contract tests exercise the surface without any real provider traffic.
- A small diagnostic card in `OmniSessionPanel`: provider id / kind / safety mode, plus locked safety booleans and secret boundary state.

## Safety Boundary

- `canOpenRealtimeSocket`, `canSendRealAudio`, `canSendRealCamera`, `canStartBillingSession`, `replyTextToTts` are all hard-locked to `false`.
- Real provider IDs declare `requiresServerSideSecret=true`; the secret must not enter the frontend.
- `mergeProviderCapability` can only narrow capabilities and raise safety requirements; it can never widen.
- `localdev_mock` remains the required fallback. `synthetic_test` is for contract testing only.

## Secret Boundary

Real provider API keys / tokens must live in a server-side proxy, Robot Gateway, or Device Runtime. They must not enter the Vite bundle, `import.meta.env.*`, `localStorage`, runtime config snapshots, action logs, traces, or Visible Context. See `docs/PROVIDER_SECRET_BOUNDARY.md` for details.

## Safety Notes

- `localdev_mock` remains the default provider and required fallback.
- Real providers stay disabled by default.
- `allowAudioUpload`, `allowCameraUpload`, and `allowRealtimeBilling` remain false by default.
- `cloudgenie.local_dev.media_ack.v1` remains diagnostic; it is never a per-frame send gate.
- `reply_text` remains subtitles/log/debug only and is never a TTS input.
- `omni.audio_frame.v1` never auto-interrupts.
- `omni.reply_audio_frame.v1` is never fed back as user input.
