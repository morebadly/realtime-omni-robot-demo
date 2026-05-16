// providerHandshakeErrorMapping.js
//
// v1.3.9 provider-specific error mapping descriptors.
// All mapped errors fall back to localdev_mock and never open real channels.

import { getProviderSpecificHandshakeAdapter } from './providerSpecificHandshakeAdapters.js';

export const PROVIDER_HANDSHAKE_ERROR_MAPPING_SCHEMA = 'omni.provider_handshake_error_mapping.v1';

export const PROVIDER_HANDSHAKE_ERROR_CATEGORIES = Object.freeze({
  auth_missing: 'provider_secret_required_server_side',
  auth_invalid: 'provider_auth_failed',
  quota_exceeded: 'provider_quota_blocked',
  unsupported_model: 'provider_model_not_available',
  endpoint_unreachable: 'provider_endpoint_unreachable',
  realtime_not_enabled: 'provider_realtime_not_enabled',
  billing_required: 'provider_billing_blocked',
  media_upload_denied: 'real_media_upload_blocked',
  socket_denied: 'real_provider_socket_blocked_by_default'
});

function lockSafety() {
  return {
    opensRealSocket: false,
    sentToProvider: false,
    uploaded: false,
    persisted: false,
    billingStarted: false,
    replyTextToTts: false
  };
}

export function createProviderHandshakeErrorMapping(providerId) {
  const adapter = getProviderSpecificHandshakeAdapter(providerId);
  if (!adapter) return null;
  const mappings = Object.entries(PROVIDER_HANDSHAKE_ERROR_CATEGORIES).map(([providerError, runtimeReason]) => ({
    providerError,
    runtimeReason,
    fallbackProviderId: 'localdev_mock',
    fatal: false,
    safety: lockSafety()
  }));
  return {
    schema: PROVIDER_HANDSHAKE_ERROR_MAPPING_SCHEMA,
    providerId: adapter.providerId,
    providerKind: adapter.providerKind,
    dryRunOnly: true,
    fallbackProviderId: 'localdev_mock',
    mappings,
    guardrails: {
      allErrorsFallbackLocaldevMock: true,
      authErrorsDoNotExposeSecret: true,
      quotaErrorsDoNotStartBilling: true,
      mediaErrorsDoNotUpload: true,
      socketErrorsDoNotOpenSocket: true,
      replyTextNotTtsInput: true
    }
  };
}

export function createProviderSpecificFallbackDecision(providerId, error = {}) {
  const mapping = createProviderHandshakeErrorMapping(providerId);
  const category = typeof error === 'string' ? error : (error.category || error.providerError || 'socket_denied');
  const matched = mapping?.mappings?.find((item) => item.providerError === category);
  return {
    schema: 'omni.provider_specific_fallback_decision.v1',
    providerId,
    providerKind: mapping?.providerKind || 'unknown',
    decision: 'fallback_to_localdev_mock',
    providerError: category,
    runtimeReason: matched?.runtimeReason || 'provider_specific_handshake_blocked',
    fallbackProviderId: 'localdev_mock',
    dryRunOnly: true,
    secretStripped: Boolean(error && typeof error === 'object' && (error.apiKey || error.secret || error.tokenRawValue || error.authorization)),
    safety: lockSafety(),
    notes: [
      'Provider-specific fallback is localdev_mock only.',
      'No real provider endpoint was called. No media, billing, socket, or TTS was triggered.'
    ]
  };
}

export function validateProviderHandshakeErrorMapping(mapping) {
  const failures = [];
  if (!mapping || typeof mapping !== 'object') return { ok: false, failures: ['mapping_must_be_object'] };
  if (mapping.schema !== PROVIDER_HANDSHAKE_ERROR_MAPPING_SCHEMA) failures.push('schema_must_be_provider_handshake_error_mapping_v1');
  if (mapping.fallbackProviderId !== 'localdev_mock') failures.push('fallback_must_be_localdev_mock');
  for (const providerError of Object.keys(PROVIDER_HANDSHAKE_ERROR_CATEGORIES)) {
    const item = mapping.mappings?.find((entry) => entry.providerError === providerError);
    if (!item) {
      failures.push(`missing_error_mapping:${providerError}`);
      continue;
    }
    if (item.fallbackProviderId !== 'localdev_mock') failures.push(`error_fallback_must_be_localdev_mock:${providerError}`);
    const safety = item.safety || {};
    for (const key of ['opensRealSocket', 'sentToProvider', 'uploaded', 'persisted', 'billingStarted', 'replyTextToTts']) {
      if (safety[key] !== false) failures.push(`error_safety_${key}_must_be_false:${providerError}`);
    }
  }
  return { ok: failures.length === 0, failures };
}

export function summarizeProviderHandshakeErrorMapping(mapping) {
  if (!mapping) return 'provider error mapping=unknown';
  return `${mapping.providerId}: errors=${mapping.mappings?.length || 0}; fallback=${mapping.fallbackProviderId}; socket=no; media=no; billing=no; tts=no`;
}
