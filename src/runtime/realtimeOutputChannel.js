const MAX_RECENT_FRAMES = 24;

function nowLabel() {
  return new Date().toLocaleTimeString('zh-CN', { hour12: false });
}

function nextInterruptToken(current) {
  const count = Number(current?.interruptCount || 0) + 1;
  return `interrupt_${Date.now().toString(36)}_${count}`;
}

export function createDefaultRealtimeOutputChannel() {
  return {
    protocol: 'omni.realtime_output.v1',
    state: 'idle',
    turnId: null,
    requestId: null,
    robotId: null,
    displayName: null,
    receivedAudioFrames: 0,
    playedAudioFrames: 0,
    queuedAudioFrames: [],
    recentAudioFrames: [],
    lastSequence: null,
    lastFrameId: null,
    lastFrameAt: null,
    lastStateAt: null,
    lastStateReason: '尚未收到 Omni 输出状态。',
    playbackActive: false,
    finalFrameReceived: false,
    interruptCount: 0,
    interruptToken: null,
    lastInterrupt: null,
    lastError: null,
    guardrail: 'reply_audio_frame 是 Omni 输出媒体帧；reply_text 只作为字幕/日志/调试；audio_frame 不会自动触发 interrupt。'
  };
}

export function applyRealtimeOutputState(prev, outputState) {
  const current = prev || createDefaultRealtimeOutputChannel();
  const state = outputState?.state || 'idle';
  const finalLike = state === 'finished' || state === 'interrupted' || state === 'error';
  const interrupted = state === 'interrupted';
  const alreadyInterrupted = interrupted && current.state === 'interrupted' && (!outputState?.turnId || outputState.turnId === current.turnId);
  const token = interrupted && !alreadyInterrupted ? nextInterruptToken(current) : current.interruptToken;
  return {
    ...current,
    state,
    turnId: outputState?.turnId || current.turnId,
    requestId: outputState?.requestId || current.requestId,
    robotId: outputState?.robotId || current.robotId,
    displayName: outputState?.displayName || current.displayName,
    queuedAudioFrames: interrupted ? [] : current.queuedAudioFrames,
    lastStateAt: nowLabel(),
    lastStateReason: outputState?.reason || current.lastStateReason,
    playbackActive: state === 'speaking' ? true : finalLike ? false : current.playbackActive,
    interruptCount: interrupted && !alreadyInterrupted ? current.interruptCount + 1 : current.interruptCount,
    interruptToken: token,
    lastInterrupt: interrupted ? {
      reason: outputState?.reason || 'server_interrupted',
      source: outputState?.source || 'local_dev_mock_server',
      turnId: outputState?.turnId || current.turnId,
      at: nowLabel()
    } : current.lastInterrupt,
    lastError: state === 'error' ? (outputState?.reason || 'Omni output state error') : current.lastError
  };
}

export function applyReplyAudioFrame(prev, frame) {
  const current = prev || createDefaultRealtimeOutputChannel();
  if (current.state === 'interrupted' && frame?.turnId === current.turnId) {
    return current;
  }
  const normalizedFrame = {
    ...frame,
    receivedAt: nowLabel(),
    played: false
  };
  const nextQueue = [...(current.queuedAudioFrames || []), normalizedFrame]
    .sort((a, b) => Number(a.sequence || 0) - Number(b.sequence || 0));
  const recent = [normalizedFrame, ...(current.recentAudioFrames || [])].slice(0, MAX_RECENT_FRAMES);
  return {
    ...current,
    state: current.state === 'idle' || current.state === 'finished' ? 'speaking' : current.state,
    turnId: frame?.turnId || current.turnId,
    requestId: frame?.requestId || current.requestId,
    robotId: frame?.robotId || current.robotId,
    displayName: frame?.displayName || current.displayName,
    receivedAudioFrames: current.receivedAudioFrames + 1,
    queuedAudioFrames: nextQueue,
    recentAudioFrames: recent,
    lastSequence: frame?.sequence ?? current.lastSequence,
    lastFrameId: frame?.frameId || current.lastFrameId,
    lastFrameAt: nowLabel(),
    playbackActive: true,
    finalFrameReceived: Boolean(frame?.isFinal) || current.finalFrameReceived,
    lastError: null
  };
}

export function markReplyAudioFramePlayed(prev, frameId) {
  const current = prev || createDefaultRealtimeOutputChannel();
  if (current.state === 'interrupted') return current;
  const queue = current.queuedAudioFrames || [];
  const frame = queue.find((item) => item.frameId === frameId);
  const nextQueue = queue.filter((item) => item.frameId !== frameId);
  const nextRecent = (current.recentAudioFrames || []).map((item) => (
    item.frameId === frameId ? { ...item, played: true, playedAt: nowLabel() } : item
  ));
  const isDone = nextQueue.length === 0 && (current.finalFrameReceived || frame?.isFinal);
  return {
    ...current,
    playedAudioFrames: current.playedAudioFrames + (frame ? 1 : 0),
    queuedAudioFrames: nextQueue,
    recentAudioFrames: nextRecent,
    state: isDone ? 'finished' : current.state,
    playbackActive: !isDone,
    lastStateAt: isDone ? nowLabel() : current.lastStateAt,
    lastStateReason: isDone ? 'reply_audio_frame 播放队列已清空。' : current.lastStateReason
  };
}

export function applyRealtimeOutputInterrupt(prev, interrupt) {
  const current = prev || createDefaultRealtimeOutputChannel();
  const token = nextInterruptToken(current);
  return {
    ...current,
    state: 'interrupted',
    turnId: interrupt?.turnId || current.turnId,
    requestId: interrupt?.requestId || current.requestId,
    robotId: interrupt?.robotId || current.robotId,
    displayName: interrupt?.displayName || current.displayName,
    queuedAudioFrames: [],
    playbackActive: false,
    finalFrameReceived: false,
    interruptCount: current.interruptCount + 1,
    interruptToken: token,
    lastInterrupt: {
      interruptId: interrupt?.interruptId || null,
      reason: interrupt?.reason || 'user_barge_in',
      source: interrupt?.source || 'client_runtime',
      turnId: interrupt?.turnId || current.turnId,
      at: nowLabel()
    },
    lastStateAt: nowLabel(),
    lastStateReason: '用户插话模拟：已停止当前输出播放队列。',
    lastError: null
  };
}

export function applyRealtimeOutputError(prev, error) {
  const current = prev || createDefaultRealtimeOutputChannel();
  return {
    ...current,
    state: 'error',
    playbackActive: false,
    queuedAudioFrames: [],
    interruptToken: nextInterruptToken(current),
    lastError: error,
    lastStateAt: nowLabel(),
    lastStateReason: String(error || 'Realtime output error')
  };
}

export function clearRealtimeOutputChannel() {
  return createDefaultRealtimeOutputChannel();
}

export function summarizeRealtimeOutputChannel(output) {
  if (!output) return '输出通道尚未初始化';
  const interruptText = output.interruptCount ? ` · interrupted ${output.interruptCount}` : '';
  return `${output.state || 'idle'} · received ${output.receivedAudioFrames || 0} · played ${output.playedAudioFrames || 0} · queued ${output.queuedAudioFrames?.length || 0}${interruptText}`;
}
