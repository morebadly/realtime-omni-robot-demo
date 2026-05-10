export const BRIDGE_READY_STATES = new Set([
  'connected',
  'received',
  'media_ack',
  'output_state',
  'reply_audio_frame',
  'interrupt_sent'
]);

export const BRIDGE_BUSY_STATES = new Set([
  'checking',
  'connecting',
  'sending',
  'media_sending',
  'interrupt_sending'
]);

const SESSION_READY_STATES = new Set(['ready', 'listening', 'thinking', 'speaking']);

export function statusLabel(tone) {
  if (tone === 'good') return '连接正常';
  if (tone === 'warning') return '连接中';
  if (tone === 'danger') return '需要检查';
  return '待机';
}

export function rowTone(isGood, isWarning = false) {
  if (isGood) return 'good';
  if (isWarning) return 'warning';
  return 'idle';
}

export function mediaFlowTone({ observed, sent, ack, bridgeReady }) {
  if (observed > 0 && sent === 0) return 'danger';
  if (sent > 0 && ack === 0) return bridgeReady ? 'warning' : 'danger';
  if (sent > ack && ack > 0) return 'warning';
  if (ack > 0 || sent > 0 || observed > 0) return 'good';
  return 'idle';
}

export function mediaFlowDetail({ observed, sent, ack, idleDetail }) {
  if (observed > 0 && sent === 0) return '已有本地输入，但没有送入 Adapter。请先测试 LocalDev Adapter。';
  if (sent > 0 && ack === 0) return '媒体帧持续发送中，ack 只是链路健康参考，不阻塞实时通话。';
  if (sent > ack && ack > 0) return `媒体帧持续发送中，ack 略滞后 ${sent - ack} 帧。`;
  if (ack > 0) return 'Adapter 已确认收到媒体帧。';
  return idleDetail;
}

function statusTone({ robot, connection, route, sessionState, localDevBridge, localDevPreflight }) {
  const robotOffline = robot?.online === false || connection?.status === 'offline';
  const bridgeStatus = localDevBridge?.status;
  const preflightStatus = localDevPreflight?.status;
  const localDevMode = robot?.mode === 'local_dev';
  const bridgeFailed = bridgeStatus === 'failed' || preflightStatus === 'failed';
  const bridgeBusy = BRIDGE_BUSY_STATES.has(bridgeStatus) || preflightStatus === 'checking';
  const bridgeReady = BRIDGE_READY_STATES.has(bridgeStatus);
  const sessionReady = SESSION_READY_STATES.has(sessionState?.state);

  if (robotOffline || bridgeFailed) return 'danger';
  if (localDevMode && !bridgeReady) return bridgeBusy ? 'warning' : 'idle';
  if (route?.canStream || sessionReady || bridgeReady) return 'good';
  if (bridgeBusy) return 'warning';
  return 'idle';
}

function usesLocalhostEndpoint(endpoint) {
  return typeof endpoint === 'string' && /^wss?:\/\/localhost(?::|\/)/i.test(endpoint);
}

function buildNextAction({
  routeReady,
  robot,
  localDevMode,
  bridgeReady,
  bridgeBusy,
  adapterTestBusy,
  sessionActive,
  hasObservedButNotSent,
  hasSentButNoAck,
  outputFlowReady,
  route
}) {
  if (!routeReady && robot?.mode === 'offline_pet') {
    return {
      kind: 'switch_local_dev',
      tone: 'danger',
      title: '切回可联网模式',
      detail: '离线宠物模式不会打开 Omni 实时音频链路。开发调试时先切到本地调试。',
      buttonLabel: '切到本地调试'
    };
  }
  if (!routeReady) {
    return {
      kind: 'inspect_route_permission',
      tone: 'danger',
      title: '检查实时路由权限',
      detail: route?.detail || '当前模式或权限不允许打开实时链路。'
    };
  }
  if (localDevMode && !bridgeReady) {
    return {
      kind: 'test_adapter',
      tone: bridgeBusy ? 'warning' : 'danger',
      title: bridgeBusy ? 'Adapter 正在连接' : '先测试 LocalDev Adapter',
      detail: bridgeBusy
        ? 'WebSocket 正在握手，完成后再开启实时音频。'
        : '请确认 npm run mock:localdev 正在运行，然后执行一次握手测试。',
      buttonLabel: bridgeBusy ? '测试中' : '测试 Adapter',
      disabled: bridgeBusy || adapterTestBusy
    };
  }
  if (!sessionActive) {
    return {
      kind: 'open_audio_panel',
      tone: 'warning',
      title: '开启实时音频',
      detail: 'Adapter 和路由已经准备好，下一步在中间音频面板点击“开启实时音频”。'
    };
  }
  if (hasObservedButNotSent) {
    return {
      kind: 'retest_adapter',
      tone: 'danger',
      title: '输入没有进入 Adapter',
      detail: '浏览器已经观察到媒体输入，但没有通过 WebSocket 发送。请重新测试 Adapter 后再开麦。',
      buttonLabel: '重新测试',
      disabled: adapterTestBusy
    };
  }
  if (hasSentButNoAck) {
    return {
      kind: 'ack_lagging',
      tone: 'warning',
      title: 'Adapter ack 略滞后',
      detail: '媒体帧会继续发送，ack 只作为链路健康参考，不会阻塞实时通话。'
    };
  }
  if (!outputFlowReady) {
    return {
      kind: 'await_reply_audio',
      tone: 'warning',
      title: '等待回传音频',
      detail: '输入链路已建立，等待 Adapter 返回 reply_audio_frame。可发送一次 Omni 输入包验证回声。'
    };
  }
  return {
    kind: 'ready',
    tone: 'good',
    title: '实时通话链路可用',
    detail: '路由、Adapter、输入帧、ack 和回传音频都已有可见信号。'
  };
}

export function buildRealtimeReadiness({
  robot,
  connection,
  route,
  realtimeSession,
  realtimeSessionState,
  localDevPreflight,
  localDevBridge,
  mediaChannels,
  realtimeOutput
}) {
  const localDevMode = robot?.mode === 'local_dev';
  const bridgeStatus = localDevBridge?.status || 'idle';
  const preflightStatus = localDevPreflight?.status || 'pending';
  const bridgeReady = BRIDGE_READY_STATES.has(bridgeStatus);
  const bridgeBusy = BRIDGE_BUSY_STATES.has(bridgeStatus) || preflightStatus === 'checking';
  const bridgeFailed = bridgeStatus === 'failed' || preflightStatus === 'failed';
  const overallTone = statusTone({ robot, connection, route, sessionState: realtimeSessionState, localDevBridge, localDevPreflight });
  const endpoint = localDevBridge?.endpoint || localDevPreflight?.endpoint || robot?.adapterDetail?.endpoint;
  const audioSent = mediaChannels?.audio?.sent || 0;
  const audioObserved = mediaChannels?.audio?.observed || 0;
  const cameraSent = mediaChannels?.camera?.sent || 0;
  const cameraObserved = mediaChannels?.camera?.observed || 0;
  const mediaAckCount = mediaChannels?.localDev?.ackCount || 0;
  const audioAckCount = mediaChannels?.localDev?.audioAckCount || 0;
  const cameraAckCount = mediaChannels?.localDev?.cameraAckCount || 0;
  const mediaLastAck = mediaChannels?.localDev?.lastAck;
  const mediaLastError = mediaChannels?.localDev?.lastError;
  const outputReceived = realtimeOutput?.receivedAudioFrames || 0;
  const outputPlayed = realtimeOutput?.playedAudioFrames || 0;
  const outputFlowReady = outputReceived > 0 || outputPlayed > 0;
  const adapterTestBusy = bridgeStatus === 'connecting' || preflightStatus === 'checking';
  const adapterCanDisconnect = localDevMode && (bridgeReady || bridgeBusy || bridgeStatus === 'failed' || bridgeStatus === 'disconnected');
  const audioFlowTone = mediaFlowTone({ observed: audioObserved, sent: audioSent, ack: audioAckCount, bridgeReady });
  const cameraFlowTone = mediaFlowTone({ observed: cameraObserved, sent: cameraSent, ack: cameraAckCount, bridgeReady });
  const hasObservedButNotSent = (audioObserved > 0 && audioSent === 0) || (cameraObserved > 0 && cameraSent === 0);
  const hasSentButNoAck = (audioSent > 0 && audioAckCount === 0) || (cameraSent > 0 && cameraAckCount === 0);
  const routeReady = Boolean(route?.canStream);
  const sessionActive = Boolean(realtimeSession?.active && realtimeSession?.micActive);
  const audioFlowReady = audioSent > 0 && audioAckCount > 0;
  const cameraFlowReady = cameraSent > 0 && cameraAckCount > 0;

  const checklist = [
    {
      key: 'route',
      tone: routeReady ? 'good' : 'danger',
      label: '连接路由',
      detail: routeReady ? route?.label || '可打开实时链路' : route?.detail || '当前模式或权限阻止实时链路'
    },
    {
      key: 'adapter',
      tone: !localDevMode ? 'good' : bridgeReady ? 'good' : bridgeBusy ? 'warning' : 'danger',
      label: 'Adapter',
      detail: !localDevMode ? '当前模式不需要 LocalDev Adapter' : bridgeReady ? 'LocalDev Adapter 已连接' : bridgeBusy ? 'LocalDev Adapter 正在连接' : '请先测试 LocalDev Adapter'
    },
    {
      key: 'mic',
      tone: sessionActive ? 'good' : routeReady ? 'warning' : 'idle',
      label: '麦克风会话',
      detail: sessionActive ? '麦克风正在实时采集' : routeReady ? '可开启实时音频' : '等待路由允许'
    },
    {
      key: 'audio',
      tone: audioFlowReady ? 'good' : audioSent > 0 ? 'warning' : audioObserved > 0 ? 'danger' : 'idle',
      label: '音频帧',
      detail: audioFlowReady ? '音频帧已发送并收到 ack' : audioSent > 0 ? '音频帧持续发送中，ack 用于健康参考' : audioObserved > 0 ? '仅本地 observed，未进入 Adapter' : '尚未产生音频帧'
    },
    {
      key: 'camera',
      tone: cameraFlowReady ? 'good' : cameraSent > 0 ? 'warning' : cameraObserved > 0 ? 'danger' : 'idle',
      label: '关键帧',
      detail: cameraFlowReady ? '关键帧已发送并收到 ack' : cameraSent > 0 ? '关键帧持续发送中，ack 用于健康参考' : cameraObserved > 0 ? '仅本地 observed，未进入 Adapter' : '尚未发送关键帧'
    },
    {
      key: 'output',
      tone: outputFlowReady ? 'good' : bridgeReady ? 'warning' : 'idle',
      label: '回传音频',
      detail: outputFlowReady ? '已收到或播放 reply_audio_frame' : bridgeReady ? '等待 Adapter 回传音频帧' : '等待实时链路连接'
    }
  ];

  const blockedCount = checklist.filter((item) => item.tone === 'danger').length;
  const warningCount = checklist.filter((item) => item.tone === 'warning').length;
  const checklistTone = blockedCount > 0 ? 'danger' : warningCount > 0 ? 'warning' : 'good';
  const checklistLabel = blockedCount > 0 ? '暂不能通话' : warningCount > 0 ? '可准备通话' : '可以通话';

  const adapterValue = localDevMode
    ? bridgeReady
      ? 'Adapter 已连接'
      : bridgeFailed
        ? 'Adapter 未连接'
        : bridgeBusy
          ? 'Adapter 连接中'
          : '等待首次通话'
    : route?.label || robot?.adapter || '当前 Adapter';

  const diagnosticsText = usesLocalhostEndpoint(endpoint)
    ? '当前 endpoint 使用 localhost。若测试无响应，建议在模型接入中心改成 ws://127.0.0.1:8000/omni/realtime。'
    : localDevBridge?.error || localDevPreflight?.error || localDevBridge?.detail || localDevPreflight?.detail || '暂无连接诊断信息。';

  const nextAction = buildNextAction({
    routeReady,
    robot,
    localDevMode,
    bridgeReady,
    bridgeBusy,
    adapterTestBusy,
    sessionActive,
    hasObservedButNotSent,
    hasSentButNoAck,
    outputFlowReady,
    route
  });

  return {
    localDevMode,
    bridgeReady,
    bridgeBusy,
    bridgeFailed,
    overallTone,
    endpoint,
    adapterTestBusy,
    adapterCanDisconnect,
    adapterValue,
    diagnosticsText,
    modelServiceDetail: localDevMode
      ? bridgeReady
        ? '本地模型服务由 Adapter 侧代理，Web 不直接反复探测。'
        : 'Adapter 未连接时会阻止实时开麦；需要手动排查时可运行 health:localdev:qwen。'
      : '云端或离线模式下由当前 Runtime 路由决定。',
    metrics: {
      audioSent,
      audioObserved,
      cameraSent,
      cameraObserved,
      mediaAckCount,
      audioAckCount,
      cameraAckCount,
      mediaLastAck,
      mediaLastError,
      outputReceived,
      outputPlayed
    },
    media: {
      audioFlowTone,
      cameraFlowTone,
      hasObservedButNotSent,
      hasSentButNoAck
    },
    checklist: {
      items: checklist,
      blockedCount,
      warningCount,
      tone: checklistTone,
      label: checklistLabel
    },
    nextAction
  };
}
