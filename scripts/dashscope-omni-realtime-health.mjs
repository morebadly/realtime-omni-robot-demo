#!/usr/bin/env node
import {
  createDashScopeOmniRealtimeConfig,
  formatDashScopeOmniRealtimeChecklist,
  validateDashScopeOmniRealtimeConfig
} from './dashscope-omni-realtime-config.mjs';
import { evaluateProviderGate, normalizeProviderConfig } from '../src/runtime/providerGate.js';
import { createProviderHealthCheck, summarizeProviderHealthCheck } from '../src/runtime/providerHealthCheck.js';

const config = createDashScopeOmniRealtimeConfig();
const checklist = formatDashScopeOmniRealtimeChecklist(config);
const validation = validateDashScopeOmniRealtimeConfig(config);
const providerGate = evaluateProviderGate({
  providerConfig: normalizeProviderConfig({
    providerId: 'dashscope_qwen_omni',
    enabled: process.env.OMNI_PROVIDER_ENABLED || 'false',
    mode: process.env.OMNI_PROVIDER_MODE || 'health_check_only',
    endpointConfigured: Boolean(config.endpoint),
    apiKeyConfigured: Boolean(config.apiKey),
    allowAudioUpload: false,
    allowCameraUpload: false,
    allowRealtimeBilling: false,
    fallbackProviderId: process.env.OMNI_FALLBACK_PROVIDER || 'localdev_mock'
  })
});
const health = createProviderHealthCheck({ providerGate });

if (!validation.okForCloudRealtime) {
  console.log('DashScope Qwen-Omni realtime config is not ready for health check:');
  for (const issue of validation.issues) {
    console.log(`- ${issue.code}: ${issue.message}`);
  }
  console.log('Current checklist:');
  console.log(JSON.stringify({ ...checklist, hasApiKey: Boolean(config.apiKey), providerHealth: health }, null, 2));
} else {
  console.log(`dry_run\tdashscope_qwen_omni\t${config.model}\t${config.url}`);
  console.log(summarizeProviderHealthCheck(health));
}

console.log('No WebSocket realtime session was opened; no audio, camera, billing, or TTS path was started.');
