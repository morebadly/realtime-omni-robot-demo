#!/usr/bin/env node
import { evaluateProviderGate, normalizeProviderConfig } from '../src/runtime/providerGate.js';
import { createProviderCameraGate, summarizeProviderCameraGate, validateDryRunCameraFrame } from '../src/runtime/providerCameraGate.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function gate(seed, cameraFrame = null) {
  const providerConfig = normalizeProviderConfig(seed);
  const providerGate = evaluateProviderGate({ providerConfig });
  return createProviderCameraGate({ providerGate, cameraFrame });
}

function assertAlwaysSafe(item, label) {
  assert(item.canSendRealCamera === false, `${label}: canSendRealCamera must stay false`);
  assert(item.canSendAudio === false, `${label}: canSendAudio must stay false`);
  assert(item.canStartRealtime === false, `${label}: canStartRealtime must stay false`);
  assert(item.canStartBillingSession === false, `${label}: canStartBillingSession must stay false`);
  assert(item.fallbackProviderId === 'localdev_mock', `${label}: fallback must remain localdev_mock`);
}

const validCameraFrame = {
  schema: 'omni.camera_frame.v1',
  media: {
    kind: 'camera',
    codec: 'image/jpeg',
    width: 320,
    height: 240,
    payloadIncluded: true,
    payloadEncoding: 'base64',
    byteLength: 16,
    payload: '/9j/AAAAAAAABBBB'
  }
};

const invalidCameraFrame = {
  schema: 'omni.camera_frame.v1',
  media: {
    codec: 'image/png',
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
assert(localMock.status === 'mock_not_required', `localdev_mock should not need camera gate, got ${localMock.status}`);
assert(localMock.canSendDryRunCameraPayload === false, 'localdev_mock should not claim provider dry-run camera upload');
assertAlwaysSafe(localMock, 'localMock');

const disabled = gate({
  providerId: 'dashscope_qwen_omni',
  enabled: false,
  mode: 'camera_dry_run',
  endpointConfigured: true,
  apiKeyConfigured: true,
  allowCameraUpload: true,
  fallbackProviderId: 'localdev_mock'
});
assert(disabled.status === 'disabled', `disabled provider should be disabled, got ${disabled.status}`);
assertAlwaysSafe(disabled, 'disabled');

const missingEndpoint = gate({
  providerId: 'dashscope_qwen_omni',
  enabled: true,
  mode: 'camera_dry_run',
  endpointConfigured: false,
  apiKeyConfigured: true,
  allowCameraUpload: true,
  fallbackProviderId: 'localdev_mock'
});
assert(missingEndpoint.status === 'unconfigured', `missing endpoint should be unconfigured, got ${missingEndpoint.status}`);
assert(missingEndpoint.reasons.includes('endpoint_not_configured'), 'missing endpoint reason should be visible');
assertAlwaysSafe(missingEndpoint, 'missingEndpoint');

const missingApiKey = gate({
  providerId: 'dashscope_qwen_omni',
  enabled: true,
  mode: 'camera_dry_run',
  endpointConfigured: true,
  apiKeyConfigured: false,
  allowCameraUpload: true,
  fallbackProviderId: 'localdev_mock'
});
assert(missingApiKey.status === 'unconfigured', `missing API key should be unconfigured, got ${missingApiKey.status}`);
assert(missingApiKey.reasons.includes('api_key_not_configured'), 'missing API key reason should be visible');
assertAlwaysSafe(missingApiKey, 'missingApiKey');

const cameraBlocked = gate({
  providerId: 'dashscope_qwen_omni',
  enabled: true,
  mode: 'camera_dry_run',
  endpointConfigured: true,
  apiKeyConfigured: true,
  allowCameraUpload: false,
  fallbackProviderId: 'localdev_mock'
});
assert(cameraBlocked.status === 'blocked', `allowCameraUpload=false should block, got ${cameraBlocked.status}`);
assert(cameraBlocked.reasons.includes('camera_upload_not_allowed'), 'provider gate reason should include camera_upload_not_allowed');
assert(cameraBlocked.reasons.includes('allow_camera_upload_required'), 'camera gate reason should include allow_camera_upload_required');
assertAlwaysSafe(cameraBlocked, 'cameraBlocked');

const ready = gate({
  providerId: 'dashscope_qwen_omni',
  enabled: true,
  mode: 'camera_dry_run',
  endpointConfigured: true,
  apiKeyConfigured: true,
  allowCameraUpload: true,
  allowAudioUpload: false,
  allowRealtimeBilling: false,
  fallbackProviderId: 'localdev_mock'
});
assert(ready.status === 'ready_for_camera_dry_run', `ready provider should be ready_for_camera_dry_run, got ${ready.status}`);
assert(ready.canSendDryRunCameraPayload === true, 'ready dry-run should allow local camera validation payload');
assertAlwaysSafe(ready, 'ready');

const dryRunOk = gate({
  providerId: 'dashscope_qwen_omni',
  enabled: true,
  mode: 'camera_dry_run',
  endpointConfigured: true,
  apiKeyConfigured: true,
  allowCameraUpload: true,
  fallbackProviderId: 'localdev_mock'
}, validCameraFrame);
assert(dryRunOk.status === 'camera_dry_run_ok', `valid dry-run should pass, got ${dryRunOk.status}`);
assert(dryRunOk.dryRunValidation.ok === true, 'valid camera payload should validate');
assert(dryRunOk.dryRunValidation.uploaded === false, 'dry-run validation must not upload');
assert(dryRunOk.dryRunValidation.sentToProvider === false, 'dry-run validation must not send to provider');
assertAlwaysSafe(dryRunOk, 'dryRunOk');

const dryRunFailed = gate({
  providerId: 'dashscope_qwen_omni',
  enabled: true,
  mode: 'camera_dry_run',
  endpointConfigured: true,
  apiKeyConfigured: true,
  allowCameraUpload: true,
  fallbackProviderId: 'localdev_mock'
}, invalidCameraFrame);
assert(dryRunFailed.status === 'camera_dry_run_failed', `invalid dry-run should fail, got ${dryRunFailed.status}`);
assert(dryRunFailed.dryRunValidation.ok === false, 'invalid camera payload should fail validation');
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
assert(realtimeExperimental.reasons.includes('camera_dry_run_mode_required'), 'realtime experimental should require camera_dry_run mode');
assertAlwaysSafe(realtimeExperimental, 'realtimeExperimental');

const badFallback = gate({
  providerId: 'custom_realtime_omni',
  enabled: true,
  mode: 'camera_dry_run',
  endpointConfigured: true,
  apiKeyConfigured: true,
  allowCameraUpload: true,
  fallbackProviderId: 'custom_realtime_omni'
});
assert(badFallback.status === 'blocked', `bad fallback should block, got ${badFallback.status}`);
assert(badFallback.reasons.includes('mock_fallback_required'), 'bad fallback should require localdev_mock');

const standaloneValidation = validateDryRunCameraFrame(validCameraFrame);
assert(standaloneValidation.ok === true, 'standalone valid camera frame should pass');
assert(standaloneValidation.persisted === false, 'standalone validation must not persist');
assert(standaloneValidation.uploaded === false, 'standalone validation must not upload');

console.log(`Provider camera gate smoke passed: ${summarizeProviderCameraGate(localMock)}; ready=${ready.status}; dry_run=${dryRunOk.status}; failed=${dryRunFailed.status}; realtime=${realtimeExperimental.status}`);
