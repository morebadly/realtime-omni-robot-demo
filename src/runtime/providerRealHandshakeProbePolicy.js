// providerRealHandshakeProbePolicy.js
//
// v1.4.1 Manual Real Handshake Probe Stub policy.
//
// Pure policy and redaction logic only. A generated probe plan is not an
// execution grant: real network handshakes, real provider sockets, media
// upload, billing, and reply_text -> TTS remain blocked.

import { getProviderCapability } from './providerCapabilities.js';
import {
  createRealHandshakeProbePlan,
  validateRealHandshakeProbePlan
} from './providerRealHandshakeProbePlan.js';

const SECRET_FIELD_NAMES = new Set([
  'apiKey',
  'apikey',
  'api_key',
  'token',
  'tokenRawValue',
  'token_raw',
  'authorization',
  'auth',
  'secret',
  'clientSecret',
  'client_secret',
  'accessKey',
  'access_key',
  'accessKeyId',
  'accessKeySecret',
  'refreshToken',
  'refresh_token',
  'bearerToken',
  'bearer_token',
  'password',
  'sessionKey',
  'session_key',
  'authToken'
]);

const REAL_REQUEST_FLAGS = Object.freeze({
  audioUploadRequested: 'real_audio_upload_blocked',
  cameraUploadRequested: 'real_camera_upload_blocked',
  billingRequested: 'realtime_billing_blocked',
  replyTextTtsRequested: 'reply_text_tts_blocked',
  realSocketRequested: 'real_provider_socket_blocked',
  networkRequested: 'real_network_handshake_blocked'
});

const DENIED_SCOPES = Object.freeze({
  'media.audio.upload': 'real_audio_upload_blocked',
  'media.camera.upload': 'real_camera_upload_blocked',
  'billing.start': 'realtime_billing_blocked',
  'reply_text.tts': 'reply_text_tts_blocked',
  'provider.realtime.open': 'real_provider_socket_blocked',
  'provider.network.handshake': 'real_network_handshake_blocked'
});

function stripSecrets(value, strippedFields = []) {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item) => stripSecrets(item, strippedFields));
  const out = {};
  for (const [key, child] of Object.entries(value)) {
    if (SECRET_FIELD_NAMES.has(key)) {
      strippedFields.push(key);
      continue;
    }
    out[key] = child && typeof child === 'object' ? stripSecrets(child, strippedFields) : child;
  }
  return out;
}

function collectBlockReasons(request = {}, providerKind = 'unknown', policy = null, planValidation = null) {
  const reasons = [];
  if (policy?.enabled !== true) reasons.push('policy_disabled_by_default');
  if (request.explicitOptIn !== true) reasons.push('explicit_opt_in_required');
  if (request.serverSideOnly !== true) reasons.push('server_side_only_required');
  if (request.browserRuntime === true) reasons.push('browser_runtime_forbidden');
  if (providerKind === 'unknown') reasons.push('provider_must_be_known_candidate');
  if (providerKind === 'localdev_mock') reasons.push('localdev_mock_is_not_real_provider');
  if (providerKind && !['unknown', 'localdev_mock', 'real_cloud_candidate'].includes(providerKind)) {
    reasons.push('provider_must_be_real_cloud_candidate');
  }
  for (const [flag, reason] of Object.entries(REAL_REQUEST_FLAGS)) {
    if (request[flag] === true) reasons.push(reason);
  }
  if (Array.isArray(request.requestedScope)) {
    for (const scope of request.requestedScope) {
      if (DENIED_SCOPES[scope]) reasons.push(DENIED_SCOPES[scope]);
    }
  }
  if (planValidation && !planValidation.ok) reasons.push(...planValidation.failures);
  return [...new Set(reasons)];
}

function lockSafety() {
  return {
    networkCallAttempted: false,
    opensRealSocket: false,
    sendsAudio: false,
    sendsCamera: false,
    startsBilling: false,
    replyTextToTts: false,
    browserRuntimeAllowed: false,
    sentToProvider: false,
    uploaded: false,
    persisted: false,
    fallbackProviderId: 'localdev_mock'
  };
}

export function createRealHandshakeProbePolicy(overrides = {}) {
  return {
    schema: 'omni.real_provider_handshake_probe_policy.v1',
    enabled: false,
    manualOnly: true,
    serverSideOnly: true,
    browserRuntimeAllowed: false,
    allowNetwork: false,
    allowRealSocket: false,
    allowAudioUpload: false,
    allowCameraUpload: false,
    allowBilling: false,
    allowReplyTextTts: false,
    fallbackProviderId: 'localdev_mock',
    ...overrides,
    safety: {
      ...lockSafety(),
      ...(overrides.safety || {})
    },
    diagnostics: {
      redacted: true,
      rawKeyNeverPrinted: true,
      rawKeyIncluded: false,
      ...(overrides.diagnostics || {})
    }
  };
}

export function evaluateRealHandshakeProbeRequest(request = {}, policy = null) {
  const effectivePolicy = policy || createRealHandshakeProbePolicy();
  const strippedFields = [];
  const scrubbedRequest = stripSecrets({ ...(request || {}) }, strippedFields);
  const providerId = scrubbedRequest.providerId || 'localdev_mock';
  const capability = getProviderCapability(providerId);
  const providerKind = capability?.providerKind || 'unknown';
  const plan = createRealHandshakeProbePlan(providerId, {
    keyPresent: scrubbedRequest.keyPresent === true,
    region: scrubbedRequest.region,
    modelId: scrubbedRequest.modelId,
    quotaRisk: scrubbedRequest.quotaRisk,
    billingRisk: scrubbedRequest.billingRisk
  });
  const planValidation = validateRealHandshakeProbePlan(plan);
  const blockReasons = collectBlockReasons(scrubbedRequest, providerKind, effectivePolicy, planValidation);
  const canGeneratePlan = providerKind === 'real_cloud_candidate' && planValidation.ok;
  const decision = canGeneratePlan && blockReasons.length === 0 ? 'probe_plan_ready' : 'blocked';

  return {
    schema: 'omni.real_provider_handshake_probe_decision.v1',
    decision,
    providerId,
    providerKind,
    canGenerateProbePlan: canGeneratePlan,
    canExecuteRealHandshake: false,
    fallbackProviderId: effectivePolicy.fallbackProviderId || 'localdev_mock',
    blockReasons: decision === 'probe_plan_ready' ? [] : blockReasons,
    plan: canGeneratePlan || providerKind === 'unknown' ? plan : {
      ...plan,
      planStatus: 'blocked',
      blockReasons: blockReasons.length ? blockReasons : ['probe_plan_not_applicable']
    },
    validation: planValidation,
    secretStripped: strippedFields.length > 0,
    strippedFields,
    scrubbedRequest,
    safety: lockSafety(),
    diagnostics: {
      redacted: true,
      rawKeyNeverPrinted: true,
      rawKeyIncluded: false,
      keyPrinted: false,
      endpointMetadataOnly: true,
      regionMetadataOnly: true,
      modelIdMetadataOnly: true,
      quotaRiskMetadataOnly: true,
      billingRiskMetadataOnly: true,
      visibleContextSafe: true,
      logsSafe: true
    },
    notes: [
      'Probe decision is a manual plan layer only.',
      'No real provider network handshake, socket, media upload, billing, or TTS is allowed.',
      'Raw secrets are stripped before any output is built.'
    ],
    decidedAt: new Date().toISOString()
  };
}

export function validateRealHandshakeProbeSafety(value) {
  const failures = [];
  const safety = value?.safety || value || {};
  for (const key of ['networkCallAttempted', 'opensRealSocket', 'sendsAudio', 'sendsCamera', 'startsBilling', 'replyTextToTts', 'browserRuntimeAllowed', 'sentToProvider', 'uploaded', 'persisted']) {
    if (safety[key] !== false) failures.push(`${key}_must_be_false`);
  }
  if ((value?.fallbackProviderId || safety.fallbackProviderId || 'localdev_mock') !== 'localdev_mock') failures.push('fallback_must_be_localdev_mock');
  if (value?.diagnostics?.redacted !== true) failures.push('diagnostics_must_be_redacted');
  if (value?.diagnostics?.rawKeyNeverPrinted !== true) failures.push('rawKeyNeverPrinted_must_be_true');
  return { ok: failures.length === 0, failures };
}
