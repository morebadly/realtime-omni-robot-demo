import { createProviderHealthCheck } from './providerHealthCheck.js';

export const PROVIDER_HANDSHAKE_EVENTS = [
  'provider.handshake.started',
  'provider.handshake.ready',
  'provider.handshake.blocked',
  'provider.handshake.failed',
  'provider.handshake.fallback'
];

function uniqueReasons(reasons = []) {
  return [...new Set(reasons.filter(Boolean))];
}

function createEvent(type, detail = {}) {
  return {
    type,
    providerId: detail.providerId || 'localdev_mock',
    mode: detail.mode || 'mock',
    fallbackProviderId: detail.fallbackProviderId || 'localdev_mock',
    reason: detail.reason || null
  };
}

export function createProviderHandshake(input = {}) {
  const health = input.providerHealth || createProviderHealthCheck(input);
  const reasons = [...(health.reasons || [])];
  const events = [createEvent('provider.handshake.started', health)];

  let status = 'blocked';
  if (health.status === 'mock_ready') {
    status = 'blocked';
    reasons.push('mock_provider_no_handshake_required');
  } else if (health.status === 'disabled') {
    status = 'disabled';
  } else if (health.status === 'unconfigured') {
    status = 'unconfigured';
  } else if (health.mode !== 'handshake_only') {
    status = 'blocked';
    reasons.push('handshake_only_required');
  } else if (health.endpointConfigured && health.apiKeyConfigured && health.mockFallbackReady) {
    status = 'ready_for_handshake';
  }

  if (input.result === 'dry_run_ok' && status === 'ready_for_handshake') {
    status = 'handshake_dry_run_ok';
  }
  if (input.result === 'failed') {
    status = 'handshake_failed';
    reasons.push(input.error || 'handshake_failed');
  }

  if (status === 'ready_for_handshake' || status === 'handshake_dry_run_ok') {
    events.push(createEvent('provider.handshake.ready', health));
  } else if (status === 'handshake_failed') {
    events.push(createEvent('provider.handshake.failed', { ...health, reason: input.error || 'handshake_failed' }));
  } else {
    events.push(createEvent('provider.handshake.blocked', { ...health, reason: reasons[0] || status }));
  }
  events.push(createEvent('provider.handshake.fallback', health));

  return {
    providerId: health.providerId,
    mode: health.mode,
    status,
    canOpenRealtimeSocket: false,
    canSendAudio: false,
    canSendCamera: false,
    canStartBillingSession: false,
    fallbackProviderId: health.fallbackProviderId || 'localdev_mock',
    events,
    reasons: uniqueReasons(reasons),
    healthStatus: health.status,
    endpointConfigured: Boolean(health.endpointConfigured),
    apiKeyConfigured: Boolean(health.apiKeyConfigured),
    mockFallbackReady: health.fallbackProviderId === 'localdev_mock'
  };
}

export function summarizeProviderHandshake(handshake = createProviderHandshake()) {
  const reasons = handshake.reasons?.length ? handshake.reasons.join(', ') : 'none';
  return `${handshake.providerId}/${handshake.mode}: ${handshake.status}; socket=no; audio=no; camera=no; billing=no; fallback=${handshake.fallbackProviderId}; reasons=${reasons}`;
}
