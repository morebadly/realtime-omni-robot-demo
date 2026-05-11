#!/usr/bin/env node
import { evaluateProviderGate, normalizeProviderConfig } from '../src/runtime/providerGate.js';
import { createProviderHealthCheck } from '../src/runtime/providerHealthCheck.js';
import { createProviderHandshake, summarizeProviderHandshake } from '../src/runtime/providerHandshake.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function handshake(seed, result) {
  const providerConfig = normalizeProviderConfig(seed);
  const providerGate = evaluateProviderGate({ providerConfig });
  const providerHealth = createProviderHealthCheck({ providerGate });
  return createProviderHandshake({ providerHealth, result });
}

function assertAlwaysSafe(item, label) {
  assert(item.canOpenRealtimeSocket === false, `${label}: canOpenRealtimeSocket must stay false`);
  assert(item.canSendAudio === false, `${label}: canSendAudio must stay false`);
  assert(item.canSendCamera === false, `${label}: canSendCamera must stay false`);
  assert(item.canStartBillingSession === false, `${label}: canStartBillingSession must stay false`);
  assert(item.fallbackProviderId === 'localdev_mock', `${label}: fallback must remain localdev_mock`);
}

function assertEvents(item, label) {
  const types = item.events.map((event) => event.type);
  assert(types.includes('provider.handshake.started'), `${label}: missing started event`);
  assert(types.includes('provider.handshake.fallback'), `${label}: missing fallback event`);
}

const localMock = handshake({
  providerId: 'localdev_mock',
  enabled: false,
  mode: 'mock',
  fallbackProviderId: 'localdev_mock'
});
assert(localMock.status === 'blocked', `localdev_mock should not need real handshake, got ${localMock.status}`);
assert(localMock.reasons.includes('mock_provider_no_handshake_required'), 'local mock should explain no handshake required');
assertAlwaysSafe(localMock, 'localMock');
assertEvents(localMock, 'localMock');

const disabled = handshake({
  providerId: 'dashscope_qwen_omni',
  enabled: false,
  mode: 'handshake_only',
  endpointConfigured: true,
  apiKeyConfigured: true,
  fallbackProviderId: 'localdev_mock'
});
assert(disabled.status === 'disabled', `disabled provider should be disabled, got ${disabled.status}`);
assert(disabled.reasons.includes('provider_disabled'), 'disabled provider should retain provider_disabled');
assertAlwaysSafe(disabled, 'disabled');

const noEndpoint = handshake({
  providerId: 'dashscope_qwen_omni',
  enabled: true,
  mode: 'handshake_only',
  endpointConfigured: false,
  apiKeyConfigured: true,
  fallbackProviderId: 'localdev_mock'
});
assert(noEndpoint.status === 'unconfigured', `missing endpoint should be unconfigured, got ${noEndpoint.status}`);
assert(noEndpoint.reasons.includes('endpoint_not_configured'), 'missing endpoint reason should be visible');
assertAlwaysSafe(noEndpoint, 'noEndpoint');

const noApiKey = handshake({
  providerId: 'dashscope_qwen_omni',
  enabled: true,
  mode: 'handshake_only',
  endpointConfigured: true,
  apiKeyConfigured: false,
  fallbackProviderId: 'localdev_mock'
});
assert(noApiKey.status === 'unconfigured', `missing API key should be unconfigured, got ${noApiKey.status}`);
assert(noApiKey.reasons.includes('api_key_not_configured'), 'missing API key reason should be visible');
assertAlwaysSafe(noApiKey, 'noApiKey');

const healthOnly = handshake({
  providerId: 'dashscope_qwen_omni',
  enabled: true,
  mode: 'health_check_only',
  endpointConfigured: true,
  apiKeyConfigured: true,
  fallbackProviderId: 'localdev_mock'
});
assert(healthOnly.status === 'blocked', `health_check_only should not enter handshake, got ${healthOnly.status}`);
assert(healthOnly.reasons.includes('handshake_only_required'), 'health_check_only should require handshake_only');
assertAlwaysSafe(healthOnly, 'healthOnly');

const ready = handshake({
  providerId: 'dashscope_qwen_omni',
  enabled: true,
  mode: 'handshake_only',
  endpointConfigured: true,
  apiKeyConfigured: true,
  allowAudioUpload: true,
  allowCameraUpload: true,
  allowRealtimeBilling: true,
  fallbackProviderId: 'localdev_mock'
});
assert(ready.status === 'ready_for_handshake', `handshake_only should be ready_for_handshake, got ${ready.status}`);
assert(ready.events.some((event) => event.type === 'provider.handshake.ready'), 'ready handshake should emit ready event');
assertAlwaysSafe(ready, 'ready');

const dryRunOk = handshake({
  providerId: 'dashscope_qwen_omni',
  enabled: true,
  mode: 'handshake_only',
  endpointConfigured: true,
  apiKeyConfigured: true,
  fallbackProviderId: 'localdev_mock'
}, 'dry_run_ok');
assert(dryRunOk.status === 'handshake_dry_run_ok', `dry-run should be ok, got ${dryRunOk.status}`);
assertAlwaysSafe(dryRunOk, 'dryRunOk');

const realtimeExperimental = handshake({
  providerId: 'dashscope_qwen_omni',
  enabled: true,
  mode: 'realtime_experimental',
  endpointConfigured: true,
  apiKeyConfigured: true,
  allowAudioUpload: true,
  allowCameraUpload: true,
  allowRealtimeBilling: true,
  fallbackProviderId: 'localdev_mock'
});
assert(realtimeExperimental.status === 'blocked', `v1.3.1 should block realtime_experimental, got ${realtimeExperimental.status}`);
assert(realtimeExperimental.reasons.includes('handshake_only_required'), 'realtime experimental should require handshake_only in v1.3.1');
assertAlwaysSafe(realtimeExperimental, 'realtimeExperimental');

const failed = handshake({
  providerId: 'dashscope_qwen_omni',
  enabled: true,
  mode: 'handshake_only',
  endpointConfigured: true,
  apiKeyConfigured: true,
  fallbackProviderId: 'localdev_mock'
}, 'failed');
assert(failed.status === 'handshake_failed', `failed handshake should be handshake_failed, got ${failed.status}`);
assert(failed.events.some((event) => event.type === 'provider.handshake.failed'), 'failed handshake should emit failed event');
assertAlwaysSafe(failed, 'failed');

const badFallback = handshake({
  providerId: 'custom_realtime_omni',
  enabled: true,
  mode: 'handshake_only',
  endpointConfigured: true,
  apiKeyConfigured: true,
  fallbackProviderId: 'custom_realtime_omni'
});
assert(badFallback.status === 'blocked', `bad fallback should block handshake, got ${badFallback.status}`);
assert(badFallback.reasons.includes('mock_fallback_required'), 'bad fallback should require localdev_mock');
assert(badFallback.canOpenRealtimeSocket === false, 'bad fallback must not open socket');

console.log(`Provider handshake smoke passed: ${summarizeProviderHandshake(localMock)}; ready=${ready.status}; dry_run=${dryRunOk.status}; failed=${failed.status}; realtime=${realtimeExperimental.status}`);
