// providerProxyServerContract.js
//
// v1.3.8 Provider Proxy Server Skeleton Contract.
//
// This module is a pure description of the LOCAL Mock / contract skeleton
// server that lives in `scripts/provider-proxy-skeleton-server.mjs`. It is
// NOT a production server. It does NOT hold real provider API keys. It
// does NOT open real provider sockets. It does NOT upload real microphone
// PCM or real camera JPEG. It does NOT start realtime billing. It does
// NOT connect `reply_text` to TTS.
//
// In the future, a real server-side proxy / Robot Gateway / Device Runtime
// will sit at this boundary. v1.3.8 only locks the boundary shape.

import {
  createProviderProxyContract,
  PROVIDER_PROXY_CONTRACT_SCHEMA
} from './providerProxyContract.js';

export const PROVIDER_PROXY_SERVER_CONTRACT_SCHEMA = 'omni.provider_proxy_server_contract.v1';
export const PROVIDER_PROXY_HEALTH_SCHEMA = 'omni.provider_proxy_health.v1';
export const PROVIDER_PROXY_HANDSHAKE_DRY_RUN_SCHEMA = 'omni.provider_handshake_dry_run.v1';
export const PROVIDER_PROXY_FALLBACK_DECISION_SCHEMA = 'omni.provider_proxy_fallback_decision.v1';

export const PROVIDER_PROXY_SERVER_ENDPOINTS = Object.freeze([
  { method: 'GET', path: '/health', responseSchema: PROVIDER_PROXY_HEALTH_SCHEMA },
  { method: 'GET', path: '/provider-proxy/contract', responseSchema: PROVIDER_PROXY_CONTRACT_SCHEMA },
  { method: 'POST', path: '/provider-proxy/session/request', responseSchema: 'omni.provider_proxy_decision.v1' },
  { method: 'POST', path: '/provider-proxy/session/validate', responseSchema: 'omni.provider_proxy_decision.v1' },
  { method: 'POST', path: '/provider-proxy/handshake/dry-run', responseSchema: PROVIDER_PROXY_HANDSHAKE_DRY_RUN_SCHEMA },
  { method: 'POST', path: '/provider-proxy/fallback', responseSchema: PROVIDER_PROXY_FALLBACK_DECISION_SCHEMA },
  { method: 'GET', path: '/provider-proxy/providers', responseSchema: 'omni.provider_specific_handshake_adapter_list.v1' },
  { method: 'GET', path: '/provider-proxy/providers/:providerId/handshake-adapter', responseSchema: 'omni.provider_specific_handshake_adapter.v1' },
  { method: 'POST', path: '/provider-proxy/providers/:providerId/handshake/dry-run', responseSchema: 'omni.provider_specific_handshake_dry_run.v1' },
  { method: 'GET', path: '/provider-proxy/providers/:providerId/event-mapping', responseSchema: 'omni.provider_handshake_event_mapping.v1' },
  { method: 'GET', path: '/provider-proxy/providers/:providerId/error-mapping', responseSchema: 'omni.provider_handshake_error_mapping.v1' },
  { method: 'GET', path: '/provider-proxy/providers/:providerId/real-handshake-preflight', responseSchema: 'omni.real_provider_handshake_preflight.v1' }
]);

function lockServerSafety() {
  return {
    opensRealSocket: false,
    sendsRealAudio: false,
    sendsRealCamera: false,
    startsBillingSession: false,
    sentToProvider: false,
    uploaded: false,
    persisted: false,
    replyTextToTts: false,
    readsRealApiKeyEnv: false,
    callsRealProviderEndpoint: false,
    replyAudioFrameNative: true,
    replyTextSubtitleOnly: true
  };
}

export function createProviderProxyServerContract(input = {}) {
  return {
    schema: PROVIDER_PROXY_SERVER_CONTRACT_SCHEMA,
    serverKind: 'local_mock_skeleton',
    productionReady: false,
    proxyContract: createProviderProxyContract(),
    endpoints: PROVIDER_PROXY_SERVER_ENDPOINTS.map((e) => ({ ...e })),
    bindHost: '127.0.0.1',
    defaultPort: 8011,
    fallbackProviderId: 'localdev_mock',
    serverSideSecretRequired: true,
    frontendCanHoldApiKey: false,
    browserDirectProviderSocketAllowed: false,
    realProviderHandshakeAllowed: false,
    realMediaUploadAllowed: false,
    realtimeBillingAllowed: false,
    replyTextToTts: false,
    forbiddenEnvVarNames: [
      'BIGMODEL_API_KEY',
      'BIGMODEL_TOKEN',
      'DASHSCOPE_API_KEY',
      'DASHSCOPE_TOKEN',
      'QWEN_API_KEY',
      'OPENAI_API_KEY',
      'MINIMAX_API_KEY'
    ],
    forbiddenOutboundHosts: [
      'dashscope.aliyuncs.com',
      'dashscope-intl.aliyuncs.com',
      'bigmodel.cn',
      'open.bigmodel.cn',
      'api.minimax.chat',
      'api.openai.com',
      'realtime.openai.com'
    ],
    safety: lockServerSafety(),
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
      apiKeyMustNotBeReadFromEnvBySkeleton: true,
      skeletonMustNotCallRealProvider: true
    },
    providerSpecificHandshakeAdapters: {
      available: true,
      dryRunOnly: true,
      providerIds: [
        'bigmodel_glm_realtime_candidate',
        'dashscope_qwen_omni_candidate'
      ],
      browserDirectSocketAllowed: false,
      serverSideSecretRequired: true,
      fallbackProviderId: 'localdev_mock'
    },
    realHandshakePreflight: {
      supported: true,
      default: 'blocked',
      manualOptInRequired: true,
      serverSideOnly: true,
      browserRuntimeAllowed: false,
      verifySmokeNetworkForbidden: true,
      networkCallAttempted: false,
      fallbackProviderId: 'localdev_mock'
    },
    notes: input.notes || [
      'Local Mock skeleton only. Not a production server.',
      'Browser cannot hold a real API key. Real secrets live on the production server-side proxy.',
      'Skeleton must not read BIGMODEL_API_KEY / DASHSCOPE_API_KEY / OPENAI_API_KEY / etc.',
      'Skeleton must not perform fetch / WebSocket calls to real provider endpoints.',
      'Provider-specific handshake adapters are dry-run metadata only.',
      'Skeleton must always fall back to localdev_mock on failure.',
      'omni.reply_audio_frame.v1 remains the realtime voice output. reply_text is never a TTS input.'
    ]
  };
}

export function validateProviderProxyServerContract(contract) {
  const failures = [];
  if (!contract || typeof contract !== 'object') return { ok: false, failures: ['contract_must_be_object'] };
  if (contract.schema !== PROVIDER_PROXY_SERVER_CONTRACT_SCHEMA) failures.push('schema_must_be_omni_provider_proxy_server_contract_v1');
  if (contract.productionReady !== false) failures.push('productionReady_must_be_false');
  if (contract.frontendCanHoldApiKey !== false) failures.push('frontendCanHoldApiKey_must_be_false');
  if (contract.browserDirectProviderSocketAllowed !== false) failures.push('browserDirectProviderSocketAllowed_must_be_false');
  if (contract.realProviderHandshakeAllowed !== false) failures.push('realProviderHandshakeAllowed_must_be_false');
  if (contract.realMediaUploadAllowed !== false) failures.push('realMediaUploadAllowed_must_be_false');
  if (contract.realtimeBillingAllowed !== false) failures.push('realtimeBillingAllowed_must_be_false');
  if (contract.replyTextToTts !== false) failures.push('replyTextToTts_must_be_false');
  if (contract.fallbackProviderId !== 'localdev_mock') failures.push('fallback_must_be_localdev_mock');
  const safety = contract.safety || {};
  for (const key of ['opensRealSocket', 'sendsRealAudio', 'sendsRealCamera', 'startsBillingSession', 'sentToProvider', 'uploaded', 'persisted', 'replyTextToTts', 'readsRealApiKeyEnv', 'callsRealProviderEndpoint']) {
    if (safety[key] !== false) failures.push(`safety_${key}_must_be_false`);
  }
  return { ok: failures.length === 0, failures };
}

export function summarizeProviderProxyServerContract(contract) {
  if (!contract) return 'provider proxy server contract 未初始化';
  return `server=${contract.serverKind}; productionReady=${contract.productionReady ? 'yes' : 'no'}; frontend_api_key=${contract.frontendCanHoldApiKey ? 'allowed' : 'forbidden'}; direct_socket=${contract.browserDirectProviderSocketAllowed ? 'allowed' : 'blocked'}; real_handshake=${contract.realProviderHandshakeAllowed ? 'allowed' : 'blocked'}; real_media=${contract.realMediaUploadAllowed ? 'allowed' : 'blocked'}; billing=${contract.realtimeBillingAllowed ? 'allowed' : 'blocked'}; tts=${contract.replyTextToTts ? 'allowed' : 'blocked'}; fallback=${contract.fallbackProviderId}`;
}
