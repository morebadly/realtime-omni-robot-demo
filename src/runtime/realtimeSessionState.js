const MAX_TRANSITIONS = 16;

function nowLabel() {
  return new Date().toLocaleTimeString('zh-CN', { hour12: false });
}

function createId(prefix) {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}_${rand}`;
}

export const REALTIME_SESSION_STATES = {
  IDLE: 'idle',
  LISTENING: 'listening',
  USER_SPEAKING: 'user_speaking',
  MODEL_THINKING: 'model_thinking',
  MODEL_SPEAKING: 'model_speaking',
  INTERRUPTED: 'interrupted',
  RECOVERING: 'recovering',
  ERROR: 'error'
};

const STATE_LABELS = {
  idle: '空闲',
  listening: '监听中',
  user_speaking: '用户输入中',
  model_thinking: '模型思考中',
  model_speaking: '模型输出中',
  interrupted: '已打断',
  recovering: '恢复监听中',
  error: '错误'
};

export function createRealtimeSessionId() {
  return createId('rt_session');
}

export function createDefaultRealtimeSessionState(seed = {}) {
  return {
    protocol: 'omni.realtime_session_state.v1',
    sessionId: seed.sessionId || createRealtimeSessionId(),
    state: seed.state || REALTIME_SESSION_STATES.IDLE,
    previousState: null,
    currentTurnId: null,
    currentRequestId: null,
    currentPacketId: null,
    currentOutputState: null,
    inputAudioFramesObserved: 0,
    inputAudioFramesSent: 0,
    inputCameraFramesObserved: 0,
    inputCameraFramesSent: 0,
    outputTurnsReceived: 0,
    outputAudioFramesReceived: 0,
    outputAudioFramesPlayed: 0,
    interruptCount: 0,
    errorCount: 0,
    playbackActive: false,
    outputStreamActive: false,
    micOpenDuringOutput: true,
    explicitInterruptOnly: true,
    canSendInputFrame: false,
    canInterruptOutput: false,
    shouldKeepMicOpen: false,
    createdAt: nowLabel(),
    lastTransitionAt: nowLabel(),
    lastTransition: 'session_state.initialized',
    lastReason: 'Realtime Session State Machine 已初始化。',
    transitionHistory: [],
    guardrails: {
      inputOutputSeparated: true,
      replyTextIsSubtitleOnly: true,
      audioFrameDoesNotAutoInterrupt: true,
      replyAudioFrameCannotTriggerInterrupt: true,
      explicitInterruptOnly: true,
      micCanRemainOpenDuringOutput: true
    }
  };
}

function deriveState(prev, event, detail = {}) {
  const state = prev?.state || REALTIME_SESSION_STATES.IDLE;
  switch (event) {
    case 'SESSION_OPEN':
      return REALTIME_SESSION_STATES.LISTENING;
    case 'SESSION_CLOSE':
      return REALTIME_SESSION_STATES.IDLE;
    case 'INPUT_AUDIO_FRAME':
      if (state === REALTIME_SESSION_STATES.MODEL_SPEAKING) return REALTIME_SESSION_STATES.MODEL_SPEAKING;
      if (state === REALTIME_SESSION_STATES.MODEL_THINKING) return REALTIME_SESSION_STATES.MODEL_THINKING;
      return REALTIME_SESSION_STATES.USER_SPEAKING;
    case 'INPUT_CAMERA_FRAME':
      return state === REALTIME_SESSION_STATES.IDLE ? REALTIME_SESSION_STATES.LISTENING : state;
    case 'INPUT_PACKET_SENT':
      return REALTIME_SESSION_STATES.MODEL_THINKING;
    case 'OUTPUT_TURN_RECEIVED':
      return state === REALTIME_SESSION_STATES.MODEL_SPEAKING ? state : REALTIME_SESSION_STATES.MODEL_THINKING;
    case 'OUTPUT_STATE': {
      const outputState = detail.outputState || detail.state;
      if (outputState === 'thinking') return REALTIME_SESSION_STATES.MODEL_THINKING;
      if (outputState === 'speaking') return REALTIME_SESSION_STATES.MODEL_SPEAKING;
      if (outputState === 'interrupted') return REALTIME_SESSION_STATES.INTERRUPTED;
      if (outputState === 'finished') return prev?.shouldKeepMicOpen ? REALTIME_SESSION_STATES.LISTENING : REALTIME_SESSION_STATES.IDLE;
      if (outputState === 'error') return REALTIME_SESSION_STATES.ERROR;
      return state;
    }
    case 'REPLY_AUDIO_FRAME_RECEIVED':
      return REALTIME_SESSION_STATES.MODEL_SPEAKING;
    case 'REPLY_AUDIO_FRAME_PLAYED':
      if (detail.finalFramePlayed || detail.outputDone) return prev?.shouldKeepMicOpen ? REALTIME_SESSION_STATES.LISTENING : REALTIME_SESSION_STATES.IDLE;
      return state;
    case 'INTERRUPT_LOCAL':
    case 'INTERRUPT_ACK':
      return REALTIME_SESSION_STATES.INTERRUPTED;
    case 'RECOVER_TO_LISTENING':
      return REALTIME_SESSION_STATES.LISTENING;
    case 'ERROR':
      return REALTIME_SESSION_STATES.ERROR;
    case 'RESET':
      return REALTIME_SESSION_STATES.IDLE;
    default:
      return state;
  }
}

function appendHistory(prev, event, nextState, detail = {}) {
  const item = {
    at: nowLabel(),
    event,
    from: prev?.state || REALTIME_SESSION_STATES.IDLE,
    to: nextState,
    reason: detail.reason || detail.detail || event,
    turnId: detail.turnId || detail.outputState?.turnId || prev?.currentTurnId || null
  };
  return [item, ...(prev?.transitionHistory || [])].slice(0, MAX_TRANSITIONS);
}

function deriveCapabilities(next) {
  const shouldKeepMicOpen = Boolean(next.shouldKeepMicOpen);
  const outputActive = next.state === REALTIME_SESSION_STATES.MODEL_THINKING
    || next.state === REALTIME_SESSION_STATES.MODEL_SPEAKING;
  return {
    ...next,
    canSendInputFrame: next.state !== REALTIME_SESSION_STATES.ERROR,
    canInterruptOutput: next.state === REALTIME_SESSION_STATES.MODEL_SPEAKING
      || next.playbackActive
      || next.outputStreamActive,
    shouldKeepMicOpen,
    outputStreamActive: outputActive || next.outputStreamActive && next.state !== REALTIME_SESSION_STATES.IDLE,
    playbackActive: next.state === REALTIME_SESSION_STATES.MODEL_SPEAKING ? true : next.playbackActive
  };
}

export function transitionRealtimeSessionState(prev, event, detail = {}) {
  const current = prev || createDefaultRealtimeSessionState();
  if (event === 'RESET') {
    return createDefaultRealtimeSessionState({ sessionId: detail.sessionId || createRealtimeSessionId() });
  }

  const nextState = deriveState(current, event, detail);
  const mediaKind = detail.mediaKind || detail.kind;
  const sent = Boolean(detail.sent);
  const next = {
    ...current,
    previousState: current.state,
    state: nextState,
    sessionId: detail.sessionId || current.sessionId,
    currentTurnId: detail.turnId || detail.outputState?.turnId || detail.replyAudioFrame?.turnId || current.currentTurnId,
    currentRequestId: detail.requestId || detail.outputState?.requestId || detail.replyAudioFrame?.requestId || current.currentRequestId,
    currentPacketId: detail.packetId || current.currentPacketId,
    currentOutputState: detail.outputState?.state || detail.outputState || current.currentOutputState,
    inputAudioFramesObserved: event === 'INPUT_AUDIO_FRAME' ? current.inputAudioFramesObserved + 1 : current.inputAudioFramesObserved,
    inputAudioFramesSent: event === 'INPUT_AUDIO_FRAME' && sent ? current.inputAudioFramesSent + 1 : current.inputAudioFramesSent,
    inputCameraFramesObserved: event === 'INPUT_CAMERA_FRAME' ? current.inputCameraFramesObserved + 1 : current.inputCameraFramesObserved,
    inputCameraFramesSent: event === 'INPUT_CAMERA_FRAME' && sent ? current.inputCameraFramesSent + 1 : current.inputCameraFramesSent,
    outputTurnsReceived: event === 'OUTPUT_TURN_RECEIVED' ? current.outputTurnsReceived + 1 : current.outputTurnsReceived,
    outputAudioFramesReceived: event === 'REPLY_AUDIO_FRAME_RECEIVED' ? current.outputAudioFramesReceived + 1 : current.outputAudioFramesReceived,
    outputAudioFramesPlayed: event === 'REPLY_AUDIO_FRAME_PLAYED' ? current.outputAudioFramesPlayed + 1 : current.outputAudioFramesPlayed,
    interruptCount: event === 'INTERRUPT_LOCAL' || event === 'INTERRUPT_ACK' ? current.interruptCount + 1 : current.interruptCount,
    errorCount: event === 'ERROR' ? current.errorCount + 1 : current.errorCount,
    playbackActive: event === 'REPLY_AUDIO_FRAME_RECEIVED'
      ? true
      : event === 'OUTPUT_STATE' && (detail.outputState?.state || detail.outputState) === 'finished'
        ? false
        : event === 'INTERRUPT_LOCAL' || event === 'INTERRUPT_ACK' || event === 'SESSION_CLOSE'
          ? false
          : event === 'REPLY_AUDIO_FRAME_PLAYED' && detail.outputDone
            ? false
            : current.playbackActive,
    outputStreamActive: event === 'OUTPUT_STATE'
      ? !['finished', 'interrupted', 'error'].includes(detail.outputState?.state || detail.outputState)
      : event === 'INTERRUPT_LOCAL' || event === 'INTERRUPT_ACK' || event === 'SESSION_CLOSE'
        ? false
        : current.outputStreamActive,
    shouldKeepMicOpen: event === 'SESSION_OPEN'
      ? true
      : event === 'SESSION_CLOSE'
        ? false
        : current.shouldKeepMicOpen,
    lastTransitionAt: nowLabel(),
    lastTransition: event,
    lastReason: detail.reason || detail.detail || event,
    transitionHistory: appendHistory(current, event, nextState, detail)
  };

  return deriveCapabilities(next);
}

export function canSendInputFrame(sessionState) {
  return Boolean(sessionState?.canSendInputFrame);
}

export function canInterruptOutput(sessionState) {
  return Boolean(sessionState?.canInterruptOutput);
}

export function shouldKeepMicOpen(sessionState) {
  return Boolean(sessionState?.shouldKeepMicOpen);
}

export function summarizeRealtimeSessionState(sessionState) {
  if (!sessionState) return 'session state 未初始化';
  const label = STATE_LABELS[sessionState.state] || sessionState.state;
  return `${label} · input A/C ${sessionState.inputAudioFramesSent || 0}/${sessionState.inputCameraFramesSent || 0} · output ${sessionState.outputAudioFramesReceived || 0}/${sessionState.outputAudioFramesPlayed || 0} · interrupts ${sessionState.interruptCount || 0}`;
}

export function getRealtimeSessionStateLabel(state) {
  return STATE_LABELS[state] || state || '未知';
}
