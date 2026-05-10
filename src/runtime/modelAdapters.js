import { getConnectionNetworkLabel } from './connectionModes';

export const MODEL_ADAPTERS = [
  {
    key: 'local_dev',
    name: 'LocalDevOmniAdapter',
    mode: '开发阶段',
    providerLabel: '本地 Qwen-Omni 兼容调试服务',
    endpoint: 'ws://127.0.0.1:8000/omni/realtime',
    modelId: 'qwen2.5-omni-local-dev',
    apiKey: '',
    transport: 'Local WebSocket / HTTP',
    input: '原始音频流 + 摄像头关键帧 + 事实事件',
    upload: '本地调试，不上传公网云端',
    capabilities: ['audio_in', 'audio_out', 'image_frame', 'interrupt', 'tool_intent'],
    editable: true
  },
  {
    key: 'wifi_cloud',
    name: 'ThirdPartyCloudOmniAdapter',
    mode: '在家主体验',
    providerLabel: '第三方云端 Omni API',
    endpoint: 'wss://api.example.com/v1/realtime',
    modelId: 'cloud-omni-realtime',
    apiKey: '',
    transport: 'Wi-Fi + Cloud Realtime API',
    input: '原始音频流优先，关键帧按策略上传',
    upload: '需要开启 voice.cloud_upload / camera.cloud_upload',
    capabilities: ['audio_in', 'audio_out', 'image_frame', 'tool_intent', 'interrupt'],
    editable: true
  },
  {
    key: 'cellular_cloud',
    name: 'ThirdPartyCloudOmniAdapter',
    mode: '出门移动体验',
    providerLabel: '第三方云端 Omni API（蜂窝网络策略）',
    endpoint: 'wss://api.example.com/v1/realtime',
    modelId: 'cloud-omni-realtime-mobile',
    apiKey: '',
    transport: 'eSIM / Physical SIM + Cloud Realtime API',
    input: '音频优先，关键帧低频或按需高清',
    upload: '蜂窝网络节流，按需上传关键帧',
    capabilities: ['audio_in', 'audio_out', 'low_rate_image_frame', 'tool_intent', 'interrupt'],
    editable: true
  },
  {
    key: 'self_hosted_cloud',
    name: 'SelfHostedCloudOmniAdapter',
    mode: '后期自建云服务',
    providerLabel: '自建 Omni Gateway',
    endpoint: 'wss://omni-gateway.example.com/robots/realtime',
    modelId: 'self-hosted-omni',
    apiKey: '',
    transport: 'Robot Gateway + Self-hosted Omni Service',
    input: '统一 Omni 输入协议',
    upload: '由自建云权限和租户策略控制',
    capabilities: ['audio_in', 'audio_out', 'image_frame', 'video_frame', 'tool_intent', 'interrupt'],
    editable: true
  },
  {
    key: 'offline_pet',
    name: 'OfflinePetEngine',
    mode: '无网络基础宠物模式',
    providerLabel: '本体规则引擎',
    endpoint: 'on-device://offline-pet-engine',
    modelId: 'preset-rules-v1',
    apiKey: '',
    transport: 'On-device Preset Runtime',
    input: '触摸 / NFC / 预设动作 / 基础插件',
    upload: '不上云',
    capabilities: ['touch_event', 'nfc_event', 'preset_expression', 'preset_motion'],
    editable: false
  }
];

export function createDefaultAdapterProfiles() {
  return Object.fromEntries(MODEL_ADAPTERS.map((adapter) => [adapter.key, { ...adapter, capabilities: [...adapter.capabilities] }]));
}

export function getAdapterForMode(mode, profiles) {
  const defaultAdapter = MODEL_ADAPTERS.find((adapter) => adapter.key === mode) || MODEL_ADAPTERS[0];
  const profile = profiles?.[mode];
  if (!profile) return defaultAdapter;
  return { ...defaultAdapter, ...profile, capabilities: profile.capabilities || defaultAdapter.capabilities };
}

export function getNetworkLabel(mode) {
  return getConnectionNetworkLabel(mode);
}
