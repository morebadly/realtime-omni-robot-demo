# Provider-specific Handshake Adapters (v1.3.9)

v1.3.9 adds provider-specific handshake adapter dry-run descriptors for:

- `bigmodel_glm_realtime_candidate`
- `dashscope_qwen_omni_candidate`

This is metadata and local validation only. It is not a real provider connection, not a realtime cloud call, not real audio upload, not real camera upload, not realtime billing, and not `reply_text -> TTS`.

## Runtime Module

```text
src/runtime/providerSpecificHandshakeAdapters.js
```

Exports:

- `createProviderSpecificHandshakeAdapter(providerId)`
- `getProviderSpecificHandshakeAdapter(providerId)`
- `listProviderSpecificHandshakeAdapters()`
- `validateProviderSpecificHandshakeAdapter(adapter)`
- `summarizeProviderSpecificHandshakeAdapter(adapter)`

Each candidate is locked to:

```text
providerKind=real_cloud_candidate
authBoundary=server_side_proxy_required
browserDirectSocketAllowed=false
requiresServerSideSecret=true
canOpenRealtimeSocket=false
canSendRealAudio=false
canSendRealCamera=false
canStartBillingSession=false
replyTextToTts=false
replyAudioFrameNativeRequired=true
candidateOnly=true
dryRunOnly=true
fallbackProviderId=localdev_mock
```

Endpoint templates are documentation metadata only. They must not be used by the browser or the local skeleton to open a socket.

## Skeleton Endpoints

```text
GET  /provider-proxy/providers
GET  /provider-proxy/providers/:providerId/handshake-adapter
POST /provider-proxy/providers/:providerId/handshake/dry-run
GET  /provider-proxy/providers/:providerId/event-mapping
GET  /provider-proxy/providers/:providerId/error-mapping
```

All endpoints remain local Mock only and return safety-locked envelopes.

## Safety

- No real BigModel / DashScope endpoint call.
- No real API key read.
- Browser cannot hold a provider key.
- Browser cannot open a provider socket.
- Real media upload and billing stay blocked.
- `omni.reply_audio_frame.v1` remains the realtime voice output.
- `reply_text` remains subtitles/log/debug/Visible Context only.
- ASR -> LLM -> TTS regression remains forbidden.
- `localdev_mock` fallback remains required.
