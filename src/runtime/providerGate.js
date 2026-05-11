export const PROVIDER_IDS = [
  'localdev_mock',
  'dashscope_qwen_omni',
  'custom_realtime_omni'
];

export const PROVIDER_MODES = [
  'mock',
  'health_check_only',
  'handshake_only',
  'realtime_experimental'
];

export const DEFAULT_PROVIDER_SAFETY = {
  mockFallbackRequired: true,
  visibleContextRequired: true,
  permissionGateRequired: true
};

const REAL_PROVIDER_IDS = new Set(['dashscope_qwen_omni', 'custom_realtime_omni']);
const VALID_FALLBACK_PROVIDERS = new Set(PROVIDER_IDS);

function toBoolean(value, defaultValue = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on', 'enabled'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off', 'disabled', ''].includes(normalized)) return false;
  }
  return defaultValue;
}

function hasConfiguredValue(value) {
  if (!value || typeof value !== 'string') return false;
  const normalized = value.trim();
  if (!normalized) return false;
  return !/example\.com|sk-\.\.\.|placeholder|changeme/i.test(normalized);
}

export function getProviderIdForAdapterMode(mode) {
  if (mode === 'local_dev' || mode === 'offline_pet') return 'localdev_mock';
  if (mode === 'wifi_cloud' || mode === 'cellular_cloud') return 'dashscope_qwen_omni';
  if (mode === 'self_hosted_cloud') return 'custom_realtime_omni';
  return 'localdev_mock';
}

export function createDefaultProviderConfig(mode = 'local_dev', adapter = {}) {
  const providerId = getProviderIdForAdapterMode(mode);
  const isRealProvider = REAL_PROVIDER_IDS.has(providerId);
  return normalizeProviderConfig({
    providerId,
    enabled: false,
    mode: isRealProvider ? 'health_check_only' : 'mock',
    endpointConfigured: !isRealProvider && hasConfiguredValue(adapter.endpoint),
    apiKeyConfigured: false,
    allowAudioUpload: false,
    allowCameraUpload: false,
    allowRealtimeBilling: false,
    fallbackProviderId: 'localdev_mock',
    safety: DEFAULT_PROVIDER_SAFETY
  }, adapter);
}

export function normalizeProviderConfig(config = {}, adapter = {}) {
  const providerId = PROVIDER_IDS.includes(config.providerId)
    ? config.providerId
    : getProviderIdForAdapterMode(adapter.key);
  const isRealProvider = REAL_PROVIDER_IDS.has(providerId);
  const mode = PROVIDER_MODES.includes(config.mode)
    ? config.mode
    : isRealProvider ? 'health_check_only' : 'mock';
  const fallbackProviderId = VALID_FALLBACK_PROVIDERS.has(config.fallbackProviderId)
    ? config.fallbackProviderId
    : 'localdev_mock';

  return {
    providerId,
    enabled: toBoolean(config.enabled, false),
    mode,
    endpointConfigured: typeof config.endpointConfigured === 'boolean'
      ? config.endpointConfigured
      : hasConfiguredValue(adapter.endpoint),
    apiKeyConfigured: typeof config.apiKeyConfigured === 'boolean'
      ? config.apiKeyConfigured
      : hasConfiguredValue(adapter.apiKey),
    allowAudioUpload: toBoolean(config.allowAudioUpload, false),
    allowCameraUpload: toBoolean(config.allowCameraUpload, false),
    allowRealtimeBilling: toBoolean(config.allowRealtimeBilling, false),
    fallbackProviderId,
    safety: {
      ...DEFAULT_PROVIDER_SAFETY,
      ...(config.safety || {})
    }
  };
}

export function createProviderConfigFromEnv(env = (typeof process !== 'undefined' ? process.env : {})) {
  return normalizeProviderConfig({
    providerId: env.OMNI_PROVIDER || 'localdev_mock',
    enabled: env.OMNI_PROVIDER_ENABLED,
    mode: env.OMNI_PROVIDER_MODE || 'mock',
    endpointConfigured: hasConfiguredValue(env.OMNI_PROVIDER_ENDPOINT || ''),
    apiKeyConfigured: hasConfiguredValue(env.OMNI_PROVIDER_API_KEY || ''),
    allowAudioUpload: env.OMNI_ALLOW_AUDIO_UPLOAD,
    allowCameraUpload: env.OMNI_ALLOW_CAMERA_UPLOAD,
    allowRealtimeBilling: env.OMNI_ALLOW_REALTIME_BILLING,
    fallbackProviderId: env.OMNI_FALLBACK_PROVIDER || 'localdev_mock',
    safety: DEFAULT_PROVIDER_SAFETY
  });
}

export function evaluateProviderGate(input = {}) {
  const adapter = input.adapter || {};
  const config = normalizeProviderConfig(input.providerConfig || adapter.providerConfig, adapter);
  const isRealProvider = REAL_PROVIDER_IDS.has(config.providerId);
  const reasons = [];

  if (!VALID_FALLBACK_PROVIDERS.has(config.fallbackProviderId)) {
    reasons.push('fallback_provider_invalid');
  }
  if (config.safety.mockFallbackRequired && config.fallbackProviderId !== 'localdev_mock') {
    reasons.push('mock_fallback_required');
  }

  if (!isRealProvider) {
    return {
      ...config,
      isRealProvider: false,
      status: 'mock_ready',
      blocked: false,
      blockReasons: reasons,
      canHealthCheck: false,
      canHandshake: false,
      canRealtime: false,
      canUploadAudio: false,
      canUploadCamera: false,
      visibleSummary: 'LocalDev Mock is active. No real cloud upload is enabled.'
    };
  }

  if (!config.enabled) reasons.push('provider_disabled');
  if (!config.endpointConfigured) reasons.push('endpoint_not_configured');
  if (!config.apiKeyConfigured) reasons.push('api_key_not_configured');
  if (!config.safety.permissionGateRequired) reasons.push('permission_gate_required');
  if (!config.safety.visibleContextRequired) reasons.push('visible_context_required');

  const canHealthCheck = config.enabled
    && config.endpointConfigured
    && config.apiKeyConfigured
    && config.mode === 'health_check_only'
    && reasons.length === 0;
  const canHandshake = config.enabled
    && config.endpointConfigured
    && config.apiKeyConfigured
    && config.mode === 'handshake_only'
    && reasons.length === 0;
  const canRealtime = config.enabled
    && config.endpointConfigured
    && config.apiKeyConfigured
    && config.mode === 'realtime_experimental'
    && config.allowRealtimeBilling
    && reasons.length === 0;

  if (config.mode === 'realtime_experimental' && !config.allowRealtimeBilling) {
    reasons.push('realtime_billing_not_allowed');
  }
  if (!config.allowAudioUpload) reasons.push('audio_upload_not_allowed');
  if (!config.allowCameraUpload) reasons.push('camera_upload_not_allowed');

  return {
    ...config,
    isRealProvider: true,
    status: canRealtime ? 'realtime_allowed' : canHandshake ? 'handshake_only' : canHealthCheck ? 'health_check_only' : 'blocked',
    blocked: !canRealtime,
    blockReasons: [...new Set(reasons)],
    canHealthCheck,
    canHandshake,
    canRealtime,
    canUploadAudio: canRealtime && config.allowAudioUpload,
    canUploadCamera: canRealtime && config.allowCameraUpload,
    visibleSummary: 'Real provider traffic is blocked unless feature flags, permission gates, visible context, fallback, and upload flags are all explicit.'
  };
}

export function summarizeProviderGate(gate = evaluateProviderGate()) {
  const blocked = gate.blockReasons?.length ? gate.blockReasons.join(', ') : 'none';
  return `${gate.providerId}/${gate.mode}: ${gate.status}; audio=${gate.canUploadAudio ? 'allowed' : 'blocked'}; camera=${gate.canUploadCamera ? 'allowed' : 'blocked'}; billing=${gate.allowRealtimeBilling ? 'allowed' : 'blocked'}; reasons=${blocked}`;
}
