// providerAdapterContract.js
//
// v1.3.5 Provider Adapter Contract — descriptor and validator.
//
// This module is purely descriptive. It does not open real provider sockets,
// does not upload media, does not start billing, and does not connect
// `reply_text` to TTS. It exposes a stable contract surface that any future
// Provider Adapter (real or synthetic) must implement, plus a validator that
// checks safety invariants without ever calling provider code paths.

import { getProviderCapability, summarizeProviderCapability, BUILTIN_PROVIDER_CAPABILITIES } from './providerCapabilities.js';
import { evaluateProviderGate } from './providerGate.js';
import { createProviderHealthCheck } from './providerHealthCheck.js';
import { createProviderHandshake } from './providerHandshake.js';
import { createProviderAudioGate } from './providerAudioGate.js';
import { createProviderCameraGate } from './providerCameraGate.js';

export const PROVIDER_ADAPTER_SCHEMA = 'omni.provider_adapter.v1';

export const PROVIDER_ADAPTER_CONTRACT_METHODS = [
  'createSession',
  'closeSession',
  'sendInputPacket',
  'sendAudioFrame',
  'sendCameraFrame',
  'sendInterrupt',
  'onOutputState',
  'onOutputTurn',
  'onReplyAudioFrame',
  'onError'
];

export const PROVIDER_ADAPTER_REQUIRED_SCHEMAS = [
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

function deriveSafetyMode(capability, providerGate) {
  if (!capability) return 'mock_only';
  if (capability.providerKind === 'localdev_mock') return 'mock_only';
  if (capability.providerKind === 'offline_engine') return 'offline_only';
  if (capability.providerKind === 'synthetic') return 'synthetic_only';
  // Real providers always start from the most restrictive of the gate decisions.
  if (providerGate?.mode === 'health_check_only') return 'health_check_only';
  if (providerGate?.mode === 'handshake_only') return 'handshake_only';
  if (providerGate?.mode === 'audio_dry_run') return 'audio_dry_run';
  if (providerGate?.mode === 'camera_dry_run') return 'camera_dry_run';
  return 'realtime_experimental_blocked';
}

function describeSecretBoundary(capability, providerGate) {
  const requiresServerSideSecret = Boolean(capability?.requiresServerSideSecret);
  return {
    apiKeyInFrontend: false,
    apiKeyInRuntimeConfig: false,
    requiresServerSideSecret,
    serverSideProxyRecommended: requiresServerSideSecret,
    deviceRuntimeRecommended: requiresServerSideSecret,
    note: requiresServerSideSecret
      ? 'Real provider secrets must live on a server-side proxy / Robot Gateway / Device Runtime; the Web Console only controls permissions, status, and debug.'
      : 'No real provider secret is required for this provider kind.'
  };
}

export function createProviderAdapterDescriptor(input = {}) {
  const adapter = input.adapter || {};
  const providerConfig = adapter.providerConfig || input.providerConfig || {};
  const providerId = providerConfig.providerId || input.providerId || 'localdev_mock';
  const capability = getProviderCapability(providerId) || BUILTIN_PROVIDER_CAPABILITIES.localdev_mock;
  const providerGate = input.providerGate || evaluateProviderGate({ adapter, providerConfig });
  const providerHealth = input.providerHealth || createProviderHealthCheck({ providerGate });
  const providerHandshake = input.providerHandshake || createProviderHandshake({ providerHealth });
  const providerAudioGate = input.providerAudioGate || createProviderAudioGate({ providerGate });
  const providerCameraGate = input.providerCameraGate || createProviderCameraGate({ providerGate });

  const safety = lockSafetyBooleans();
  const safetyMode = deriveSafetyMode(capability, providerGate);

  const reasons = [];
  if (capability.providerKind === 'real_cloud' || capability.providerKind === 'self_hosted') {
    reasons.push('real_provider_traffic_blocked_by_default');
  }
  if (capability.providerKind === 'synthetic') {
    reasons.push('synthetic_only_adapter_for_contract_testing');
  }
  if (capability.providerKind === 'offline_engine') {
    reasons.push('offline_engine_no_realtime_socket');
  }
  if (providerGate?.fallbackProviderId !== 'localdev_mock') {
    reasons.push('mock_fallback_required');
  }

  return {
    schema: PROVIDER_ADAPTER_SCHEMA,
    providerId: capability.providerId,
    providerKind: capability.providerKind,
    description: capability.description,
    mode: providerGate?.mode || 'mock',
    status: providerHealth?.status || providerGate?.status || 'mock_ready',
    capabilities: {
      supportsRealtimeSocket: Boolean(capability.supportsRealtimeSocket),
      supportsAudioInput: Boolean(capability.supportsAudioInput),
      supportsCameraInput: Boolean(capability.supportsCameraInput),
      supportsReplyAudioFrame: Boolean(capability.supportsReplyAudioFrame),
      supportsOutputTurn: Boolean(capability.supportsOutputTurn),
      supportsInterrupt: Boolean(capability.supportsInterrupt),
      requiresServerSideSecret: Boolean(capability.requiresServerSideSecret),
      billingRisk: capability.billingRisk,
      experimentalOnly: Boolean(capability.experimentalOnly)
    },
    supportedSchemas: [...(capability.supportedSchemas || [])],
    safetyMode,
    canOpenRealtimeSocket: safety.canOpenRealtimeSocket,
    canSendAudio: safety.canSendRealAudio,
    canSendCamera: safety.canSendRealCamera,
    canStartBillingSession: safety.canStartBillingSession,
    replyTextToTts: safety.replyTextToTts,
    fallbackProviderId: capability.fallbackProviderId || 'localdev_mock',
    contractSurface: PROVIDER_ADAPTER_CONTRACT_METHODS.reduce((acc, method) => ({ ...acc, [method]: 'required' }), {}),
    secretBoundary: describeSecretBoundary(capability, providerGate),
    gateLinks: {
      providerGate: providerGate?.status || 'unknown',
      providerHealth: providerHealth?.status || 'unknown',
      providerHandshake: providerHandshake?.status || 'unknown',
      providerAudioGate: providerAudioGate?.status || 'unknown',
      providerCameraGate: providerCameraGate?.status || 'unknown'
    },
    reasons: [...new Set(reasons)],
    guardrails: {
      realProviderTrafficBlockedByDefault: true,
      noRealAudioUpload: true,
      noRealCameraUpload: true,
      noRealtimeBilling: true,
      noRealProviderSocket: true,
      replyTextIsSubtitleOnly: true,
      replyTextNotTtsInput: true,
      localdevMockFallbackRequired: true,
      apiKeyMustNotEnterFrontend: true,
      syntheticOnlyTestPathAvailable: true
    }
  };
}

export function validateProviderAdapter(adapter, descriptor) {
  const failures = [];
  if (!adapter || typeof adapter !== 'object') {
    failures.push('adapter_must_be_object');
    return { ok: false, failures };
  }
  for (const method of PROVIDER_ADAPTER_CONTRACT_METHODS) {
    if (typeof adapter[method] !== 'function') {
      failures.push(`missing_method:${method}`);
    }
  }
  if (!adapter.providerId) failures.push('missing_provider_id');
  if (!adapter.providerKind) failures.push('missing_provider_kind');
  if (!adapter.capabilities) failures.push('missing_capabilities');
  if (descriptor) {
    if (adapter.providerId !== descriptor.providerId) failures.push('provider_id_mismatch');
    if (adapter.providerKind !== descriptor.providerKind) failures.push('provider_kind_mismatch');
  }
  // Safety invariants on adapter shape.
  if (adapter.canOpenRealtimeSocket === true) failures.push('canOpenRealtimeSocket_must_be_false_in_default_demo');
  if (adapter.canSendRealAudio === true) failures.push('canSendRealAudio_must_be_false_in_default_demo');
  if (adapter.canSendRealCamera === true) failures.push('canSendRealCamera_must_be_false_in_default_demo');
  if (adapter.canStartBillingSession === true) failures.push('canStartBillingSession_must_be_false_in_default_demo');
  if (adapter.replyTextToTts === true) failures.push('replyTextToTts_must_be_false');
  if (adapter.fallbackProviderId && adapter.fallbackProviderId !== 'localdev_mock') {
    failures.push('fallback_must_be_localdev_mock');
  }
  return { ok: failures.length === 0, failures };
}

export function summarizeProviderAdapterDescriptor(descriptor) {
  if (!descriptor) return 'provider adapter descriptor 未初始化';
  const reasons = descriptor.reasons?.length ? descriptor.reasons.join(', ') : 'none';
  return `${descriptor.providerId}/${descriptor.providerKind}/${descriptor.safetyMode}: socket=no; audio=no; camera=no; billing=no; tts=no; fallback=${descriptor.fallbackProviderId}; ${summarizeProviderCapability(getProviderCapability(descriptor.providerId))}; reasons=${reasons}`;
}
