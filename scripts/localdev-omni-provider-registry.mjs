import { createPlaceholderOmniProvider } from './localdev-omni-placeholder-provider.mjs';
import { createQwenOmniProviderStub } from './localdev-omni-qwen-provider-stub.mjs';

const PROVIDERS = {
  placeholder: createPlaceholderOmniProvider,
  qwen_stub: createQwenOmniProviderStub
};

export function listLocalDevProviderKeys() {
  return Object.keys(PROVIDERS);
}

export function createLocalDevOmniProvider(key = process.env.LOCALDEV_OMNI_PROVIDER || 'placeholder') {
  const normalized = String(key || 'placeholder').trim().toLowerCase();
  const factory = PROVIDERS[normalized] || PROVIDERS.placeholder;
  const provider = factory();
  return {
    ...provider,
    selectedKey: normalized,
    fallbackUsed: !PROVIDERS[normalized]
  };
}
