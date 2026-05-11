// providerProxyContract.js
//
// v1.3.7 Provider Proxy Skeleton / Ephemeral Session Token.
//
// This module is a pure description of where real provider secrets and real
// realtime sockets are allowed to live in the future. It does NOT hold a
// real API key, does NOT issue a real provider token, does NOT open a real
// WebSocket, does NOT upload real microphone PCM or real camera JPEG, does
// NOT start realtime billing, and does NOT connect `reply_text` to TTS.
//
// The contract states the future architecture:
//
//   Web Console / Web Runtime
//     |  (sends restricted request: providerId, robotId, runtimeMode, ...
//     |   never an API key, never raw user media, never billing intent)
//     v
//   Server-side Proxy / Robot Gateway / Device Runtime
//     - holds real provider API key / secret
//     - enforces permission, budget, session policy
//     - issues short-lived ephemeral session tokens
//     v
//   Realtime Omni Provider
//
// In v1.3.7 the supported token kinds are `synthetic_only` and
// `dry_run_only`. Real realtime tokens are deliberately not modeled until a
// later version explicitly designs them.

export const PROVIDER_PROXY_CONTRACT_SCHEMA = 'omni.provider_proxy_contract.v1';
export const PROVIDER_PROXY_REQUEST_SCHEMA = 'omni.provider_proxy_request.v1';
export const PROVIDER_PROXY_DECISION_SCHEMA = 'omni.provider_proxy_decision.v1';

export const PROVIDER_PROXY_TOKEN_KINDS = ['synthetic_only', 'dry_run_only'];

export const PROVIDER_PROXY_DEFAULT_TTL_MS = 5 * 60 * 1000;

export const PROVIDER_PROXY_DENIED_SCOPES = [
  'provider.realtime.open',
  'media.audio.upload',
  'media.camera.upload',
  'billing.start',
  'reply_text.tts'
];

export const PROVIDER_PROXY_ALLOWED_SYNTHETIC_SCOPES = [
  'provider.synthetic.open',
  'provider.synthetic.ready',
  'provider.synthetic.close'
];

export const PROVIDER_PROXY_ALLOWED_DRY_RUN_SCOPES = [
  'provider.dry_run.validate_payload_shape',
  'provider.dry_run.validate_handshake',
  'provider.dry_run.report_diagnostics'
];

function lockSafetyFields() {
  return {
    opensRealSocket: false,
    canSendRealAudio: false,
    canSendRealCamera: false,
    canStartBillingSession: false,
    replyTextToTts: false,
    sentToProvider: false,
    uploaded: false,
    persisted: false,
    replyAudioFrameNative: true,
    replyTextSubtitleOnly: true,
    realMediaBlocked: true
  };
}

export function createProviderProxyContract(input = {}) {
  return {
    schema: PROVIDER_PROXY_CONTRACT_SCHEMA,
    proxyRequired: true,
    frontendCanHoldApiKey: false,
    browserDirectProviderSocketAllowed: false,
    robotGatewayRecommended: true,
    deviceRuntimeRecommended: true,
    serverSideSecretRequired: true,
    defaultMode: 'blocked',
    fallbackProviderId: 'localdev_mock',
    supportedTokenKinds: [...PROVIDER_PROXY_TOKEN_KINDS],
    realMediaUploadAllowed: false,
    realtimeBillingAllowed: false,
    replyTextToTts: false,
    replyAudioFrameNative: true,
    deniedScopes: [...PROVIDER_PROXY_DENIED_SCOPES],
    allowedSyntheticScopes: [...PROVIDER_PROXY_ALLOWED_SYNTHETIC_SCOPES],
    allowedDryRunScopes: [...PROVIDER_PROXY_ALLOWED_DRY_RUN_SCOPES],
    defaultTtlMs: PROVIDER_PROXY_DEFAULT_TTL_MS,
    secretBoundary: {
      apiKeyInFrontend: false,
      apiKeyInRuntimeConfig: false,
      apiKeyInDescriptor: false,
      apiKeyInLogs: false,
      apiKeyInVisibleContext: false,
      apiKeyInLocalStorage: false,
      requiresServerSideSecret: true,
      serverSideProxyRecommended: true,
      deviceRuntimeRecommended: true,
      note: 'Real provider secrets live on a server-side proxy / Robot Gateway / Device Runtime. The Web Console only sends restricted requests and receives ephemeral, safety-locked token descriptors.'
    },
    guardrails: {
      realProviderTrafficBlockedByDefault: true,
      noRealAudioUpload: true,
      noRealCameraUpload: true,
      noRealtimeBilling: true,
      noRealProviderSocket: true,
      replyTextIsSubtitleOnly: true,
      replyTextNotTtsInput: true,
      replyAudioFrameIsRealtimeVoiceOutput: true,
      asrLlmTtsRegressionForbidden: true,
      localdevMockFallbackRequired: true,
      apiKeyMustNotEnterFrontend: true,
      ephemeralTokenSyntheticOrDryRunOnly: true
    },
    safety: lockSafetyFields(),
    notes: input.notes || [
      'Browser cannot hold a real API key. Real secrets live server-side.',
      'Browser cannot open a real provider socket. Use server-side proxy / Robot Gateway / Device Runtime instead.',
      'Ephemeral tokens are synthetic_only / dry_run_only in v1.3.7. Real realtime tokens are not modeled.',
      'reply_text is subtitles / log / debug / Visible Context only. reply_text is never a TTS input.',
      'omni.reply_audio_frame.v1 is the realtime voice output. ASR -> LLM -> TTS regression is forbidden.'
    ]
  };
}

export function validateProviderProxyContract(contract) {
  const failures = [];
  if (!contract || typeof contract !== 'object') return { ok: false, failures: ['contract_must_be_object'] };
  if (contract.schema !== PROVIDER_PROXY_CONTRACT_SCHEMA) failures.push('schema_must_be_omni_provider_proxy_contract_v1');
  if (contract.proxyRequired !== true) failures.push('proxyRequired_must_be_true');
  if (contract.frontendCanHoldApiKey !== false) failures.push('frontendCanHoldApiKey_must_be_false');
  if (contract.browserDirectProviderSocketAllowed !== false) failures.push('browserDirectProviderSocketAllowed_must_be_false');
  if (contract.serverSideSecretRequired !== true) failures.push('serverSideSecretRequired_must_be_true');
  if (contract.defaultMode !== 'blocked') failures.push('defaultMode_must_be_blocked');
  if (contract.fallbackProviderId !== 'localdev_mock') failures.push('fallback_must_be_localdev_mock');
  if (contract.realMediaUploadAllowed !== false) failures.push('realMediaUploadAllowed_must_be_false');
  if (contract.realtimeBillingAllowed !== false) failures.push('realtimeBillingAllowed_must_be_false');
  if (contract.replyTextToTts !== false) failures.push('replyTextToTts_must_be_false');
  if (contract.replyAudioFrameNative !== true) failures.push('replyAudioFrameNative_must_be_true');
  for (const scope of PROVIDER_PROXY_DENIED_SCOPES) {
    if (!Array.isArray(contract.deniedScopes) || !contract.deniedScopes.includes(scope)) {
      failures.push(`deniedScopes_must_include:${scope}`);
    }
  }
  for (const kind of (contract.supportedTokenKinds || [])) {
    if (!PROVIDER_PROXY_TOKEN_KINDS.includes(kind)) {
      failures.push(`unsupported_token_kind:${kind}`);
    }
  }
  return { ok: failures.length === 0, failures };
}

export function summarizeProviderProxyContract(contract) {
  if (!contract) return 'provider proxy contract 未初始化';
  return `proxy=${contract.proxyRequired ? 'required' : 'optional'}; frontend_api_key=${contract.frontendCanHoldApiKey ? 'allowed' : 'forbidden'}; direct_socket=${contract.browserDirectProviderSocketAllowed ? 'allowed' : 'blocked'}; tokens=${(contract.supportedTokenKinds || []).join('|')}; real_media=${contract.realMediaUploadAllowed ? 'allowed' : 'blocked'}; billing=${contract.realtimeBillingAllowed ? 'allowed' : 'blocked'}; tts=${contract.replyTextToTts ? 'allowed' : 'blocked'}; fallback=${contract.fallbackProviderId}`;
}
