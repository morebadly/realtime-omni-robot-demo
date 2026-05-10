#!/usr/bin/env node
import {
  createDashScopeOmniRealtimeConfig,
  formatDashScopeOmniRealtimeChecklist,
  validateDashScopeOmniRealtimeConfig
} from './dashscope-omni-realtime-config.mjs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const defaults = createDashScopeOmniRealtimeConfig({});
assert(defaults.endpoint === 'wss://dashscope.aliyuncs.com/api-ws/v1/realtime', `unexpected default endpoint: ${defaults.endpoint}`);
assert(defaults.model === 'qwen3.5-omni-flash-realtime', `unexpected default model: ${defaults.model}`);
assert(defaults.url.endsWith('?model=qwen3.5-omni-flash-realtime'), `unexpected default url: ${defaults.url}`);
assert(validateDashScopeOmniRealtimeConfig(defaults).okForCloudRealtime === false, 'default config should require API key');

const ready = createDashScopeOmniRealtimeConfig({
  DASHSCOPE_API_KEY: 'sk-test',
  DASHSCOPE_OMNI_MODEL: 'qwen3-omni-flash-realtime',
  DASHSCOPE_OMNI_REGION: 'singapore'
});
const readyValidation = validateDashScopeOmniRealtimeConfig(ready);
assert(ready.endpoint === 'wss://dashscope-intl.aliyuncs.com/api-ws/v1/realtime', `unexpected singapore endpoint: ${ready.endpoint}`);
assert(ready.url === 'wss://dashscope-intl.aliyuncs.com/api-ws/v1/realtime?model=qwen3-omni-flash-realtime', `unexpected ready url: ${ready.url}`);
assert(readyValidation.okForCloudRealtime === true, `ready config should pass, issues=${readyValidation.issues.map((item) => item.code).join(',')}`);

const checklist = formatDashScopeOmniRealtimeChecklist(ready);
assert(checklist.hasApiKey === true, 'checklist should hide key and expose hasApiKey');
assert(checklist.requiredEnv.some((item) => item.name === 'DASHSCOPE_API_KEY'), 'checklist should include API key env');

console.log('DashScope Qwen-Omni realtime config smoke passed.');
