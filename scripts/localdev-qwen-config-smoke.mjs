#!/usr/bin/env node
import {
  createLocalDevServiceTargets,
  createQwenProviderConfig,
  formatQwenConfigChecklist,
  validateQwenProviderConfig
} from './localdev-qwen-config.mjs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const defaults = createQwenProviderConfig({});
assert(defaults.endpoint === '', `unexpected default endpoint: ${defaults.endpoint}`);
assert(defaults.transport === 'http_json', `unexpected default transport: ${defaults.transport}`);
assert(defaults.timeoutMs === 15000, `unexpected default timeout: ${defaults.timeoutMs}`);
assert(defaults.dryRun === true, 'default should be dry-run');

const invalid = validateQwenProviderConfig(defaults);
assert(invalid.okForRealModel === false, 'default config must not be real-model ready');
assert(invalid.issues.some((item) => item.code === 'qwen_endpoint_not_configured'), 'default config should require endpoint');
assert(invalid.issues.some((item) => item.code === 'qwen_dry_run_enabled'), 'default config should block dry-run');

const ready = createQwenProviderConfig({
  LOCALDEV_QWEN_ENDPOINT: 'ws://127.0.0.1:8010/qwen/realtime',
  LOCALDEV_QWEN_TRANSPORT: 'websocket_json',
  LOCALDEV_QWEN_TIMEOUT_MS: '30000',
  LOCALDEV_QWEN_DRY_RUN: '0'
});
assert(validateQwenProviderConfig(ready).okForRealModel === true, 'websocket_json config should be real-model ready');

const targets = createLocalDevServiceTargets({});
assert(targets.adapter === 'ws://127.0.0.1:8000/omni/realtime', `unexpected adapter target: ${targets.adapter}`);
assert(targets.qwen === 'ws://127.0.0.1:8010/qwen/realtime', `unexpected qwen target: ${targets.qwen}`);

const checklist = formatQwenConfigChecklist(ready);
assert(checklist.okForRealModel === true, 'checklist should reflect ready config');
assert(checklist.requiredEnv.some((item) => item.name === 'LOCALDEV_QWEN_ENDPOINT'), 'checklist should include endpoint env');

console.log('LocalDev Qwen config smoke passed.');
