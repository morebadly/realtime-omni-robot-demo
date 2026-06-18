// providerGatewayExecutionPolicy.js
//
// v1.4.3 Provider Gateway Execution Shell policy.
//
// This policy is intentionally blocking by default. It only produces local
// synthetic metadata decisions and never executes a real provider call.

import { getProviderCapability } from './providerCapabilities.js';
import { auditSecretBoundarySurface } from './providerSecretBoundaryAudit.js';
import {
  createBlockedGatewayExecutionDecision,
  createProviderGatewayExecutionShell,
  validateProviderGatewayExecutionShell
} from './providerGatewayExecutionShell.js';

export const PROVIDER_GATEWAY_EXECUTION_POLICY_SCHEMA = 'omni.provider_gateway_execution_policy.v1';

const CANDIDATE_PROVIDER_IDS = new Set([
  'bigmodel_glm_realtime_candidate',
  'dashscope_qwen_omni_candidate'
]);

const DANGEROUS_REQUEST_FLAGS = [
  ['browserRuntime', 'browser_runtime_forbidden'],
  ['networkRequested', 'real_network_handshake_blocked'],
  ['realSocketRequested', 'real_provider_socket_blocked'],
  ['providerEndpointRequested', 'real_provider_endpoint_call_blocked'],
  ['audioUploadRequested', 'real_audio_upload_blocked'],
  ['cameraUploadRequested', 'real_camera_upload_blocked'],
  ['billingRequested', 'realtime_billing_blocked'],
  ['replyTextTtsRequested', 'reply_text_tts_blocked'],
  ['asrLlmTtsFallbackRequested', 'asr_llm_tts_fallback_blocked'],
  ['realProviderExecutionRequested', 'real_provider_execution_blocked']
];

function bool(value) {
  return value === true;
}

function createSafety() {
  return {
    networkCallAttempted: false,
    opensRealSocket: false,
    callsRealEndpoint: false,
    sendsAudio: false,
    sendsCamera: false,
    startsBilling: false,
    replyTextToTts: false,
    asrLlmTtsFallback: false,
    browserRuntimeAllowed: false,
    fallbackProviderId: 'localdev_mock'
  };
}

export function createProviderGatewayExecutionPolicy(overrides = {}) {
  return {
    schema: PROVIDER_GATEWAY_EXECUTION_POLICY_SCHEMA,
    enabled: false,
    manualOnly: true,
    serverSideOnly: true,
    syntheticOnly: true,
    allowNetwork: false,
    allowRealSocket: false,
    allowProviderEndpointCall: false,
    allowAudioUpload: false,
    allowCameraUpload: false,
    allowBilling: false,
    allowReplyTextTts: false,
    allowAsrLlmTtsFallback: false,
    allowBrowserRuntime: false,
    allowRealProviderExecution: false,
    fallbackProviderId: 'localdev_mock',
    diagnosticsRedacted: true,
    keyPresentBooleanOnly: true,
    ...overrides,
    safety: {
      ...createSafety(),
      ...(overrides.safety || {})
    }
  };
}

function collectBlockReasons(request = {}, policy = createProviderGatewayExecutionPolicy()) {
  const reasons = [];
  if (policy.enabled !== true) reasons.push('policy_disabled_by_default');
  if (request.explicitOptIn !== true) reasons.push('manual_explicit_opt_in_required');
  if (request.serverSideOnly !== true) reasons.push('server_side_runtime_required');

  for (const [flag, reason] of DANGEROUS_REQUEST_FLAGS) {
    if (request[flag] === true) reasons.push(reason);
  }

  if (policy.allowNetwork === true) reasons.push('policy_must_not_allow_network_in_v1_4_3');
  if (policy.allowRealSocket === true) reasons.push('policy_must_not_allow_real_socket_in_v1_4_3');
  if (policy.allowProviderEndpointCall === true) reasons.push('policy_must_not_allow_provider_endpoint_call_in_v1_4_3');
  if (policy.allowAudioUpload === true) reasons.push('policy_must_not_allow_audio_upload_in_v1_4_3');
  if (policy.allowCameraUpload === true) reasons.push('policy_must_not_allow_camera_upload_in_v1_4_3');
  if (policy.allowBilling === true) reasons.push('policy_must_not_allow_billing_in_v1_4_3');
  if (policy.allowReplyTextTts === true) reasons.push('policy_must_not_allow_reply_text_tts_in_v1_4_3');
  if (policy.allowAsrLlmTtsFallback === true) reasons.push('policy_must_not_allow_asr_llm_tts_fallback_in_v1_4_3');
  if (policy.allowBrowserRuntime === true) reasons.push('policy_must_not_allow_browser_runtime_in_v1_4_3');
  if (policy.allowRealProviderExecution === true) reasons.push('policy_must_not_allow_real_provider_execution_in_v1_4_3');
  return reasons;
}

function providerBlockReasons(providerId) {
  const capability = getProviderCapability(providerId);
  if (!capability) return ['provider_unknown'];
  if (capability.providerKind === 'localdev_mock') return ['localdev_mock_is_fallback_or_synthetic_target_not_real_provider'];
  if (capability.providerKind === 'synthetic') return [];
  if (CANDIDATE_PROVIDER_IDS.has(providerId)) return [];
  return ['real_provider_execution_blocked_by_default'];
}

function auditRequestSecretBoundary(request) {
  return auditSecretBoundarySurface({
    surface: 'Provider Gateway Execution Request',
    payload: {
      ...request,
      fallbackProviderId: 'localdev_mock'
    },
    requireLocaldevMockFallback: true
  });
}

export function evaluateProviderGatewayExecutionRequest(request = {}, policy = createProviderGatewayExecutionPolicy()) {
  const providerId = request.providerId || 'bigmodel_glm_realtime_candidate';
  const capability = getProviderCapability(providerId);
  const keyPresent = bool(request.keyPresent);
  const shell = createProviderGatewayExecutionShell(providerId, {
    keyPresent,
    displayName: request.displayName
  });
  const shellValidation = validateProviderGatewayExecutionShell(shell);
  const requestAudit = auditRequestSecretBoundary(request);
  const baseReasons = collectBlockReasons(request, policy);
  const providerReasons = providerBlockReasons(providerId);
  const auditReasons = requestAudit.status === 'pass' ? [] : ['secret_boundary_violation'];
  const validationReasons = shellValidation.ok ? [] : shellValidation.failures;
  const blockReasons = [...new Set([...baseReasons, ...providerReasons, ...auditReasons, ...validationReasons])];

  const canReturnMetadata = blockReasons.length === 0
    && (capability?.providerKind === 'synthetic' || CANDIDATE_PROVIDER_IDS.has(providerId));

  if (!canReturnMetadata) {
    return {
      ...createBlockedGatewayExecutionDecision(providerId, blockReasons, { keyPresent }),
      secretStripped: requestAudit.status !== 'pass',
      secretBoundaryAudit: {
        status: requestAudit.status,
        violationCount: requestAudit.violationCount,
        leakedValueIncluded: requestAudit.leakedValueIncluded
      }
    };
  }

  return {
    schema: 'omni.provider_gateway_execution_decision.v1',
    providerId,
    providerKind: capability.providerKind,
    decision: CANDIDATE_PROVIDER_IDS.has(providerId) ? 'gateway_shell_metadata_ready' : 'synthetic_shell_ready',
    blockReasons: [],
    canExecuteRealProvider: false,
    canExecuteSyntheticOnly: capability.providerKind === 'synthetic',
    manualOnly: true,
    serverSideOnly: true,
    syntheticOnly: true,
    noNetworkDefault: true,
    diagnostics: {
      redacted: true,
      secretBoundaryAuditCompatible: true,
      visibleContextSafe: true,
      actionLogSafe: true
    },
    keyRequirement: shell.keyRequirement,
    secretStripped: false,
    secretBoundaryAudit: {
      status: requestAudit.status,
      violationCount: requestAudit.violationCount,
      leakedValueIncluded: requestAudit.leakedValueIncluded
    },
    safety: createSafety(),
    realtimeVoicePath: shell.realtimeVoicePath,
    fallbackProviderId: 'localdev_mock',
    shell
  };
}

export function validateProviderGatewayExecutionSafety(decision) {
  const failures = [];
  if (!decision || typeof decision !== 'object') return { ok: false, failures: ['decision_must_be_object'] };
  if (decision.fallbackProviderId !== 'localdev_mock') failures.push('fallbackProviderId_must_be_localdev_mock');
  if (decision.canExecuteRealProvider !== false) failures.push('canExecuteRealProvider_must_be_false');
  if (typeof decision.keyRequirement?.keyPresent !== 'boolean') failures.push('keyPresent_must_be_boolean');
  if (decision.diagnostics?.redacted !== true) failures.push('diagnostics_must_be_redacted');
  for (const key of ['networkCallAttempted', 'opensRealSocket', 'callsRealEndpoint', 'sendsAudio', 'sendsCamera', 'startsBilling', 'replyTextToTts', 'asrLlmTtsFallback', 'browserRuntimeAllowed']) {
    if (decision.safety?.[key] !== false) failures.push(`safety_${key}_must_be_false`);
  }
  if (decision.realtimeVoicePath?.primaryOutput !== 'omni.reply_audio_frame.v1') failures.push('reply_audio_frame_must_be_primary_output');
  if (decision.realtimeVoicePath?.ttsFallbackAllowed !== false) failures.push('reply_text_tts_must_be_blocked');
  if (decision.realtimeVoicePath?.asrLlmTtsFallbackAllowed !== false) failures.push('asr_llm_tts_fallback_must_be_blocked');
  return { ok: failures.length === 0, failures };
}

export function summarizeProviderGatewayExecutionDecision(decision) {
  if (!decision) return 'provider gateway execution decision=unknown';
  return `${decision.providerId}/${decision.providerKind}: decision=${decision.decision}; real_execution=no; synthetic_only=yes; network=no; socket=no; media=no; billing=no; tts=no; fallback=${decision.fallbackProviderId}`;
}
