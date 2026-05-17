// providerRealHandshakePreflightPolicy.js
//
// v1.4.0 Limited Real Provider Handshake Preflight policy.
//
// Pure decision logic only. The "allowed" state means a manual server-side
// preflight tool may inspect configuration metadata. It never means the
// Runtime or browser may connect to a provider.

import { getProviderSpecificHandshakeAdapter } from './providerSpecificHandshakeAdapters.js';
import {
  createRealHandshakePreflightDescriptor,
  validateRealHandshakePreflightDescriptor
} from './providerRealHandshakePreflightDescriptor.js';

const REAL_REQUEST_FLAGS = {
  audioUploadRequested: 'real_audio_upload_blocked',
  cameraUploadRequested: 'real_camera_upload_blocked',
  billingRequested: 'realtime_billing_blocked',
  replyTextTtsRequested: 'reply_text_tts_blocked',
  realProviderSocketRequested: 'real_provider_socket_blocked'
};

export function createRealHandshakePreflightPolicy(overrides = {}) {
  return {
    schema: 'omni.real_provider_handshake_preflight_policy.v1',
    enabled: false,
    allowNetwork: false,
    allowAudioUpload: false,
    allowCameraUpload: false,
    allowBilling: false,
    allowReplyTextTts: false,
    browserRuntimeAllowed: false,
    serverSideOnly: true,
    manualOnly: true,
    requiresExplicitOptIn: true,
    envFlagName: 'ALLOW_REAL_PROVIDER_HANDSHAKE',
    envFlagValue: '1',
    fallbackProviderId: 'localdev_mock',
    ...overrides,
    safety: {
      opensRealSocket: false,
      networkCallAttempted: false,
      sentToProvider: false,
      uploaded: false,
      persisted: false,
      billingStarted: false,
      replyTextToTts: false,
      keyPrinted: false,
      ...(overrides.safety || {})
    },
    notes: overrides.notes || [
      'Default policy is blocked.',
      'Manual preflight requires explicit opt-in and a server-side runtime.',
      'Allowed preflight still does not open a provider socket or send media.'
    ]
  };
}

function collectRealRequestBlockReasons(request) {
  const reasons = [];
  for (const [flag, reason] of Object.entries(REAL_REQUEST_FLAGS)) {
    if (request?.[flag] === true) reasons.push(reason);
  }
  if (Array.isArray(request?.requestedScope)) {
    for (const scope of request.requestedScope) {
      if (scope === 'media.audio.upload') reasons.push('real_audio_upload_blocked');
      if (scope === 'media.camera.upload') reasons.push('real_camera_upload_blocked');
      if (scope === 'billing.start') reasons.push('realtime_billing_blocked');
      if (scope === 'reply_text.tts') reasons.push('reply_text_tts_blocked');
      if (scope === 'provider.realtime.open') reasons.push('real_provider_socket_blocked');
    }
  }
  return [...new Set(reasons)];
}

function baseSafety() {
  return {
    opensRealSocket: false,
    networkCallAttempted: false,
    sentToProvider: false,
    uploaded: false,
    persisted: false,
    billingStarted: false,
    canSendRealAudio: false,
    canSendRealCamera: false,
    canStartBillingSession: false,
    replyTextToTts: false,
    keyPrinted: false,
    browserRuntimeAllowed: false
  };
}

export function evaluateRealHandshakePreflightRequest(request = {}, policy = null) {
  const effectivePolicy = policy || createRealHandshakePreflightPolicy();
  const providerId = request.providerId || 'localdev_mock';
  const adapter = getProviderSpecificHandshakeAdapter(providerId);
  const descriptor = createRealHandshakePreflightDescriptor(providerId);
  const descriptorValidation = validateRealHandshakePreflightDescriptor(descriptor);
  const envFlagName = effectivePolicy.envFlagName || 'ALLOW_REAL_PROVIDER_HANDSHAKE';
  const envFlagValue = request.env?.[envFlagName] ?? request.envFlag;
  const envFlagOk = envFlagValue === (effectivePolicy.envFlagValue || '1');
  const blockReasons = [];

  if (!adapter) blockReasons.push('provider_must_be_known_candidate');
  if (adapter && adapter.providerKind !== 'real_cloud_candidate') blockReasons.push('provider_must_be_real_cloud_candidate');
  if (effectivePolicy.enabled !== true) blockReasons.push('policy_disabled_by_default');
  if (request.explicitOptIn !== true) blockReasons.push('explicit_opt_in_required');
  if (request.serverSideOnly !== true) blockReasons.push('server_side_only_required');
  if (request.browserRuntime === true || effectivePolicy.browserRuntimeAllowed !== false) blockReasons.push('browser_runtime_forbidden');
  if (!envFlagOk) blockReasons.push(`${envFlagName}_must_equal_1`);
  blockReasons.push(...collectRealRequestBlockReasons(request));
  if (!descriptorValidation.ok) blockReasons.push(...descriptorValidation.failures);

  const realRequestBlocked = collectRealRequestBlockReasons(request).length > 0;
  const policyAllowsManual = effectivePolicy.enabled === true &&
    request.explicitOptIn === true &&
    request.serverSideOnly === true &&
    envFlagOk &&
    adapter?.providerKind === 'real_cloud_candidate' &&
    !realRequestBlocked &&
    descriptorValidation.ok;

  const decision = policyAllowsManual ? 'manual_preflight_allowed' : 'denied';
  return {
    schema: 'omni.real_provider_handshake_preflight_decision.v1',
    decision,
    providerId,
    providerKind: adapter?.providerKind || 'unknown',
    manualPreflightAllowed: policyAllowsManual,
    fallbackProviderId: effectivePolicy.fallbackProviderId || 'localdev_mock',
    blockReasons: decision === 'manual_preflight_allowed' ? [] : [...new Set(blockReasons)],
    descriptor,
    policy: {
      enabled: effectivePolicy.enabled,
      allowNetwork: effectivePolicy.allowNetwork,
      allowAudioUpload: effectivePolicy.allowAudioUpload,
      allowCameraUpload: effectivePolicy.allowCameraUpload,
      allowBilling: effectivePolicy.allowBilling,
      allowReplyTextTts: effectivePolicy.allowReplyTextTts,
      browserRuntimeAllowed: effectivePolicy.browserRuntimeAllowed,
      serverSideOnly: effectivePolicy.serverSideOnly,
      manualOnly: effectivePolicy.manualOnly,
      requiresExplicitOptIn: effectivePolicy.requiresExplicitOptIn,
      envFlagName
    },
    safety: baseSafety(),
    output: {
      providerId,
      endpointKind: adapter?.endpointKind || null,
      keyPresent: request.keyPresent === true,
      keyPrinted: false,
      audioUpload: false,
      cameraUpload: false,
      billing: false,
      replyTextToTts: false,
      fallbackProviderId: effectivePolicy.fallbackProviderId || 'localdev_mock',
      networkCallAttempted: false
    },
    notes: [
      decision === 'manual_preflight_allowed'
        ? 'Manual server-side preflight is allowed for config validation only. No automatic connection is made.'
        : 'Real provider handshake preflight remains blocked.',
      'No audio, camera, billing, TTS, browser key, or provider socket is allowed.'
    ],
    decidedAt: new Date().toISOString()
  };
}

export function validateRealHandshakePreflightSafety(value) {
  const failures = [];
  const safety = value?.safety || value || {};
  for (const key of ['opensRealSocket', 'networkCallAttempted', 'sentToProvider', 'uploaded', 'persisted', 'billingStarted', 'canSendRealAudio', 'canSendRealCamera', 'canStartBillingSession', 'replyTextToTts', 'keyPrinted', 'browserRuntimeAllowed']) {
    if (safety[key] !== false) failures.push(`${key}_must_be_false`);
  }
  if ((value?.fallbackProviderId || safety.fallbackProviderId || 'localdev_mock') !== 'localdev_mock') failures.push('fallback_must_be_localdev_mock');
  return { ok: failures.length === 0, failures };
}

export function summarizeRealHandshakePreflight(decision) {
  if (!decision) return 'real handshake preflight=unknown';
  return `${decision.providerId}/${decision.providerKind}: decision=${decision.decision}; manual_only=yes; server_side_only=yes; browser=forbidden; network=no; audio=no; camera=no; billing=no; tts=no; fallback=${decision.fallbackProviderId}`;
}
