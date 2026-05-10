export const LOCALDEV_QWEN_TRANSPORTS = [
  'dry_run',
  'loopback',
  'websocket_json',
  'ws_json',
  'http_json'
];

export const LOCALDEV_QWEN_ENV = [
  {
    name: 'LOCALDEV_OMNI_PROVIDER',
    defaultValue: 'placeholder',
    example: 'qwen_omni',
    requiredForRealModel: true,
    description: 'Selects the LocalDev provider inside the adapter skeleton. Use qwen_omni for Qwen2.5/Qwen3/Qwen3.5 compatible Omni services.'
  },
  {
    name: 'LOCALDEV_QWEN_ENDPOINT',
    defaultValue: '',
    example: 'ws://127.0.0.1:8010/qwen/realtime',
    requiredForRealModel: true,
    description: 'Endpoint of the local Qwen-Omni compatible realtime service.'
  },
  {
    name: 'LOCALDEV_QWEN_TRANSPORT',
    defaultValue: 'http_json',
    example: 'websocket_json',
    requiredForRealModel: true,
    description: 'Transport used by the Qwen-Omni compatible provider. websocket_json is the current realtime carrier.'
  },
  {
    name: 'LOCALDEV_QWEN_TIMEOUT_MS',
    defaultValue: '15000',
    example: '30000',
    requiredForRealModel: false,
    description: 'Timeout for local model connection and output waits.'
  },
  {
    name: 'LOCALDEV_QWEN_DRY_RUN',
    defaultValue: '1',
    example: '0',
    requiredForRealModel: true,
    description: 'Must be 0 before a real local model request is sent.'
  },
  {
    name: 'LOCALDEV_ADAPTER_ENDPOINT',
    defaultValue: 'ws://127.0.0.1:8000/omni/realtime',
    example: 'ws://127.0.0.1:8000/omni/realtime',
    requiredForRealModel: false,
    description: 'Browser/Web Runtime endpoint for the LocalDev adapter skeleton.'
  }
];

function numberFromEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function createQwenProviderConfig(env = process.env) {
  return {
    endpoint: env.LOCALDEV_QWEN_ENDPOINT || '',
    transport: env.LOCALDEV_QWEN_TRANSPORT || 'http_json',
    timeoutMs: numberFromEnvFrom(env, 'LOCALDEV_QWEN_TIMEOUT_MS', 15000),
    dryRun: env.LOCALDEV_QWEN_DRY_RUN !== '0'
  };
}

function numberFromEnvFrom(env, name, fallback) {
  const value = Number(env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function createLocalDevServiceTargets(env = process.env) {
  return {
    adapter: env.LOCALDEV_ADAPTER_ENDPOINT || 'ws://127.0.0.1:8000/omni/realtime',
    qwen: env.LOCALDEV_QWEN_ENDPOINT || 'ws://127.0.0.1:8010/qwen/realtime'
  };
}

export function validateQwenProviderConfig(config = createQwenProviderConfig()) {
  const issues = [];
  if (!config.endpoint) {
    issues.push({
      code: 'qwen_endpoint_not_configured',
      severity: 'blocking',
      message: 'LOCALDEV_QWEN_ENDPOINT is required for a real local Omni service.'
    });
  }
  if (!LOCALDEV_QWEN_TRANSPORTS.includes(config.transport)) {
    issues.push({
      code: 'qwen_transport_unknown',
      severity: 'blocking',
      message: `LOCALDEV_QWEN_TRANSPORT=${config.transport} is not recognized.`
    });
  }
  if (config.dryRun) {
    issues.push({
      code: 'qwen_dry_run_enabled',
      severity: 'blocking',
      message: 'LOCALDEV_QWEN_DRY_RUN must be 0 before real model requests are sent.'
    });
  }
  if ((config.transport === 'websocket_json' || config.transport === 'ws_json') && config.endpoint && !/^wss?:\/\//.test(config.endpoint)) {
    issues.push({
      code: 'qwen_ws_endpoint_invalid',
      severity: 'blocking',
      message: 'websocket_json transport requires a ws:// or wss:// endpoint.'
    });
  }
  return {
    okForRealModel: issues.length === 0,
    issues
  };
}

export function formatQwenConfigChecklist(config = createQwenProviderConfig()) {
  const validation = validateQwenProviderConfig(config);
  return {
    provider: process.env.LOCALDEV_OMNI_PROVIDER || 'placeholder',
    endpoint: config.endpoint || 'not_configured',
    transport: config.transport,
    timeoutMs: config.timeoutMs,
    dryRun: config.dryRun,
    okForRealModel: validation.okForRealModel,
    issues: validation.issues,
    requiredEnv: LOCALDEV_QWEN_ENV
  };
}
