#!/usr/bin/env node
import { evaluateProviderGate, normalizeProviderConfig } from '../src/runtime/providerGate.js';
import { createProviderAudioGate, summarizeProviderAudioGate, validateDryRunAudioFrame } from '../src/runtime/providerAudioGate.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function gate(seed, audioFrame = null) {
  const providerConfig = normalizeProviderConfig(seed);
  const providerGate = evaluateProviderGate({ providerConfig });
  return createProviderAudioGate({ providerGate, audioFrame });
}

function assertAlwaysSafe(item, label) {
  assert(item.canSendRealAudio === false, `${label}: canSendRealAudio must stay false`);
  assert(item.canSendCamera === false, `${label}: canSendCamera must stay false`);
  assert(item.canStartRealtime === false, `${label}: canStartRealtime must stay false`);
  assert(item.canStartBillingSession === false, `${label}: canStartBillingSession must stay false`);
  assert(item.fallbackProviderId === 'localdev_mock', `${label}: fallback must remain localdev_mock`);
}

const validAudioFrame = {
  schema: 'omni.audio_frame.v1',
  media: {
    kind: 'audio',
    sampleRate: 48000,
    channels: 1,
    payloadIncluded: true,
    payloadEncoding: 'base64',
    byteLength: 12,
    payload: 'AAAAAAAABBBB'
  }
};

const invalidAudioFrame = {
  schema: 'omni.audio_frame.v1',
  media: {
    sampleRate: 48000,
    channels: 1,
    payloadIncluded: false,
    payloadEncoding: null,
    byteLength: 0,
    payload: null
  }
};

const localMock = gate({
  providerId: 'localdev_mock',
  enabled: false,
  mode: 'mock',
  fallbackProviderId: 'localdev_mock'
});
assert(localMock.status === 'mock_not_required', `localdev_mock should not need audio gate, got ${localMock.status}`);
assert(localMock.canSendDryRunAudioPayload === false, 'localdev_mock should not claim provider dry-run upload');
assertAlwaysSafe(localMock, 'localMock');

const disabled = gate({
  providerId: 'dashscope_qwen_omni',
  enabled: false,
  mode: 'audio_dry_run',
  endpointConfigured: true,
  apiKeyConfigured: true,
  allowAudioUpload: true,
  fallbackProviderId: 'localdev_mock'
});
assert(disabled.status === 'disabled', `disabled provider should be disabled, got ${disabled.status}`);
assertAlwaysSafe(disabled, 'disabled');

const missingEndpoint = gate({
  providerId: 'dashscope_qwen_omni',
  enabled: true,
  mode: 'audio_dry_run',
  endpointConfigured: false,
  apiKeyConfigured: true,
  allowAudioUpload: true,
  fallbackProviderId: 'localdev_mock'
});
assert(missingEndpoint.status === 'unconfigured', `missing endpoint should be unconfigured, got ${missingEndpoint.status}`);
assert(missingEndpoint.reasons.includes('endpoint_not_configured'), 'missing endpoint reason should be visible');
assertAlwaysSafe(missingEndpoint, 'missingEndpoint');

const missingApiKey = gate({
  providerId: 'dashscope_qwen_omni',
  enabled: true,
  mode: 'audio_dry_run',
  endpointConfigured: true,
  apiKeyConfigured: false,
  allowAudioUpload: true,
  fallbackProviderId: 'localdev_mock'
});
assert(missingApiKey.status === 'unconfigured', `missing API key should be unconfigured, got ${missingApiKey.status}`);
assert(missingApiKey.reasons.includes('api_key_not_configured'), 'missing API key reason should be visible');
assertAlwaysSafe(missingApiKey, 'missingApiKey');

const audioBlocked = gate({
  providerId: 'dashscope_qwen_omni',
  enabled: true,
  mode: 'audio_dry_run',
  endpointConfigured: true,
  apiKeyConfigured: true,
  allowAudioUpload: false,
  fallbackProviderId: 'localdev_mock'
});
assert(audioBlocked.status === 'blocked', `allowAudioUpload=false should block, got ${audioBlocked.status}`);
assert(audioBlocked.reasons.includes('audio_upload_not_allowed'), 'provider gate reason should include audio_upload_not_allowed');
assert(audioBlocked.reasons.includes('allow_audio_upload_required'), 'audio gate reason should include allow_audio_upload_required');
assertAlwaysSafe(audioBlocked, 'audioBlocked');

const ready = gate({
  providerId: 'dashscope_qwen_omni',
  enabled: true,
  mode: 'audio_dry_run',
  endpointConfigured: true,
  apiKeyConfigured: true,
  allowAudioUpload: true,
  allowCameraUpload: false,
  allowRealtimeBilling: false,
  fallbackProviderId: 'localdev_mock'
});
assert(ready.status === 'ready_for_audio_dry_run', `ready provider should be ready_for_audio_dry_run, got ${ready.status}`);
assert(ready.canSendDryRunAudioPayload === true, 'ready dry-run should allow local validation payload');
assertAlwaysSafe(ready, 'ready');

const dryRunOk = gate({
  providerId: 'dashscope_qwen_omni',
  enabled: true,
  mode: 'audio_dry_run',
  endpointConfigured: true,
  apiKeyConfigured: true,
  allowAudioUpload: true,
  fallbackProviderId: 'localdev_mock'
}, validAudioFrame);
assert(dryRunOk.status === 'audio_dry_run_ok', `valid dry-run should pass, got ${dryRunOk.status}`);
assert(dryRunOk.dryRunValidation.ok === true, 'valid payload should validate');
assert(dryRunOk.dryRunValidation.uploaded === false, 'dry-run validation must not upload');
assert(dryRunOk.dryRunValidation.sentToProvider === false, 'dry-run validation must not send to provider');
assertAlwaysSafe(dryRunOk, 'dryRunOk');

const dryRunFailed = gate({
  providerId: 'dashscope_qwen_omni',
  enabled: true,
  mode: 'audio_dry_run',
  endpointConfigured: true,
  apiKeyConfigured: true,
  allowAudioUpload: true,
  fallbackProviderId: 'localdev_mock'
}, invalidAudioFrame);
assert(dryRunFailed.status === 'audio_dry_run_failed', `invalid dry-run should fail, got ${dryRunFailed.status}`);
assert(dryRunFailed.dryRunValidation.ok === false, 'invalid payload should fail validation');
assertAlwaysSafe(dryRunFailed, 'dryRunFailed');

const realtimeExperimental = gate({
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
assert(realtimeExperimental.status === 'blocked', `realtime_experimental should still be blocked, got ${realtimeExperimental.status}`);
assert(realtimeExperimental.reasons.includes('audio_dry_run_mode_required'), 'realtime experimental should require audio_dry_run mode');
assertAlwaysSafe(realtimeExperimental, 'realtimeExperimental');

const badFallback = gate({
  providerId: 'custom_realtime_omni',
  enabled: true,
  mode: 'audio_dry_run',
  endpointConfigured: true,
  apiKeyConfigured: true,
  allowAudioUpload: true,
  fallbackProviderId: 'custom_realtime_omni'
});
assert(badFallback.status === 'blocked', `bad fallback should block, got ${badFallback.status}`);
assert(badFallback.reasons.includes('mock_fallback_required'), 'bad fallback should require localdev_mock');

const standaloneValidation = validateDryRunAudioFrame(validAudioFrame);
assert(standaloneValidation.ok === true, 'standalone valid audio frame should pass');
assert(standaloneValidation.persisted === false, 'standalone validation must not persist');
assert(standaloneValidation.uploaded === false, 'standalone validation must not upload');

console.log(`Provider audio gate smoke passed: ${summarizeProviderAudioGate(localMock)}; ready=${ready.status}; dry_run=${dryRunOk.status}; failed=${dryRunFailed.status}; realtime=${realtimeExperimental.status}`);
