#!/usr/bin/env node
import { evaluateProviderGate, normalizeProviderConfig } from '../src/runtime/providerGate.js';
import { createProviderHealthCheck, summarizeProviderHealthCheck } from '../src/runtime/providerHealthCheck.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function health(seed, result) {
  const providerConfig = normalizeProviderConfig(seed);
  const providerGate = evaluateProviderGate({ providerConfig });
  return createProviderHealthCheck({ providerGate, result });
}

function assertAlwaysSafe(item, label) {
  assert(item.canStartRealtime === false, `${label}: canStartRealtime must stay false`);
  assert(item.canSendAudio === false, `${label}: canSendAudio must stay false`);
  assert(item.canSendCamera === false, `${label}: canSendCamera must stay false`);
  assert(item.canStartBillingSession === false, `${label}: canStartBillingSession must stay false`);
  assert(item.fallbackProviderId === 'localdev_mock', `${label}: fallback must remain localdev_mock`);
}

const localMock = health({
  providerId: 'localdev_mock',
  enabled: false,
  mode: 'mock',
  fallbackProviderId: 'localdev_mock'
});
assert(localMock.status === 'mock_ready', `localdev_mock should be mock_ready, got ${localMock.status}`);
assertAlwaysSafe(localMock, 'localdev_mock');

const disabled = health({
  providerId: 'dashscope_qwen_omni',
  enabled: false,
  mode: 'health_check_only',
  endpointConfigured: true,
  apiKeyConfigured: true,
  fallbackProviderId: 'localdev_mock'
});
assert(disabled.status === 'disabled', `disabled provider should be disabled, got ${disabled.status}`);
assert(disabled.reasons.includes('provider_disabled'), 'disabled provider should retain provider_disabled reason');
assertAlwaysSafe(disabled, 'disabled');

const noEndpoint = health({
  providerId: 'dashscope_qwen_omni',
  enabled: true,
  mode: 'health_check_only',
  endpointConfigured: false,
  apiKeyConfigured: true,
  fallbackProviderId: 'localdev_mock'
});
assert(noEndpoint.status === 'unconfigured', `missing endpoint should be unconfigured, got ${noEndpoint.status}`);
assert(noEndpoint.reasons.includes('endpoint_not_configured'), 'missing endpoint reason should be visible');
assertAlwaysSafe(noEndpoint, 'noEndpoint');

const noApiKey = health({
  providerId: 'dashscope_qwen_omni',
  enabled: true,
  mode: 'health_check_only',
  endpointConfigured: true,
  apiKeyConfigured: false,
  fallbackProviderId: 'localdev_mock'
});
assert(noApiKey.status === 'unconfigured', `missing API key should be unconfigured, got ${noApiKey.status}`);
assert(noApiKey.reasons.includes('api_key_not_configured'), 'missing API key reason should be visible');
assertAlwaysSafe(noApiKey, 'noApiKey');

const ready = health({
  providerId: 'dashscope_qwen_omni',
  enabled: true,
  mode: 'health_check_only',
  endpointConfigured: true,
  apiKeyConfigured: true,
  allowAudioUpload: true,
  allowCameraUpload: true,
  allowRealtimeBilling: true,
  fallbackProviderId: 'localdev_mock'
});
assert(ready.status === 'ready_for_health_check', `ready config should be ready_for_health_check, got ${ready.status}`);
assertAlwaysSafe(ready, 'ready');

const failed = health({
  providerId: 'dashscope_qwen_omni',
  enabled: true,
  mode: 'health_check_only',
  endpointConfigured: true,
  apiKeyConfigured: true,
  fallbackProviderId: 'localdev_mock'
}, 'failed');
assert(failed.status === 'health_check_failed', `failed config should be health_check_failed, got ${failed.status}`);
assertAlwaysSafe(failed, 'failed');

const realtimeExperimental = health({
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
assert(realtimeExperimental.status === 'blocked', `v1.3.0 should block realtime_experimental, got ${realtimeExperimental.status}`);
assert(realtimeExperimental.reasons.includes('health_check_only_required'), 'realtime experimental should require health_check_only in v1.3.0');
assertAlwaysSafe(realtimeExperimental, 'realtimeExperimental');

const badFallback = health({
  providerId: 'custom_realtime_omni',
  enabled: true,
  mode: 'health_check_only',
  endpointConfigured: true,
  apiKeyConfigured: true,
  fallbackProviderId: 'custom_realtime_omni'
});
assert(badFallback.status === 'blocked', `bad fallback should block health check, got ${badFallback.status}`);
assert(badFallback.reasons.includes('mock_fallback_required'), 'bad fallback should require localdev_mock');
assert(badFallback.canStartRealtime === false, 'bad fallback must not start realtime');

console.log(`Provider health check smoke passed: ${summarizeProviderHealthCheck(localMock)}; ready=${ready.status}; failed=${failed.status}; realtime=${realtimeExperimental.status}`);
