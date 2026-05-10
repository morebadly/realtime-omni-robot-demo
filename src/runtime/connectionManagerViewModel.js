import { NETWORK_QUALITY_PRESETS } from './networkManager.js';

export function metricValue(value, suffix = '') {
  if (value === null || value === undefined) return '-';
  return `${value}${suffix}`;
}

export function buildConnectionManagerViewModel({ connection, framePolicy, quality }) {
  return {
    title: 'Network / Connection Manager',
    subtitle: 'Runtime 管理 Wi-Fi、蜂窝、自建云、本地调试、离线降级和关键帧节流策略。',
    status: connection?.status || 'unknown',
    metrics: [
      {
        key: 'mode',
        label: '连接方式',
        value: connection?.label || '-',
        detail: connection?.transport || '-'
      },
      {
        key: 'latency',
        label: '延迟',
        value: metricValue(connection?.latencyMs, 'ms'),
        detail: `jitter ${metricValue(connection?.jitterMs, 'ms')}`
      },
      {
        key: 'packet_loss',
        label: '丢包',
        value: metricValue(connection?.packetLoss, '%'),
        detail: `signal ${metricValue(connection?.signal, '%')}`
      },
      {
        key: 'upload_budget',
        label: '上传预算',
        value: connection?.uploadBudget || '-',
        detail: connection?.audioRoute || '-'
      }
    ],
    strategy: {
      label: '策略说明：',
      description: connection?.description || '-',
      qualityNote: connection?.qualityNote || ''
    },
    qualityOptions: NETWORK_QUALITY_PRESETS.map((preset) => ({
      key: preset.key,
      label: preset.label,
      active: quality === preset.key,
      title: preset.note
    })),
    autoFallbackButton: {
      label: '执行自动降级策略',
      title: '根据当前连接快照模拟 Runtime 自动切换到更保守的网络质量。'
    },
    framePolicy: {
      eyebrow: 'Frame Selector 当前策略',
      label: framePolicy?.label || '-',
      rationale: framePolicy?.rationale || '-',
      kpis: [
        framePolicy?.cadence || '-',
        `${framePolicy?.captureWidth || '-'}px`,
        framePolicy?.upload || '-'
      ]
    }
  };
}
