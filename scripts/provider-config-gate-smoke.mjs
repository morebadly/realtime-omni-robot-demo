#!/usr/bin/env node
import {
  createDefaultProviderConfig,
  createProviderConfigFromEnv,
  evaluateProviderGate,
  normalizeProviderConfig,
  summarizeProviderGate
} from '../src/runtime/providerGate.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function gate(seed, adapter = {}) {
  return evaluateProviderGate({
    adapter,
    providerConfig: normalizeProviderConfig(seed, adapter)
  });
}

const localDefault = evaluateProviderGate({
  adapter: {
    key: 'local_dev',
    endpoint: 'ws://127.0.0.1:8000/omni/realtime',
    providerConfig: createDefaultProviderConfig('local_dev', {
      key: 'local_dev',
      endpoint: 'ws://127.0.0.1:8000/omni/realtime'
    })
  }
});
assert(localDefault.providerId === 'localdev_mock', `default provider mismatch: ${localDefault.providerId}`);
assert(localDefault.status === 'mock_ready', `default status mismatch: ${localDefault.status}`);
assert(localDefault.canRealtime === false, 'mock provider must not claim real realtime');
assert(localDefault.canUploadAudio === false, 'mock provider must not allow real audio upload');
assert(localDefault.canUploadCamera === false, 'mock provider must not allow real camera upload');

const disabledReal = gate({
  providerId: 'dashscope_qwen_omni',
  enabled: false,
  mode: 'realtime_experimental',
  endpointConfigured: true,
  apiKeyConfigured: true,
  allowAudioUpload: true,
  allowCameraUpload: true,
  allowRealtimeBilling: true,
  fallbackProviderId: 'localdev_mock'
});
assert(disabledReal.canRealtime === false, 'disabled real provider must not allow realtime');
assert(disabledReal.blockReasons.includes('provider_disabled'), 'disabled real provider should explain provider_disabled');

const missingKey = gate({
  providerId: 'dashscope_qwen_omni',
  enabled: true,
  mode: 'health_check_only',
  endpointConfigured: true,
  apiKeyConfigured: false,
  fallbackProviderId: 'localdev_mock'
});
assert(missingKey.status === 'blocked', `missing key should be blocked, got ${missingKey.status}`);
assert(missingKey.blockReasons.includes('api_key_not_configured'), 'missing key should be visible');

const noAudio = gate({
  providerId: 'dashscope_qwen_omni',
  enabled: true,
  mode: 'realtime_experimental',
  endpointConfigured: true,
  apiKeyConfigured: true,
  allowAudioUpload: false,
  allowCameraUpload: true,
  allowRealtimeBilling: true,
  fallbackProviderId: 'localdev_mock'
});
assert(noAudio.canUploadAudio === false, 'audio upload must remain blocked without allowAudioUpload');
assert(noAudio.blockReasons.includes('audio_upload_not_allowed'), 'audio block reason should be recorded');

const noCamera = gate({
  providerId: 'dashscope_qwen_omni',
  enabled: true,
  mode: 'realtime_experimental',
  endpointConfigured: true,
  apiKeyConfigured: true,
  allowAudioUpload: true,
  allowCameraUpload: false,
  allowRealtimeBilling: true,
  fallbackProviderId: 'localdev_mock'
});
assert(noCamera.canUploadCamera === false, 'camera upload must remain blocked without allowCameraUpload');
assert(noCamera.blockReasons.includes('camera_upload_not_allowed'), 'camera block reason should be recorded');

const noBilling = gate({
  providerId: 'dashscope_qwen_omni',
  enabled: true,
  mode: 'realtime_experimental',
  endpointConfigured: true,
  apiKeyConfigured: true,
  allowAudioUpload: true,
  allowCameraUpload: true,
  allowRealtimeBilling: false,
  fallbackProviderId: 'localdev_mock'
});
assert(noBilling.canRealtime === false, 'realtime billing/session must remain blocked without allowRealtimeBilling');
assert(noBilling.blockReasons.includes('realtime_billing_not_allowed'), 'billing block reason should be recorded');

const healthOnly = gate({
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
assert(healthOnly.canHealthCheck === true, 'health_check_only should allow readiness checks');
assert(healthOnly.canRealtime === false, 'health_check_only must not allow realtime sessions');
assert(healthOnly.canUploadAudio === false, 'health_check_only must not send media frames');
assert(healthOnly.canUploadCamera === false, 'health_check_only must not send camera frames');

const badFallback = gate({
  providerId: 'custom_realtime_omni',
  enabled: true,
  mode: 'handshake_only',
  endpointConfigured: true,
  apiKeyConfigured: true,
  fallbackProviderId: 'custom_realtime_omni'
});
assert(badFallback.blockReasons.includes('mock_fallback_required'), 'real provider must keep LocalDev Mock fallback');

const envDefault = createProviderConfigFromEnv({});
assert(envDefault.providerId === 'localdev_mock', 'empty env should default to LocalDev Mock');
assert(envDefault.mode === 'mock', 'empty env should default to mock mode');

console.log(`Provider config gate smoke passed: ${summarizeProviderGate(localDefault)}; health=${healthOnly.status}; billing_block=${noBilling.status}`);
