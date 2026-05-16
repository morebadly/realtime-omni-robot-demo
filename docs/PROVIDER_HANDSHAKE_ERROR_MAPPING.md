# Provider Handshake Error Mapping (v1.3.9)

`src/runtime/providerHandshakeErrorMapping.js` maps provider-candidate handshake errors into Runtime block / fallback reasons.

All mapped errors fall back to `localdev_mock`. No error path can open a real provider socket, upload media, start billing, or connect `reply_text` to TTS.

## Categories

| Provider category | Runtime reason |
| --- | --- |
| `auth_missing` | `provider_secret_required_server_side` |
| `auth_invalid` | `provider_auth_failed` |
| `quota_exceeded` | `provider_quota_blocked` |
| `unsupported_model` | `provider_model_not_available` |
| `endpoint_unreachable` | `provider_endpoint_unreachable` |
| `realtime_not_enabled` | `provider_realtime_not_enabled` |
| `billing_required` | `provider_billing_blocked` |
| `media_upload_denied` | `real_media_upload_blocked` |
| `socket_denied` | `real_provider_socket_blocked_by_default` |

## Safety Result

Every mapping returns:

```text
fallbackProviderId=localdev_mock
opensRealSocket=false
sentToProvider=false
uploaded=false
persisted=false
billingStarted=false
replyTextToTts=false
```

The fallback decision helper returns `omni.provider_specific_fallback_decision.v1` and never echoes secret-like fields as usable credentials.
