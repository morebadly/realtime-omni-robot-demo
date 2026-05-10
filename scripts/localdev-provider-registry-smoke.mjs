#!/usr/bin/env node
import { createLocalDevOmniProvider, listLocalDevProviderKeys } from './localdev-omni-provider-registry.mjs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const keys = listLocalDevProviderKeys();
assert(keys.includes('placeholder'), 'provider registry should include placeholder');
assert(keys.includes('qwen_omni'), 'provider registry should include qwen_omni');
assert(keys.includes('qwen_stub'), 'provider registry should keep qwen_stub compatibility alias');

const qwenOmni = createLocalDevOmniProvider('qwen_omni');
assert(qwenOmni.kind === 'qwen_omni', `qwen_omni provider kind mismatch: ${qwenOmni.kind}`);
assert(qwenOmni.name === 'qwen_omni_compatible_provider', `qwen_omni provider name mismatch: ${qwenOmni.name}`);
assert(qwenOmni.fallbackUsed === false, 'qwen_omni should not fallback');

const qwenStubAlias = createLocalDevOmniProvider('qwen_stub');
assert(qwenStubAlias.kind === 'qwen_omni', `qwen_stub alias should map to qwen_omni kind, got ${qwenStubAlias.kind}`);
assert(qwenStubAlias.fallbackUsed === false, 'qwen_stub alias should not fallback');

const unknown = createLocalDevOmniProvider('not_a_provider');
assert(unknown.fallbackUsed === true, 'unknown provider should fallback to placeholder');

console.log(`LocalDev provider registry smoke passed: ${keys.join(', ')}`);
