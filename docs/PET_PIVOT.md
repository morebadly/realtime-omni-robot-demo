# CloudGenie Pet Pivot

CloudGenie first-gen is a non-verbal plush AI desktop pet. The main product experience must not speak human language.

## Live Product Boundary

- No TTS, browser speech synthesis, provider speech synthesis, or `reply_text` playback in the live UI.
- No email, calendar, AC control, mail sending, or office-assistant positioning in the first MVP live surface.
- The live console expresses pet behavior through eyes, face state, tiny motion tokens, local non-verbal sound labels, NFC props, touch reactions, and rest-reminder expressions.
- Existing realtime/provider/plugin/debug modules are preserved behind debug views.

## Pet State Engine

`src/runtime/petStateEngine.js` is local-first and reducer-style. It accepts factual events such as touch, NFC, battery, camera privacy, work-session length, user return, and network status.

The engine emits behavior through `cloudgenie.pet_action.v1`:

- `petState`
- `expression`
- `motion`
- `sound`
- `icon`
- `reasonCode`
- `speechForbidden: true`

It must not output direct speech, natural-language utterances, TTS instructions, provider calls, hardware calls, filesystem access, secrets, or DOM access.

## Future Omni Boundary

A future Omni model may only output `cloudgenie.pet_action.v1` behavior tokens for this first-gen pet experience. It must not directly speak human language, and `reply_text` must remain subtitles/log/debug context only.

If a future provider can only return text plus TTS, it must not become the main realtime Omni pet provider.

## Pet-Eye View

The pet-eye view shows what the pet can currently see:

- latest local preview frame
- camera open/closed state
- last captured time
- frame policy/cadence
- upload status

The user-facing preview may be mirrored for comfort, but any future upload/model-read boundary must preserve a raw non-mirrored frame. Camera upload remains off by default with `uploadStatus: "local_only"`.

The pet-eye view must not infer user emotion labels.

## Secret And Provider Boundary

This pivot does not add real provider traffic, real cloud upload, realtime billing, browser-held secrets, real email, real AC, real hardware, or real TTS.

Provider key output remains boolean-only where applicable. Raw keys, masked keys, prefixes, lengths, hashes, tokens, secrets, and Authorization values must not enter frontend state, Visible Context, Action Log, diagnostics, console output, screenshots, `localStorage`, or `sessionStorage`.

LocalDev Mock fallback remains required.
