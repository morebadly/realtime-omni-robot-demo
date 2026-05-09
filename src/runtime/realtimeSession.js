export function createDefaultRealtimeSession() {
  return {
    active: false,
    micActive: false,
    startedAt: null,
    route: 'not_connected',
    audioInput: 'raw_audio_stream_disabled',
    asrUsage: 'subtitles_logs_debug_only',
    level: 0,
    sampleRate: null,
    lastUpdatedAt: '未启动'
  };
}

export function buildRealtimeRoute({ mode, adapter, connection, voiceCloudAllowed }) {
  if (mode === 'offline_pet' || connection?.status === 'offline') {
    return {
      route: 'offline_pet_engine',
      canStream: false,
      label: '离线基础宠物模式',
      detail: '不连接 Omni；仅触摸、NFC、表情和基础插件。'
    };
  }

  if (mode === 'local_dev') {
    return {
      route: 'local_dev_omni',
      canStream: true,
      label: adapter?.name || 'LocalDevOmniAdapter',
      detail: '原始音频流进入本地调试 Adapter；ASR 只用于字幕/日志/调试。'
    };
  }

  if (!voiceCloudAllowed) {
    return {
      route: 'blocked_by_permission',
      canStream: false,
      label: '云端语音上传已关闭',
      detail: '权限中心关闭 voice.cloud_upload，Runtime 不应把原始音频流发给云端。'
    };
  }

  return {
    route: 'cloud_omni_realtime',
    canStream: true,
    label: adapter?.name || 'CloudOmniAdapter',
    detail: `${connection?.transport || 'Cloud Realtime'}；主输入为原始音频流，不只传 ASR 文本。`
  };
}
