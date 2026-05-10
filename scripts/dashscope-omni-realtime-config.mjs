export const DASHSCOPE_OMNI_ENDPOINTS = {
  beijing: 'wss://dashscope.aliyuncs.com/api-ws/v1/realtime',
  singapore: 'wss://dashscope-intl.aliyuncs.com/api-ws/v1/realtime'
};

export const DASHSCOPE_OMNI_MODELS = [
  'qwen3.5-omni-plus-realtime',
  'qwen3.5-omni-flash-realtime',
  'qwen3-omni-flash-realtime'
];

export const DASHSCOPE_OMNI_ENV = [
  {
    name: 'DASHSCOPE_API_KEY',
    defaultValue: '',
    example: 'sk-...',
    required: true,
    description: 'DashScope / Alibaba Cloud Model Studio API key. Never commit it.'
  },
  {
    name: 'DASHSCOPE_OMNI_MODEL',
    defaultValue: 'qwen3.5-omni-flash-realtime',
    example: 'qwen3.5-omni-plus-realtime',
    required: true,
    description: 'Cloud Qwen-Omni realtime model id.'
  },
  {
    name: 'DASHSCOPE_OMNI_REGION',
    defaultValue: 'beijing',
    example: 'singapore',
    required: false,
    description: 'Endpoint region alias: beijing or singapore.'
  },
  {
    name: 'DASHSCOPE_OMNI_ENDPOINT',
    defaultValue: '',
    example: 'wss://dashscope.aliyuncs.com/api-ws/v1/realtime',
    required: false,
    description: 'Optional explicit realtime WebSocket endpoint override.'
  }
];

export function createDashScopeOmniRealtimeConfig(env = process.env) {
  const region = env.DASHSCOPE_OMNI_REGION || 'beijing';
  const endpoint = env.DASHSCOPE_OMNI_ENDPOINT || DASHSCOPE_OMNI_ENDPOINTS[region] || DASHSCOPE_OMNI_ENDPOINTS.beijing;
  const model = env.DASHSCOPE_OMNI_MODEL || 'qwen3.5-omni-flash-realtime';
  return {
    apiKey: env.DASHSCOPE_API_KEY || '',
    model,
    region,
    endpoint,
    url: `${endpoint}?model=${encodeURIComponent(model)}`,
    provider: 'dashscope_qwen_omni_realtime',
    transport: 'websocket_realtime'
  };
}

export function validateDashScopeOmniRealtimeConfig(config = createDashScopeOmniRealtimeConfig()) {
  const issues = [];
  if (!config.apiKey) {
    issues.push({
      code: 'dashscope_api_key_missing',
      severity: 'blocking',
      message: 'DASHSCOPE_API_KEY is required before opening the cloud realtime session.'
    });
  }
  if (!DASHSCOPE_OMNI_MODELS.includes(config.model)) {
    issues.push({
      code: 'dashscope_omni_model_unrecognized',
      severity: 'warning',
      message: `Model ${config.model} is not in the known Qwen-Omni realtime model list.`
    });
  }
  if (!/^wss:\/\/.+\/api-ws\/v1\/realtime$/i.test(config.endpoint)) {
    issues.push({
      code: 'dashscope_realtime_endpoint_invalid',
      severity: 'blocking',
      message: 'DashScope realtime endpoint should be a wss://.../api-ws/v1/realtime URL.'
    });
  }
  return {
    okForCloudRealtime: issues.every((item) => item.severity !== 'blocking'),
    issues
  };
}

export function formatDashScopeOmniRealtimeChecklist(config = createDashScopeOmniRealtimeConfig()) {
  const validation = validateDashScopeOmniRealtimeConfig(config);
  return {
    provider: config.provider,
    model: config.model,
    region: config.region,
    endpoint: config.endpoint,
    url: config.url,
    transport: config.transport,
    hasApiKey: Boolean(config.apiKey),
    okForCloudRealtime: validation.okForCloudRealtime,
    issues: validation.issues,
    requiredEnv: DASHSCOPE_OMNI_ENV
  };
}
