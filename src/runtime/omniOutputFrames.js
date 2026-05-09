function createId(prefix) {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}_${rand}`;
}

function nowIso() {
  return new Date().toISOString();
}

export function createOmniOutputState({
  turnId,
  robotId,
  displayName,
  state = 'thinking',
  requestId = null,
  reason = '',
  source = 'local_dev_mock_server'
} = {}) {
  return {
    schema: 'omni.output_state.v1',
    type: 'omni.output_state',
    stateId: createId('out_state'),
    turnId: turnId || createId('turn'),
    requestId,
    robotId: robotId || null,
    displayName: displayName || null,
    state,
    reason,
    source,
    createdAt: nowIso(),
    guardrails: {
      realtimeOutputFirst: true,
      notTtsPipeline: true,
      replyTextIsSubtitleOnly: true
    }
  };
}

export function createReplyAudioFrame({
  turnId,
  robotId,
  displayName,
  requestId = null,
  sequence = 0,
  isFinal = false,
  payloadBase64,
  byteLength = 0,
  sampleRate = 24000,
  channels = 1,
  durationMs = 120,
  source = 'local_dev_mock_server'
} = {}) {
  const hasPayload = Boolean(payloadBase64 && byteLength > 0);
  return {
    schema: 'omni.reply_audio_frame.v1',
    type: 'omni.reply_audio_frame',
    frameId: createId('reply_aud'),
    turnId: turnId || createId('turn'),
    requestId,
    robotId: robotId || null,
    displayName: displayName || null,
    sequence,
    isFinal,
    createdAt: nowIso(),
    source,
    audio: {
      kind: 'reply_audio',
      codec: 'pcm_float32',
      sampleRate,
      channels,
      durationMs,
      payloadEncoding: hasPayload ? 'base64' : null,
      payloadIncluded: hasPayload,
      byteLength: hasPayload ? byteLength : 0,
      payload: hasPayload ? payloadBase64 : null,
      note: 'Mock Omni 服务端输出音频帧；不是 reply_text → TTS。'
    },
    guardrails: {
      realtimeOutputFirst: true,
      notTtsPipeline: true,
      replyTextIsSubtitleOnly: true
    }
  };
}

export function createOmniInterrupt({
  turnId = null,
  robotId = null,
  displayName = null,
  requestId = null,
  reason = 'user_barge_in',
  source = 'client_runtime',
  target = 'current_output'
} = {}) {
  return {
    schema: 'omni.interrupt.v1',
    type: 'omni.interrupt',
    interruptId: createId('interrupt'),
    turnId,
    requestId,
    robotId,
    displayName,
    reason,
    source,
    target,
    createdAt: nowIso(),
    guardrails: {
      manualBargeInOnly: true,
      audioFrameDoesNotAutoInterrupt: true,
      preventSelfInterruption: true,
      replyAudioFrameCannotTriggerInterrupt: true
    }
  };
}

export function normalizeInterruptMessage(message) {
  const interrupt = message?.schema === 'omni.interrupt.v1'
    ? message
    : message?.interrupt?.schema === 'omni.interrupt.v1'
      ? message.interrupt
      : message?.payload?.schema === 'omni.interrupt.v1'
        ? message.payload
        : null;
  if (!interrupt) return null;
  return {
    requestId: interrupt.requestId || message?.requestId || null,
    interrupt
  };
}

export function normalizeOutputStateMessage(message) {
  const state = message?.schema === 'omni.output_state.v1'
    ? message
    : message?.state?.schema === 'omni.output_state.v1'
      ? message.state
      : message?.outputState?.schema === 'omni.output_state.v1'
        ? message.outputState
        : null;
  if (!state) return null;
  return {
    requestId: state.requestId || message?.requestId || null,
    state
  };
}

export function normalizeReplyAudioFrameMessage(message) {
  const frame = message?.schema === 'omni.reply_audio_frame.v1'
    ? message
    : message?.frame?.schema === 'omni.reply_audio_frame.v1'
      ? message.frame
      : message?.replyAudioFrame?.schema === 'omni.reply_audio_frame.v1'
        ? message.replyAudioFrame
        : null;
  if (!frame) return null;
  return {
    requestId: frame.requestId || message?.requestId || null,
    frame
  };
}
