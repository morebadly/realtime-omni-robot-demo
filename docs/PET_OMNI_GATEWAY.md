# Pet Omni Gateway Skeleton

`scripts/pet-omni-gateway.mjs` is a server-side-only skeleton for a future Pet Omni Gateway. It does not call a real provider by default.

## Run

```bash
npm run gateway:pet-omni
```

Defaults:

- Host: `127.0.0.1`
- Port: `8021`

Optional server-side environment:

- `PET_OMNI_GATEWAY_HOST`
- `PET_OMNI_GATEWAY_PORT`
- `PET_OMNI_PROVIDER`: `local_mock`, `openai_realtime`, or `dashscope_qwen_omni`
- `PET_OMNI_CLOUD_ENABLED`
- `PET_OMNI_REAL_PROVIDER_CALLS`
- `PET_OMNI_ALLOW_CAMERA_UPLOAD`
- provider key env such as `PET_OMNI_API_KEY`, `BIGMODEL_API_KEY`, or `DASHSCOPE_API_KEY`
- OpenAI: `OPENAI_API_KEY`, optional `PET_OMNI_OPENAI_MODEL`, optional `PET_OMNI_OPENAI_ENDPOINT`
- DashScope: `DASHSCOPE_API_KEY`, optional `PET_OMNI_DASHSCOPE_MODEL`, optional `PET_OMNI_DASHSCOPE_ENDPOINT`

Provider keys are read only from server-side `process.env`. They must never be supplied by the frontend or echoed in responses, logs, Visible Context, Action Log, diagnostics, localStorage, or sessionStorage.

Real provider traffic is off by default. A server operator must explicitly set:

```bash
PET_OMNI_CLOUD_ENABLED=1
PET_OMNI_REAL_PROVIDER_CALLS=1
```

Camera bytes are still not sent unless both are true:

```bash
PET_OMNI_ALLOW_CAMERA_UPLOAD=1
```

and the request permissions grant camera upload.

## Endpoints

`GET /health`

Returns only:

```json
{
  "ok": true,
  "provider": "local_mock",
  "cloudEnabled": false,
  "keyPresent": false
}
```

`keyPresent` is boolean-only. The gateway never returns raw keys, masked keys, key prefixes, key lengths, key hashes, tokens, secrets, or Authorization values.

`POST /pet-omni/analyze`

Accepts:

```json
{
  "frame": {
    "schema": "cloudgenie.pet_eye_frame.v1",
    "frameId": "frame-1",
    "rawDataUrl": "data:image/jpeg;base64,...",
    "capturedAt": "2026-06-17T00:00:00.000Z",
    "uploadStatus": "local_only"
  },
  "facts": [
    { "type": "touch.event", "timestamp": "2026-06-17T00:00:00.000Z", "label": "head" }
  ],
  "currentPetState": "idle",
  "permissions": {
    "cameraUpload": false
  }
}
```

Behavior:

- If `PET_OMNI_CLOUD_ENABLED !== "1"`, returns a local mock `cloudgenie.pet_action.v1`.
- If cloud is enabled but camera upload permission is false, does not send image data to any provider and returns a local action.
- If cloud is enabled but `PET_OMNI_REAL_PROVIDER_CALLS !== "1"`, returns a local action.
- If cloud and real calls are enabled, provider-specific adapters are available for `openai_realtime` and `dashscope_qwen_omni`.
- If camera upload is allowed by env and request permission, a provider call may include the current raw frame. Otherwise the adapter either falls back locally or sends facts only where safe.
- All outputs are normalized to `cloudgenie.pet_action.v1`.
- Any provider-like text, speech, TTS, message, utterance, or `reply_text` fields are stripped.
- `speechForbidden` is always `true`.
- Responses include `uploadReceipt` so the pet-eye UI can show the provider, frame id, captured time, sent/not-sent state, and reason.

## Provider Adapters

OpenAI adapter:

- Uses a server-side OpenAI API key from `OPENAI_API_KEY`.
- Sends a JSON-only instruction and requests JSON object output.
- Does not request audio, speech, TTS, or reply audio playback.
- The implementation is server-side only; the browser never sees the standard API key.

DashScope Qwen Omni adapter:

- Uses a server-side DashScope API key from `DASHSCOPE_API_KEY`.
- Uses the OpenAI-compatible chat endpoint by default.
- Sets text-only modalities and asks for JSON object output.
- Does not request audio output or TTS.

The OpenAI Realtime docs describe Realtime as part of the Realtime/audio API family, while this gateway deliberately uses a server-side JSON-only adapter shape for the pet action boundary. DashScope Qwen Omni docs show text/audio modality options and note text-only modality usage; this gateway keeps output text-only JSON and strips any speech-like fields.

`POST /pet-omni/realtime/session`

Reserved for a future realtime pet session. The skeleton currently returns a safe local pet action and does not open a real provider socket.

## Safety Boundary

This gateway is not a real provider integration. It must not:

- call real provider endpoints
- open real provider sockets
- upload camera frames by default
- start realtime billing
- route `reply_text` to TTS
- accept provider secrets from the browser
- expose raw, masked, prefixed, length, or hashed key material

Future provider-specific implementation requires an explicit later task.

## Verification

```bash
npm run test:pet-omni-gateway
```

The smoke test covers:

- no key leak
- cloud-disabled fallback
- camera permission blocking image upload
- real provider calls disabled by default
- upload receipts
- output always `cloudgenie.pet_action.v1`
- `speechForbidden: true`
