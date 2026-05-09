export const NETWORK_PROFILES = {
  local_dev: {
    key: 'local_dev',
    label: '本地调试网络',
    connection: 'local_loopback',
    transport: 'Localhost / LAN',
    latencyMs: 18,
    jitterMs: 4,
    packetLoss: 0,
    signal: 100,
    uploadBudget: 'unlimited_local',
    audioPriority: 'realtime_raw_audio',
    frameStrategy: 'local_debug_frame_buffer',
    cloudUpload: false,
    description: '开发机本地调试，音频/关键帧进入 LocalDevOmniAdapter，不上传公网云端。'
  },
  wifi_cloud: {
    key: 'wifi_cloud',
    label: 'Wi‑Fi 云端主体验',
    connection: 'wifi',
    transport: 'Wi‑Fi + Cloud Realtime',
    latencyMs: 62,
    jitterMs: 13,
    packetLoss: 0.4,
    signal: 92,
    uploadBudget: 'normal',
    audioPriority: 'realtime_raw_audio',
    frameStrategy: 'adaptive_keyframes',
    cloudUpload: true,
    description: '家庭/办公室主体验，允许更稳定的实时音频与关键帧上传。'
  },
  cellular_cloud: {
    key: 'cellular_cloud',
    label: 'eSIM / 实体 SIM 移动模式',
    connection: 'cellular',
    transport: 'Cellular + Cloud Realtime',
    latencyMs: 115,
    jitterMs: 32,
    packetLoss: 1.6,
    signal: 76,
    uploadBudget: 'conservative',
    audioPriority: 'audio_first',
    frameStrategy: 'low_rate_or_on_demand',
    cloudUpload: true,
    description: '外出移动体验，音频优先；关键帧低频或用户明确询问时上传高清。'
  },
  self_hosted_cloud: {
    key: 'self_hosted_cloud',
    label: '自建云 Omni Gateway',
    connection: 'wifi_or_wan',
    transport: 'Robot Gateway + Self Hosted Cloud',
    latencyMs: 78,
    jitterMs: 18,
    packetLoss: 0.7,
    signal: 88,
    uploadBudget: 'tenant_policy',
    audioPriority: 'realtime_raw_audio',
    frameStrategy: 'gateway_policy',
    cloudUpload: true,
    description: '后期自建云服务，由租户策略控制上传、日志、模型路由和工具权限。'
  },
  offline_pet: {
    key: 'offline_pet',
    label: '离线基础宠物模式',
    connection: 'offline',
    transport: 'On-device Preset Runtime',
    latencyMs: 0,
    jitterMs: 0,
    packetLoss: 0,
    signal: 0,
    uploadBudget: 'none',
    audioPriority: 'local_events_only',
    frameStrategy: 'no_cloud_frames',
    cloudUpload: false,
    description: '无网络时只保留表情、触摸、NFC、预设动作和基础插件。'
  }
};

export const NETWORK_QUALITY_PRESETS = [
  {
    key: 'stable',
    label: '稳定',
    latencyDelta: 0,
    jitterDelta: 0,
    packetLossDelta: 0,
    signalDelta: 0,
    note: '网络状态正常。'
  },
  {
    key: 'busy',
    label: '拥塞',
    latencyDelta: 55,
    jitterDelta: 22,
    packetLossDelta: 1.2,
    signalDelta: -12,
    note: '网络拥塞：保持原始音频优先，降低关键帧频率。'
  },
  {
    key: 'poor',
    label: '较差',
    latencyDelta: 130,
    jitterDelta: 64,
    packetLossDelta: 3.5,
    signalDelta: -34,
    note: '网络较差：进入音频优先；关键帧仅低频或按需。'
  },
  {
    key: 'offline',
    label: '断网',
    latencyDelta: 0,
    jitterDelta: 0,
    packetLossDelta: 100,
    signalDelta: -100,
    note: '断网：建议 Runtime 切换到基础宠物模式。'
  }
];

export function getNetworkProfile(mode = 'local_dev') {
  return NETWORK_PROFILES[mode] || NETWORK_PROFILES.local_dev;
}

export function applyNetworkQuality(profile, qualityKey = 'stable') {
  const preset = NETWORK_QUALITY_PRESETS.find((item) => item.key === qualityKey) || NETWORK_QUALITY_PRESETS[0];
  const offline = preset.key === 'offline' || profile.key === 'offline_pet';
  return {
    ...profile,
    quality: preset.key,
    qualityLabel: preset.label,
    qualityNote: preset.note,
    online: !offline,
    latencyMs: offline ? null : Math.max(0, profile.latencyMs + preset.latencyDelta),
    jitterMs: offline ? null : Math.max(0, profile.jitterMs + preset.jitterDelta),
    packetLoss: offline ? 100 : Math.min(100, Number((profile.packetLoss + preset.packetLossDelta).toFixed(1))),
    signal: offline ? 0 : Math.max(0, Math.min(100, profile.signal + preset.signalDelta))
  };
}

export function buildConnectionSnapshot(mode, qualityKey = 'stable') {
  const profile = applyNetworkQuality(getNetworkProfile(mode), qualityKey);
  const shouldDegrade = profile.online && (profile.packetLoss > 2 || profile.latencyMs > 160 || profile.quality === 'poor');
  return {
    ...profile,
    status: profile.online ? (shouldDegrade ? 'degraded' : 'connected') : 'offline',
    degradeReason: shouldDegrade ? 'latency_or_packet_loss_high' : null,
    recommendedMode: profile.online ? mode : 'offline_pet',
    cloudRoute: profile.cloudUpload ? 'cloud_omni_realtime' : 'local_or_offline_runtime',
    audioRoute: profile.online ? profile.audioPriority : 'offline_presets_only'
  };
}
