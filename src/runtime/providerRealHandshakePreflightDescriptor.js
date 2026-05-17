// providerRealHandshakePreflightDescriptor.js
//
// v1.4.0 Limited Real Provider Handshake Preflight descriptor.
//
// This is a safety descriptor only. It does not open provider sockets, does
// not send media, does not start billing, and does not connect reply_text to
// TTS. Any future real handshake preflight must stay server-side and manual.

import { getProviderSpecificHandshakeAdapter } from './providerSpecificHandshakeAdapters.js';

export const REAL_PROVIDER_HANDSHAKE_PREFLIGHT_SCHEMA = 'omni.real_provider_handshake_preflight.v1';

function lockSafety() {
  return {
    networkCallAttempted: false,
    opensRealSocket: false,
    sendsMedia: false,
    sendsAudio: false,
    sendsCamera: false,
    startsBilling: false,
    replyTextToTts: false,
    keyPrinted: false,
    browserRuntimeAllowed: false
  };
}

export function createRealHandshakePreflightDescriptor(providerId, input = {}) {
  const adapter = getProviderSpecificHandshakeAdapter(providerId);
  if (!adapter) return null;
  return {
    schema: REAL_PROVIDER_HANDSHAKE_PREFLIGHT_SCHEMA,
    providerId: adapter.providerId,
    providerKind: adapter.providerKind,
    displayName: adapter.displayName,
    officialName: adapter.officialName,
    endpointKind: adapter.endpointKind,
    endpointTemplate: adapter.endpointTemplate,
    candidateOnly: adapter.candidateOnly === true,
    manualOnly: true,
    serverSideOnly: true,
    browserForbidden: true,
    keyRequiredServerSide: true,
    requiresExplicitOptIn: true,
    envFlagName: 'ALLOW_REAL_PROVIDER_HANDSHAKE',
    defaultDecision: 'blocked',
    networkCallAttempted: false,
    opensRealSocket: false,
    sendsMedia: false,
    startsBilling: false,
    replyTextToTts: false,
    fallbackProviderId: 'localdev_mock',
    safety: lockSafety(),
    guardrails: {
      notUserRealtimeCall: true,
      manualOptInRequired: true,
      serverSideOnly: true,
      browserCannotHoldApiKey: true,
      browserCannotOpenProviderSocket: true,
      verifySmokeNetworkForbidden: true,
      noRealAudioUpload: true,
      noRealCameraUpload: true,
      noRealtimeBilling: true,
      replyTextNotTtsInput: true,
      replyAudioFrameIsRealtimeVoiceOutput: true,
      asrLlmTtsRegressionForbidden: true,
      localdevMockFallbackRequired: true
    },
    notes: input.notes || [
      'Limited real provider handshake preflight is blocked by default.',
      'Manual opt-in can only authorize a server-side config validation step.',
      'No network call, socket open, media upload, billing, or TTS is performed by this descriptor.'
    ]
  };
}

export function validateRealHandshakePreflightDescriptor(descriptor) {
  const failures = [];
  if (!descriptor || typeof descriptor !== 'object') return { ok: false, failures: ['descriptor_must_be_object'] };
  if (descriptor.schema !== REAL_PROVIDER_HANDSHAKE_PREFLIGHT_SCHEMA) failures.push('schema_must_be_real_provider_handshake_preflight_v1');
  if (descriptor.providerKind !== 'real_cloud_candidate') failures.push('provider_kind_must_be_real_cloud_candidate');
  if (descriptor.candidateOnly !== true) failures.push('candidateOnly_must_be_true');
  if (descriptor.manualOnly !== true) failures.push('manualOnly_must_be_true');
  if (descriptor.serverSideOnly !== true) failures.push('serverSideOnly_must_be_true');
  if (descriptor.browserForbidden !== true) failures.push('browserForbidden_must_be_true');
  if (descriptor.requiresExplicitOptIn !== true) failures.push('requiresExplicitOptIn_must_be_true');
  if (descriptor.networkCallAttempted !== false) failures.push('networkCallAttempted_must_be_false');
  if (descriptor.opensRealSocket !== false) failures.push('opensRealSocket_must_be_false');
  if (descriptor.sendsMedia !== false) failures.push('sendsMedia_must_be_false');
  if (descriptor.startsBilling !== false) failures.push('startsBilling_must_be_false');
  if (descriptor.replyTextToTts !== false) failures.push('replyTextToTts_must_be_false');
  if (descriptor.fallbackProviderId !== 'localdev_mock') failures.push('fallback_must_be_localdev_mock');
  const safety = descriptor.safety || {};
  for (const key of ['networkCallAttempted', 'opensRealSocket', 'sendsMedia', 'sendsAudio', 'sendsCamera', 'startsBilling', 'replyTextToTts', 'keyPrinted', 'browserRuntimeAllowed']) {
    if (safety[key] !== false) failures.push(`safety_${key}_must_be_false`);
  }
  return { ok: failures.length === 0, failures };
}
