// providerCapabilities.js
//
// v1.3.5 Provider Adapter Contract — capability map.
//
// This module is a Runtime-only descriptor. It does not open real provider
// sockets, does not upload real media, does not start billing, and does not
// connect `reply_text` to TTS. It only describes what each provider would be
// allowed to do once a future version explicitly enables the corresponding
// safety flags. The default safe surface for every real provider remains:
//
//   canSendAudio = false
//   canSendCamera = false
//   canOpenRealtimeSocket = false
//   canStartBillingSession = false
//
// LocalDev Mock is the only provider that may stream Mock realtime media
// frames; it does so against scripts/localdev-omni-mock-server.mjs, never
// against a real cloud endpoint.

export const PROVIDER_CAPABILITY_PROTOCOL = 'omni.provider_capability.v1';

export const PROVIDER_CAPABILITY_KEYS = [
  'supportsRealtimeSocket',
  'supportsAudioInput',
  'supportsCameraInput',
  'supportsReplyAudioFrame',
  'supportsOutputTurn',
  'supportsInterrupt',
  'requiresServerSideSecret',
  'billingRisk',
  'experimentalOnly'
];

export const PROVIDER_KINDS = [
  'localdev_mock',
  'real_cloud',
  'real_cloud_candidate',
  'self_hosted',
  'synthetic',
  'offline_engine'
];

export const BILLING_RISK_LEVELS = ['none', 'mock_only', 'pay_per_use', 'subscription', 'unknown'];

export const SAFETY_MODES = [
  'mock_only',
  'health_check_only',
  'handshake_only',
  'audio_dry_run',
  'camera_dry_run',
  'synthetic_only',
  'offline_only',
  'realtime_experimental_blocked'
];

const BASE_REALTIME_SCHEMAS = [
  'omni.input_packet.v1',
  'omni.audio_frame.v1',
  'omni.camera_frame.v1',
  'omni.interrupt.v1',
  'omni.output_state.v1',
  'omni.output_turn.v1',
  'omni.reply_audio_frame.v1'
];

function lockSafetyBooleans() {
  return {
    canOpenRealtimeSocket: false,
    canSendRealAudio: false,
    canSendRealCamera: false,
    canStartBillingSession: false,
    replyTextToTts: false
  };
}

export const BUILTIN_PROVIDER_CAPABILITIES = {
  localdev_mock: {
    providerId: 'localdev_mock',
    providerKind: 'localdev_mock',
    description: 'LocalDev Mock Realtime Omni bidirectional media channel. No real cloud traffic.',
    supportedSchemas: [...BASE_REALTIME_SCHEMAS, 'cloudgenie.local_dev.envelope.v1', 'cloudgenie.local_dev.media_envelope.v1', 'cloudgenie.local_dev.control_envelope.v1', 'cloudgenie.local_dev.media_ack.v1'],
    supportsRealtimeSocket: true,
    supportsAudioInput: true,
    supportsCameraInput: true,
    supportsReplyAudioFrame: true,
    supportsOutputTurn: true,
    supportsInterrupt: true,
    requiresServerSideSecret: false,
    billingRisk: 'mock_only',
    experimentalOnly: false,
    defaultSafetyMode: 'mock_only',
    fallbackProviderId: 'localdev_mock',
    safety: lockSafetyBooleans()
  },
  dashscope_qwen_omni: {
    providerId: 'dashscope_qwen_omni',
    providerKind: 'real_cloud',
    description: 'Future DashScope Qwen-Omni realtime provider. Real traffic is blocked by default.',
    supportedSchemas: [...BASE_REALTIME_SCHEMAS],
    supportsRealtimeSocket: true,
    supportsAudioInput: true,
    supportsCameraInput: true,
    supportsReplyAudioFrame: true,
    supportsOutputTurn: true,
    supportsInterrupt: true,
    requiresServerSideSecret: true,
    billingRisk: 'pay_per_use',
    experimentalOnly: true,
    defaultSafetyMode: 'health_check_only',
    fallbackProviderId: 'localdev_mock',
    safety: lockSafetyBooleans()
  },
  custom_realtime_omni: {
    providerId: 'custom_realtime_omni',
    providerKind: 'self_hosted',
    description: 'Future self-hosted realtime Omni gateway. Real traffic is blocked by default.',
    supportedSchemas: [...BASE_REALTIME_SCHEMAS],
    supportsRealtimeSocket: true,
    supportsAudioInput: true,
    supportsCameraInput: true,
    supportsReplyAudioFrame: true,
    supportsOutputTurn: true,
    supportsInterrupt: true,
    requiresServerSideSecret: true,
    billingRisk: 'subscription',
    experimentalOnly: true,
    defaultSafetyMode: 'handshake_only',
    fallbackProviderId: 'localdev_mock',
    safety: lockSafetyBooleans()
  },
  synthetic_test: {
    providerId: 'synthetic_test',
    providerKind: 'synthetic',
    description: 'Synthetic-only provider stub for contract testing. No real socket, no real upload, no billing.',
    supportedSchemas: [...BASE_REALTIME_SCHEMAS],
    supportsRealtimeSocket: false,
    supportsAudioInput: false,
    supportsCameraInput: false,
    supportsReplyAudioFrame: true,
    supportsOutputTurn: true,
    supportsInterrupt: true,
    requiresServerSideSecret: false,
    billingRisk: 'none',
    experimentalOnly: false,
    defaultSafetyMode: 'synthetic_only',
    fallbackProviderId: 'localdev_mock',
    safety: lockSafetyBooleans()
  },
  offline_pet_engine: {
    providerId: 'offline_pet_engine',
    providerKind: 'offline_engine',
    description: 'On-device offline pet rules engine. Touch / NFC / preset reactions only.',
    supportedSchemas: [],
    supportsRealtimeSocket: false,
    supportsAudioInput: false,
    supportsCameraInput: false,
    supportsReplyAudioFrame: false,
    supportsOutputTurn: false,
    supportsInterrupt: false,
    requiresServerSideSecret: false,
    billingRisk: 'none',
    experimentalOnly: false,
    defaultSafetyMode: 'offline_only',
    fallbackProviderId: 'localdev_mock',
    safety: lockSafetyBooleans()
  },
  bigmodel_glm_realtime_candidate: {
    providerId: 'bigmodel_glm_realtime_candidate',
    providerKind: 'real_cloud_candidate',
    description: 'BigModel GLM realtime omni candidate. Capability placeholder only; no real traffic, no real key, blocked by default.',
    supportedSchemas: [...BASE_REALTIME_SCHEMAS],
    supportsRealtimeSocket: false,
    supportsAudioInput: false,
    supportsCameraInput: false,
    supportsReplyAudioFrame: true,
    supportsOutputTurn: true,
    supportsInterrupt: true,
    requiresServerSideSecret: true,
    billingRisk: 'pay_per_use',
    experimentalOnly: true,
    candidateOnly: true,
    candidateStatus: 'candidate_only',
    browserDirectProviderSocketAllowed: false,
    defaultSafetyMode: 'realtime_experimental_blocked',
    fallbackProviderId: 'localdev_mock',
    safety: lockSafetyBooleans()
  },
  dashscope_qwen_omni_candidate: {
    providerId: 'dashscope_qwen_omni_candidate',
    providerKind: 'real_cloud_candidate',
    description: 'DashScope Qwen-Omni realtime candidate variant. Capability placeholder only; no real traffic, no real key, blocked by default.',
    supportedSchemas: [...BASE_REALTIME_SCHEMAS],
    supportsRealtimeSocket: false,
    supportsAudioInput: false,
    supportsCameraInput: false,
    supportsReplyAudioFrame: true,
    supportsOutputTurn: true,
    supportsInterrupt: true,
    requiresServerSideSecret: true,
    billingRisk: 'pay_per_use',
    experimentalOnly: true,
    candidateOnly: true,
    candidateStatus: 'candidate_only',
    browserDirectProviderSocketAllowed: false,
    defaultSafetyMode: 'realtime_experimental_blocked',
    fallbackProviderId: 'localdev_mock',
    safety: lockSafetyBooleans()
  }
};

export function getProviderCapability(providerId) {
  return BUILTIN_PROVIDER_CAPABILITIES[providerId] || null;
}

export function listProviderCapabilities() {
  return Object.values(BUILTIN_PROVIDER_CAPABILITIES);
}

// Keys that describe a granted capability. For these, "narrowing" means
// going from `true -> false` (less capability = safer).
const NARROWING_TRUE_TO_FALSE_KEYS = new Set([
  'supportsRealtimeSocket',
  'supportsAudioInput',
  'supportsCameraInput',
  'supportsReplyAudioFrame',
  'supportsOutputTurn',
  'supportsInterrupt'
]);

// Keys that describe a safety requirement. For these, "narrowing" means
// going from `false -> true` (more required restriction = safer).
const NARROWING_FALSE_TO_TRUE_KEYS = new Set([
  'requiresServerSideSecret',
  'experimentalOnly'
]);

// Per-adapter override is allowed only to *narrow* safety. Overrides cannot
// widen a granted capability and cannot weaken a safety requirement.
// Overrides cannot quietly weaken the declared billing risk either.
export function mergeProviderCapability(providerId, override = {}) {
  const base = getProviderCapability(providerId);
  if (!base) return null;
  const merged = { ...base };
  for (const key of PROVIDER_CAPABILITY_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(override, key)) continue;
    const baseValue = base[key];
    const overrideValue = override[key];

    if (NARROWING_TRUE_TO_FALSE_KEYS.has(key) && typeof baseValue === 'boolean' && typeof overrideValue === 'boolean') {
      // Allow true -> false, block false -> true.
      merged[key] = baseValue && overrideValue;
      continue;
    }

    if (NARROWING_FALSE_TO_TRUE_KEYS.has(key) && typeof baseValue === 'boolean' && typeof overrideValue === 'boolean') {
      // Allow false -> true, block true -> false.
      merged[key] = baseValue || overrideValue;
      continue;
    }

    if (key === 'billingRisk' && typeof overrideValue === 'string' && BILLING_RISK_LEVELS.includes(overrideValue)) {
      // Never quietly widen the declared risk to a less safe level. Allow only
      // explicit narrowing to a safer level (lower index in BILLING_RISK_LEVELS).
      const baseIndex = BILLING_RISK_LEVELS.indexOf(baseValue);
      const overrideIndex = BILLING_RISK_LEVELS.indexOf(overrideValue);
      merged.billingRisk = overrideIndex < baseIndex ? overrideValue : baseValue;
      continue;
    }
  }
  // Hard-locked safety booleans never change.
  merged.safety = lockSafetyBooleans();
  // Fallback always points to localdev_mock.
  merged.fallbackProviderId = 'localdev_mock';
  return merged;
}

export function summarizeProviderCapability(capability) {
  if (!capability) return 'capability=unknown';
  return `${capability.providerId}/${capability.providerKind}: realtime_socket=${capability.supportsRealtimeSocket ? 'declared' : 'no'}; audio=${capability.supportsAudioInput ? 'declared' : 'no'}; camera=${capability.supportsCameraInput ? 'declared' : 'no'}; server_side_secret=${capability.requiresServerSideSecret ? 'required' : 'not_required'}; billing_risk=${capability.billingRisk}; experimental=${capability.experimentalOnly ? 'yes' : 'no'}; default_safety=${capability.defaultSafetyMode}; fallback=${capability.fallbackProviderId}`;
}
