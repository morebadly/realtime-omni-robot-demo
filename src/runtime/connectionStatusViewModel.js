import { CONNECTION_MODE_OPTIONS } from './connectionModes.js';
import { describeLocalDevPreflight } from './localDevPreflight.js';
import { mediaFlowDetail, rowTone, statusLabel } from './realtimeReadiness.js';

export function valueOrDash(value, suffix = '') {
  if (value === null || value === undefined || value === '') return '-';
  return `${value}${suffix}`;
}

export function formatRuntimeTime(value) {
  if (!value) return '尚未更新';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function preflightLabel(status) {
  if (status === 'failed') return '未连接';
  if (status === 'connected') return '已通过';
  if (status === 'checking') return '检测中';
  return '手动检测';
}

export function buildRobotConnectionStatusViewModel({
  robot,
  connection,
  route,
  realtimeSession,
  realtimeSessionState,
  localDevPreflight,
  localDevBridge,
  realtimeOutput,
  readiness
}) {
  const metrics = readiness.metrics;
  const media = readiness.media;

  const healthRows = [
    {
      key: 'robot_online',
      tone: robot?.online === false ? 'danger' : 'good',
      label: '机器人在线',
      value: robot?.online === false ? '离线' : '在线',
      detail: `${robot?.mode || '-'} / ${robot?.network || '-'}`
    },
    {
      key: 'realtime_route',
      tone: readiness.bridgeFailed ? 'danger' : rowTone(Boolean(route?.canStream || readiness.bridgeReady), readiness.bridgeBusy),
      label: '实时链路',
      value: readiness.adapterValue,
      detail: readiness.endpoint || route?.mode || route?.route || 'Runtime route'
    },
    {
      key: 'session',
      tone: rowTone(Boolean(realtimeSessionState?.state) || realtimeSession?.active, realtimeSession?.micActive),
      label: '实时会话',
      value: realtimeSessionState?.label || realtimeSessionState?.state || (realtimeSession?.active ? 'active' : 'idle'),
      detail: realtimeSession?.micActive ? '麦克风已进入实时输入链路' : '麦克风未开启'
    },
    {
      key: 'audio_input',
      tone: media.audioFlowTone,
      label: '麦克风输入',
      value: `${metrics.audioObserved} observed / ${metrics.audioSent} sent / ${metrics.audioAckCount} ack`,
      detail: mediaFlowDetail({
        observed: metrics.audioObserved,
        sent: metrics.audioSent,
        ack: metrics.audioAckCount,
        idleDetail: `sample ${valueOrDash(realtimeSession?.sampleRate, 'Hz')} / level ${valueOrDash(realtimeSession?.level)}`
      })
    },
    {
      key: 'camera_input',
      tone: media.cameraFlowTone,
      label: '关键帧输入',
      value: `${metrics.cameraObserved} observed / ${metrics.cameraSent} sent / ${metrics.cameraAckCount} ack`,
      detail: mediaFlowDetail({
        observed: metrics.cameraObserved,
        sent: metrics.cameraSent,
        ack: metrics.cameraAckCount,
        idleDetail: '只发送 Frame Selector 选中的关键帧'
      })
    },
    {
      key: 'reply_audio',
      tone: rowTone(metrics.outputReceived > 0 || metrics.outputPlayed > 0, realtimeOutput?.playbackActive),
      label: '机器人回声',
      value: `${metrics.outputReceived} received / ${metrics.outputPlayed} played`,
      detail: realtimeOutput?.playbackActive ? '正在播放 Adapter 回传音频帧' : '等待 Adapter 回传音频帧'
    }
  ];

  const hasFlowAlert = media.hasObservedButNotSent || media.hasSentButNoAck || metrics.mediaLastError;
  const flowAlert = hasFlowAlert
    ? {
        tone: metrics.mediaLastError || media.hasObservedButNotSent ? 'danger' : 'warning',
        title: metrics.mediaLastError
          ? '媒体链路发送失败'
          : media.hasObservedButNotSent
            ? '输入未进入 Adapter'
            : 'Adapter ack 略滞后',
        detail: metrics.mediaLastError
          || (media.hasObservedButNotSent
            ? '浏览器已经观察到音频或关键帧，但当前 WebSocket 未连接，所以没有发送到 LocalDev Adapter。'
            : '媒体帧会继续发送，media_ack 只作为链路健康参考，不是逐帧阻塞条件。'),
        lastAck: metrics.mediaLastAck?.receivedFrame
          ? `last ack: ${metrics.mediaLastAck.receivedFrame.schema} / ${metrics.mediaLastAck.receivedFrame.frameId}`
          : null
      }
    : null;

  return {
    statusLabel: statusLabel(readiness.overallTone),
    modeOptions: CONNECTION_MODE_OPTIONS,
    summary: [
      {
        key: 'robot',
        label: '当前机器人',
        value: robot?.name || '未选择',
        detail: robot?.id || robot?.robot_id || 'robot_id 未知'
      },
      {
        key: 'network',
        label: '网络',
        value: connection?.label || robot?.network || '-',
        detail: connection?.status || robot?.mode || '-'
      }
    ],
    adapterTestButton: {
      disabled: !readiness.localDevMode || readiness.adapterTestBusy,
      label: readiness.adapterTestBusy ? '测试中' : readiness.localDevMode ? '测试 LocalDev Adapter' : '先选择本地调试',
      title: readiness.localDevMode
        ? '执行一次 WebSocket 握手测试，不发送 Omni 输入包。'
        : '请先选择本地调试连接方式。'
    },
    disconnectButton: {
      disabled: !readiness.adapterCanDisconnect,
      label: '断开',
      title: '断开当前 LocalDev WebSocket 会话，不影响 Runtime 模式。'
    },
    preflightLabel: preflightLabel(localDevPreflight?.status),
    preflightDetail: describeLocalDevPreflight(localDevPreflight),
    healthRows,
    flowAlert,
    footerItems: [
      `延迟 ${valueOrDash(connection?.latencyMs, 'ms')}`,
      `丢包 ${valueOrDash(connection?.packetLoss, '%')}`,
      `信号 ${valueOrDash(connection?.signal, '%')}`,
      `ack ${metrics.mediaAckCount}`,
      `更新 ${formatRuntimeTime(localDevBridge?.updatedAt || localDevPreflight?.checkedAt)}`
    ],
    realtimePolicy: {
      label: 'Realtime policy',
      title: '非阻塞媒体发送',
      detail: '音频帧和关键帧持续进入 Adapter，media_ack 用于健康观察和诊断，不作为逐帧发送闸门。'
    }
  };
}
