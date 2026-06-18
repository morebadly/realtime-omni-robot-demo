// providerGatewayExecutionShell.js
//
// v1.4.3 Provider Gateway Execution Shell / Synthetic-only.
//
// Runtime descriptor helpers only. This module does not execute provider
// calls, open sockets, upload media, start billing, or route reply_text to TTS.

import { getProviderCapability } from './providerCapabilities.js';
import { auditSecretBoundarySurface } from './providerSecretBoundaryAudit.js';

export const PROVIDER_GATEWAY_EXECUTION_SHELL_SCHEMA = 'omni.provider_gateway_execution_shell.v1';

export const PROVIDER_GATEWAY_EXECUTION_DECISION_SCHEMA = 'omni.provider_gateway_execution_decision.v1';

const CANDIDATE_PROVIDER_IDS = new Set([
  'bigmodel_glm_realtime_candidate',
  'dashscope_qwen_omni_candidate'
]);

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

function createRealtimeVoicePath() {
  return {
    primaryOutput: 'omni.reply_audio_frame.v1',
    replyTextUsage: 'subtitles_logs_debug_visible_context_only',
    ttsFallbackAllowed: false,
    asrLlmTtsFallbackAllowed: false
  };
}

function createKeyRequirement(options = {}) {
  return {
    keyPresent: bool(options.keyPresent),
    keyPrinted: false,
    rawKeyIncluded: false,
    maskedKeyIncluded: false,
    keyPrefixIncluded: false,
    keyLengthIncluded: false,
    keyHashIncluded: false
  };
}

function gatewayKindForProvider(capability) {
  if (!capability) return 'unknown';
  if (capability.providerKind === 'localdev_mock') return 'local_synthetic_gateway';
  if (capability.providerKind === 'synthetic') return 'synthetic_gateway';
  if (capability.providerKind === 'offline_engine') return 'device_runtime_synthetic_shell';
  return 'server_side_gateway_shell';
}

function executionKindForProvider(capability) {
  if (!capability) return 'blocked_unknown_provider';
  if (capability.providerKind === 'localdev_mock' || capability.providerKind === 'synthetic') return 'synthetic_metadata_only';
  if (CANDIDATE_PROVIDER_IDS.has(capability.providerId)) return 'candidate_metadata_only';
  return 'blocked_real_provider_metadata_only';
}

export function createProviderGatewayExecutionShell(providerId = 'bigmodel_glm_realtime_candidate', options = {}) {
  const capability = getProviderCapability(providerId);
  const blocked = !capability;
  const shell = {
    schema: PROVIDER_GATEWAY_EXECUTION_SHELL_SCHEMA,
    providerId,
    providerKind: capability?.providerKind || 'unknown',
    displayName: options.displayName || capability?.displayName || capability?.providerId || providerId,
    executionKind: executionKindForProvider(capability),
    gatewayKind: gatewayKindForProvider(capability),
    shellStatus: blocked ? 'blocked' : 'metadata_ready',
    manualOnly: true,
    serverSideOnly: true,
    syntheticOnly: true,
    noNetworkDefault: true,
    browserForbidden: true,
    candidateOnly: capability?.candidateOnly === true,
    canExecuteRealProvider: false,
    canExecuteSyntheticOnly: capability?.providerKind === 'localdev_mock' || capability?.providerKind === 'synthetic',
    fallbackProviderId: 'localdev_mock',
    keyRequirement: createKeyRequirement(options),
    diagnostics: {
      redacted: true,
      rawKeyNeverPrinted: true,
      secretBoundaryAuditCompatible: true,
      visibleContextSafe: true,
      logsSafe: true,
      actionLogSafe: true,
      runtimeConfigSafe: true,
      endpointMetadataOnly: true
    },
    safety: createSafety(),
    realtimeVoicePath: createRealtimeVoicePath(),
    guardrails: {
      serverSideGatewayRequiredForFutureRealProvider: true,
      browserDirectProviderForbidden: true,
      localdevMockFallbackRequired: true,
      replyAudioFrameIsRealtimeVoiceOutput: true,
      replyTextNotTtsInput: true,
      asrLlmTtsRegressionForbidden: true,
      noRealNetworkHandshake: true,
      noRealProviderSocket: true,
      noAudioUpload: true,
      noCameraUpload: true,
      noBilling: true
    }
  };

  const audit = auditSecretBoundarySurface({
    surface: 'Provider Gateway Execution Shell',
    payload: shell,
    requireLocaldevMockFallback: true
  });

  return {
    ...shell,
    secretBoundaryAudit: {
      schema: audit.schema,
      status: audit.status,
      violationCount: audit.violationCount,
      leakedValueIncluded: audit.leakedValueIncluded
    }
  };
}

export function createBlockedGatewayExecutionDecision(providerId, blockReasons = [], options = {}) {
  const shell = createProviderGatewayExecutionShell(providerId, options);
  return {
    schema: PROVIDER_GATEWAY_EXECUTION_DECISION_SCHEMA,
    providerId,
    providerKind: shell.providerKind,
    decision: 'blocked',
    blockReasons,
    canExecuteRealProvider: false,
    canExecuteSyntheticOnly: false,
    manualOnly: true,
    serverSideOnly: true,
    syntheticOnly: true,
    noNetworkDefault: true,
    diagnostics: {
      redacted: true,
      secretBoundaryAuditCompatible: true
    },
    keyRequirement: shell.keyRequirement,
    safety: createSafety(),
    realtimeVoicePath: createRealtimeVoicePath(),
    fallbackProviderId: 'localdev_mock',
    shell
  };
}

export function validateProviderGatewayExecutionShell(shell) {
  const failures = [];
  if (!shell || typeof shell !== 'object') return { ok: false, failures: ['shell_must_be_object'] };
  if (shell.schema !== PROVIDER_GATEWAY_EXECUTION_SHELL_SCHEMA) failures.push('schema_must_be_provider_gateway_execution_shell_v1');
  if (shell.manualOnly !== true) failures.push('manualOnly_must_be_true');
  if (shell.serverSideOnly !== true) failures.push('serverSideOnly_must_be_true');
  if (shell.syntheticOnly !== true) failures.push('syntheticOnly_must_be_true');
  if (shell.noNetworkDefault !== true) failures.push('noNetworkDefault_must_be_true');
  if (shell.browserForbidden !== true) failures.push('browserForbidden_must_be_true');
  if (shell.fallbackProviderId !== 'localdev_mock') failures.push('fallbackProviderId_must_be_localdev_mock');
  if (typeof shell.keyRequirement?.keyPresent !== 'boolean') failures.push('keyPresent_must_be_boolean');
  for (const key of ['keyPrinted', 'rawKeyIncluded', 'maskedKeyIncluded', 'keyPrefixIncluded', 'keyLengthIncluded', 'keyHashIncluded']) {
    if (shell.keyRequirement?.[key] !== false) failures.push(`${key}_must_be_false`);
  }
  for (const key of ['networkCallAttempted', 'opensRealSocket', 'callsRealEndpoint', 'sendsAudio', 'sendsCamera', 'startsBilling', 'replyTextToTts', 'asrLlmTtsFallback', 'browserRuntimeAllowed']) {
    if (shell.safety?.[key] !== false) failures.push(`safety_${key}_must_be_false`);
  }
  if (shell.diagnostics?.redacted !== true) failures.push('diagnostics_must_be_redacted');
  if (shell.realtimeVoicePath?.primaryOutput !== 'omni.reply_audio_frame.v1') failures.push('reply_audio_frame_must_be_primary_output');
  if (shell.realtimeVoicePath?.ttsFallbackAllowed !== false) failures.push('tts_fallback_must_be_false');
  if (shell.realtimeVoicePath?.asrLlmTtsFallbackAllowed !== false) failures.push('asr_llm_tts_fallback_must_be_false');
  return { ok: failures.length === 0, failures };
}

export function summarizeProviderGatewayExecutionShell(shell) {
  if (!shell) return 'provider gateway execution shell=unknown';
  return `${shell.providerId}/${shell.providerKind}: status=${shell.shellStatus}; gateway=${shell.gatewayKind}; synthetic_only=yes; network=no; socket=no; media=no; billing=no; tts=no; fallback=${shell.fallbackProviderId}`;
}
