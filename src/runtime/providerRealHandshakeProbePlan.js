// providerRealHandshakeProbePlan.js
//
// v1.4.1 Manual Real Handshake Probe Stub plan descriptor.
//
// This module is metadata only. It does not open provider sockets, does not
// perform network calls, does not upload media, does not start billing, and
// does not connect reply_text to TTS. Raw provider keys must never enter this
// descriptor; callers may pass key presence as a boolean only.

import { getProviderCapability } from './providerCapabilities.js';
import { getProviderSpecificHandshakeAdapter } from './providerSpecificHandshakeAdapters.js';

export const REAL_PROVIDER_HANDSHAKE_PROBE_PLAN_SCHEMA = 'omni.real_provider_handshake_probe_plan.v1';

const PROVIDER_PROBE_METADATA = Object.freeze({
  bigmodel_glm_realtime_candidate: Object.freeze({
    region: 'provider_configured_metadata_only',
    modelId: 'glm-realtime-metadata-only',
    quotaRisk: 'pay_per_use_metadata_only',
    keyEnvName: 'BIGMODEL_API_KEY'
  }),
  dashscope_qwen_omni_candidate: Object.freeze({
    region: 'provider_configured_metadata_only',
    modelId: 'qwen-omni-realtime-metadata-only',
    quotaRisk: 'pay_per_use_metadata_only',
    keyEnvName: 'DASHSCOPE_API_KEY'
  })
});

export function getProbeKeyEnvName(providerId) {
  return PROVIDER_PROBE_METADATA[providerId]?.keyEnvName || null;
}

function boolOnly(value) {
  return value === true;
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
    fallbackProviderId: 'localdev_mock'
  };
}

function createExecutionMode() {
  return {
    manualOnly: true,
    serverSideOnly: true,
    browserForbidden: true,
    dryRunDefault: true,
    noNetworkDefault: true
  };
}

function createDiagnostics(input = {}) {
  return {
    redacted: true,
    rawKeyNeverPrinted: true,
    rawKeyIncluded: false,
    keyPrinted: false,
    endpointMetadataOnly: true,
    quotaMetadataOnly: true,
    billingMetadataOnly: true,
    visibleContextSafe: true,
    logsSafe: true,
    notes: input.notes || [
      'Probe plan is metadata only.',
      'keyPresent is boolean only; raw provider keys are never included.'
    ]
  };
}

export function createRealHandshakeProbePlan(providerId, input = {}) {
  const adapter = getProviderSpecificHandshakeAdapter(providerId);
  const capability = getProviderCapability(providerId);
  const metadata = PROVIDER_PROBE_METADATA[providerId] || {};
  const keyPresent = boolOnly(input.keyPresent);

  if (!adapter) {
    return {
      schema: REAL_PROVIDER_HANDSHAKE_PROBE_PLAN_SCHEMA,
      providerId: providerId || 'unknown',
      providerKind: capability?.providerKind || 'unknown',
      displayName: input.displayName || 'Unknown provider',
      endpointKind: null,
      endpointTemplate: null,
      region: input.region || null,
      modelId: input.modelId || null,
      quotaRisk: 'unknown_metadata_only',
      billingRisk: capability?.billingRisk || 'unknown',
      keyRequirement: {
        serverSideEnvName: null,
        keyPresent: false,
        keyPrinted: false,
        rawKeyIncluded: false
      },
      executionMode: createExecutionMode(),
      safety: lockSafety(),
      diagnostics: createDiagnostics({
        notes: ['Unknown provider is blocked and falls back to localdev_mock.']
      }),
      fallbackProviderId: 'localdev_mock',
      planStatus: 'blocked',
      blockReasons: ['provider_must_be_known_candidate']
    };
  }

  return {
    schema: REAL_PROVIDER_HANDSHAKE_PROBE_PLAN_SCHEMA,
    providerId: adapter.providerId,
    providerKind: adapter.providerKind,
    displayName: adapter.displayName,
    endpointKind: adapter.endpointKind,
    endpointTemplate: adapter.endpointTemplate,
    region: input.region || metadata.region || 'metadata_only',
    modelId: input.modelId || metadata.modelId || 'metadata_only',
    quotaRisk: input.quotaRisk || metadata.quotaRisk || 'unknown_metadata_only',
    billingRisk: input.billingRisk || capability?.billingRisk || 'unknown',
    keyRequirement: {
      serverSideEnvName: metadata.keyEnvName || null,
      keyPresent,
      keyPrinted: false,
      rawKeyIncluded: false
    },
    executionMode: createExecutionMode(),
    safety: lockSafety(),
    diagnostics: createDiagnostics(),
    fallbackProviderId: 'localdev_mock',
    planStatus: 'probe_plan_ready',
    blockReasons: []
  };
}

export function validateRealHandshakeProbePlan(plan) {
  const failures = [];
  if (!plan || typeof plan !== 'object') return { ok: false, failures: ['plan_must_be_object'] };
  if (plan.schema !== REAL_PROVIDER_HANDSHAKE_PROBE_PLAN_SCHEMA) failures.push('schema_must_be_real_provider_handshake_probe_plan_v1');
  if (plan.fallbackProviderId !== 'localdev_mock') failures.push('fallback_must_be_localdev_mock');
  if (plan.keyRequirement?.keyPrinted !== false) failures.push('keyPrinted_must_be_false');
  if (plan.keyRequirement?.rawKeyIncluded !== false) failures.push('rawKeyIncluded_must_be_false');
  if (typeof plan.keyRequirement?.keyPresent !== 'boolean') failures.push('keyPresent_must_be_boolean');
  const executionMode = plan.executionMode || {};
  for (const key of ['manualOnly', 'serverSideOnly', 'browserForbidden', 'dryRunDefault', 'noNetworkDefault']) {
    if (executionMode[key] !== true) failures.push(`executionMode_${key}_must_be_true`);
  }
  const safety = plan.safety || {};
  for (const key of ['networkCallAttempted', 'opensRealSocket', 'sendsAudio', 'sendsCamera', 'startsBilling', 'replyTextToTts', 'browserRuntimeAllowed']) {
    if (safety[key] !== false) failures.push(`safety_${key}_must_be_false`);
  }
  if (safety.fallbackProviderId !== 'localdev_mock') failures.push('safety_fallbackProviderId_must_be_localdev_mock');
  if (plan.diagnostics?.redacted !== true) failures.push('diagnostics_redacted_must_be_true');
  if (plan.diagnostics?.rawKeyNeverPrinted !== true) failures.push('diagnostics_rawKeyNeverPrinted_must_be_true');
  if (plan.diagnostics?.rawKeyIncluded !== false) failures.push('diagnostics_rawKeyIncluded_must_be_false');
  return { ok: failures.length === 0, failures };
}

export function summarizeRealHandshakeProbePlan(plan) {
  if (!plan) return 'real handshake probe plan=unknown';
  return `${plan.providerId}/${plan.providerKind}: status=${plan.planStatus}; endpoint=${plan.endpointKind || 'none'}; region=${plan.region || 'none'}; model=${plan.modelId || 'none'}; keyPresent=${Boolean(plan.keyRequirement?.keyPresent)}; network=no; socket=no; audio=no; camera=no; billing=no; tts=no; fallback=${plan.fallbackProviderId}`;
}
