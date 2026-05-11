import { evaluateProviderGate } from './providerGate.js';

export const PROVIDER_HEALTH_STATUSES = [
  'disabled',
  'mock_ready',
  'unconfigured',
  'blocked',
  'ready_for_health_check',
  'health_check_ok',
  'health_check_failed'
];

function uniqueReasons(reasons = []) {
  return [...new Set(reasons.filter(Boolean))];
}

export function createProviderHealthCheck(input = {}) {
  const gate = input.providerGate || evaluateProviderGate(input);
  const reasons = [...(gate.blockReasons || [])];

  let status = 'blocked';
  if (!gate.isRealProvider) {
    status = 'mock_ready';
  } else if (!gate.enabled) {
    status = 'disabled';
  } else if (!gate.endpointConfigured || !gate.apiKeyConfigured) {
    status = 'unconfigured';
  } else if (gate.mode !== 'health_check_only') {
    status = 'blocked';
    reasons.push('health_check_only_required');
  } else if (gate.canHealthCheck) {
    status = 'ready_for_health_check';
  }

  if (input.result === 'ok' && status === 'ready_for_health_check') {
    status = 'health_check_ok';
  }
  if (input.result === 'failed') {
    status = 'health_check_failed';
    reasons.push(input.error || 'health_check_failed');
  }

  return {
    providerId: gate.providerId,
    mode: gate.mode,
    status,
    canStartRealtime: false,
    canSendAudio: false,
    canSendCamera: false,
    canStartBillingSession: false,
    fallbackProviderId: gate.fallbackProviderId || 'localdev_mock',
    reasons: uniqueReasons(reasons),
    gateStatus: gate.status,
    endpointConfigured: Boolean(gate.endpointConfigured),
    apiKeyConfigured: Boolean(gate.apiKeyConfigured),
    mockFallbackReady: gate.fallbackProviderId === 'localdev_mock',
    realProvider: Boolean(gate.isRealProvider),
    checkedAt: input.checkedAt || null
  };
}

export function summarizeProviderHealthCheck(health = createProviderHealthCheck()) {
  const reasons = health.reasons?.length ? health.reasons.join(', ') : 'none';
  return `${health.providerId}/${health.mode}: ${health.status}; realtime=no; audio=no; camera=no; billing=no; fallback=${health.fallbackProviderId}; reasons=${reasons}`;
}
