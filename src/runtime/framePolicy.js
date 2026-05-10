export function getFramePolicy({ mode, state, cameraDemand, connection }) {
  const offline = mode === 'offline_pet' || connection?.status === 'offline';
  const cellular = mode === 'cellular_cloud';
  const visualQuery = cameraDemand === 'high_res_current_plus_recent';
  const eventBurst = cameraDemand === 'event_burst';
  const speakingOrListening = state === 'speaking' || state === 'listening';

  if (offline) {
    return {
      key: 'offline_local_only',
      label: '离线：本地预览，不上传 Omni',
      cadence: 'local only',
      intervalMs: 1400,
      captureWidth: 480,
      jpegQuality: 0.78,
      upload: 'none',
      cloudAllowed: false,
      rationale: '离线宠物模式只保留本地表情、触摸、NFC 和预设动作。'
    };
  }

  if (visualQuery) {
    return {
      key: 'visual_query_high_res',
      label: '视觉问答：高清当前帧 + 最近几帧',
      cadence: 'burst high-res',
      intervalMs: cellular ? 420 : 260,
      captureWidth: cellular ? 960 : 1280,
      jpegQuality: 0.95,
      upload: 'current_plus_recent',
      cloudAllowed: true,
      rationale: '用户明确询问视觉内容时，Frame Selector 选择高清当前帧和最近缓存帧交给 Omni。'
    };
  }

  if (eventBurst) {
    return {
      key: 'event_burst',
      label: '交互事件 burst：短时间提高关键帧频率',
      cadence: 'burst',
      intervalMs: cellular ? 900 : 320,
      captureWidth: cellular ? 480 : 720,
      jpegQuality: 0.86,
      upload: cellular ? 'low_rate_if_allowed' : 'adaptive_if_allowed',
      cloudAllowed: true,
      rationale: '触摸/NFC/明显交互只作为事实事件，同时短时间提高关键帧采样，不推断用户情绪。'
    };
  }

  if (cellular) {
    return {
      key: 'cellular_audio_first',
      label: '蜂窝：音频优先，关键帧低频或按需',
      cadence: '0.3-0.6fps',
      intervalMs: connection?.status === 'degraded' ? 2600 : 1800,
      captureWidth: 360,
      jpegQuality: 0.8,
      upload: 'low_rate_or_on_demand',
      cloudAllowed: true,
      rationale: '移动网络下节省流量和延迟预算，实时音频优先，视觉关键帧按策略降频。'
    };
  }

  if (speakingOrListening) {
    return {
      key: 'speaking_2_5fps',
      label: '说话/聆听：2-5fps 关键帧',
      cadence: '2-5fps',
      intervalMs: connection?.status === 'degraded' ? 650 : 420,
      captureWidth: 640,
      jpegQuality: 0.86,
      upload: 'adaptive_if_allowed',
      cloudAllowed: mode !== 'local_dev',
      rationale: '实时对话中使用较高关键帧频率，但不在前端生成视觉情绪摘要。'
    };
  }

  return {
    key: 'idle_1fps',
    label: '待机：1fps 关键帧缓存',
    cadence: '1fps',
    intervalMs: connection?.status === 'degraded' ? 1400 : 1000,
    captureWidth: 640,
    jpegQuality: 0.84,
    upload: mode === 'local_dev' ? 'local_debug_only' : 'low_rate_if_allowed',
    cloudAllowed: mode !== 'local_dev',
    rationale: '待机时只维护最近几秒缓存，减少无意义上传。'
  };
}
