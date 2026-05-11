// realtimeSessionCorrelation.js
//
// v1.3.4 Realtime Mux / Backpressure / Session Correlation Guard.
//
// This module is a Runtime-only correlation helper. It does not open real
// realtime sockets, upload audio, upload camera, or start billing. It is also
// not a transport. It only generates stable identifiers and tags realtime
// envelopes/frames so that `omni.input_packet.v1`, `omni.audio_frame.v1`,
// `omni.camera_frame.v1`, `omni.interrupt.v1`, `omni.output_state.v1`,
// `omni.output_turn.v1`, and `omni.reply_audio_frame.v1` can be observed as
// part of the same realtime session/context.
//
// Guardrails:
// - reply_text is never used as a TTS input.
// - audio_frame is never converted into an automatic interrupt.
// - reply_audio_frame is never fed back as user input.
// - localdev_mock fallback remains required.

export const REALTIME_PRIORITY = {
  HIGHEST: 'highest',
  HIGH: 'high',
  REALTIME: 'realtime',
  MEDIUM: 'medium',
  LOW: 'low'
};

export const REALTIME_PRIORITY_ORDER = ['highest', 'high', 'realtime', 'medium', 'low'];

const SCHEMA_PRIORITY = {
  'omni.interrupt.v1': REALTIME_PRIORITY.HIGHEST,
  'omni.output_state.v1': REALTIME_PRIORITY.HIGH,
  'omni.audio_frame.v1': REALTIME_PRIORITY.REALTIME,
  'omni.reply_audio_frame.v1': REALTIME_PRIORITY.REALTIME,
  'omni.camera_frame.v1': REALTIME_PRIORITY.MEDIUM,
  'omni.input_packet.v1': REALTIME_PRIORITY.LOW,
  'omni.output_turn.v1': REALTIME_PRIORITY.LOW
};

const SCHEMA_STREAM_KIND = {
  'omni.audio_frame.v1': 'audio_input',
  'omni.camera_frame.v1': 'camera_input',
  'omni.input_packet.v1': 'context_input',
  'omni.interrupt.v1': 'control',
  'omni.output_state.v1': 'state',
  'omni.output_turn.v1': 'output_turn',
  'omni.reply_audio_frame.v1': 'audio_output'
};

function nowIso() {
  return new Date().toISOString();
}

function rand(prefix) {
  const slice = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}_${slice}`;
}

export function createRealtimeSessionId() {
  return rand('omni_session');
}

export function createStreamId(kind = 'stream') {
  return rand(`omni_${kind}_stream`);
}

export function createTurnIdLike(seed = 'turn') {
  return rand(seed);
}

export function priorityForSchema(schema) {
  return SCHEMA_PRIORITY[schema] || REALTIME_PRIORITY.LOW;
}

export function streamKindForSchema(schema) {
  return SCHEMA_STREAM_KIND[schema] || 'unknown';
}

export function createDefaultSessionCorrelation(seed = {}) {
  const sessionId = seed.sessionId || createRealtimeSessionId();
  return {
    protocol: 'omni.session_correlation.v1',
    sessionId,
    robotId: seed.robotId || null,
    displayName: seed.displayName || null,
    createdAt: nowIso(),
    streams: {
      audio_input: seed.audioStreamId || createStreamId('audio_input'),
      camera_input: seed.cameraStreamId || createStreamId('camera_input'),
      context_input: seed.contextStreamId || createStreamId('context_input'),
      control: seed.controlStreamId || createStreamId('control'),
      audio_output: seed.audioOutputStreamId || createStreamId('audio_output')
    },
    sequences: {
      audio_input: 0,
      camera_input: 0,
      context_input: 0,
      control: 0,
      audio_output: 0
    },
    currentTurnId: seed.currentTurnId || null,
    currentRequestId: seed.currentRequestId || null,
    lastTaggedAt: null,
    lastTaggedSchema: null,
    guardrails: {
      sharedSessionForInputAndOutput: true,
      auditableStreamIds: true,
      replyTextIsSubtitleOnly: true,
      audioFrameDoesNotAutoInterrupt: true,
      replyAudioFrameCannotTriggerInterrupt: true,
      localdevMockFallbackRequired: true
    }
  };
}

export function resetSessionCorrelation(correlation, seed = {}) {
  const base = correlation || createDefaultSessionCorrelation(seed);
  return {
    ...base,
    streams: { ...base.streams },
    sequences: {
      audio_input: 0,
      camera_input: 0,
      context_input: 0,
      control: 0,
      audio_output: 0
    },
    currentTurnId: seed.currentTurnId || null,
    currentRequestId: seed.currentRequestId || null,
    lastTaggedAt: null,
    lastTaggedSchema: null
  };
}

export function withRobotIdentity(correlation, { robotId, displayName } = {}) {
  if (!correlation) return createDefaultSessionCorrelation({ robotId, displayName });
  return { ...correlation, robotId: robotId || correlation.robotId, displayName: displayName || correlation.displayName };
}

export function withCurrentTurn(correlation, { turnId, requestId } = {}) {
  if (!correlation) return createDefaultSessionCorrelation({ currentTurnId: turnId, currentRequestId: requestId });
  return {
    ...correlation,
    currentTurnId: turnId || correlation.currentTurnId,
    currentRequestId: requestId || correlation.currentRequestId
  };
}

export function buildCorrelationTag(correlation, schema, extra = {}) {
  const kind = streamKindForSchema(schema);
  const priority = priorityForSchema(schema);
  const seq = correlation?.sequences?.[kind];
  return {
    sessionId: correlation?.sessionId || null,
    streamId: correlation?.streams?.[kind] || null,
    streamKind: kind,
    sequence: typeof seq === 'number' ? seq + 1 : null,
    timestampMs: Date.now(),
    source: extra.source || 'client_runtime',
    priority,
    robotId: extra.robotId || correlation?.robotId || null,
    displayName: extra.displayName || correlation?.displayName || null,
    turnId: extra.turnId || correlation?.currentTurnId || null,
    requestId: extra.requestId || correlation?.currentRequestId || null
  };
}

export function bumpSequence(correlation, schema) {
  if (!correlation) return correlation;
  const kind = streamKindForSchema(schema);
  if (!Object.prototype.hasOwnProperty.call(correlation.sequences || {}, kind)) return correlation;
  return {
    ...correlation,
    sequences: { ...correlation.sequences, [kind]: (correlation.sequences[kind] || 0) + 1 },
    lastTaggedAt: nowIso(),
    lastTaggedSchema: schema
  };
}

export function tagFrameWithCorrelation(frame, correlation, extra = {}) {
  if (!frame || typeof frame !== 'object') return frame;
  const tag = buildCorrelationTag(correlation, frame.schema, extra);
  return {
    ...frame,
    sessionId: frame.sessionId || tag.sessionId,
    streamId: frame.streamId || tag.streamId,
    streamKind: frame.streamKind || tag.streamKind,
    turnId: frame.turnId || tag.turnId,
    timestampMs: frame.timestampMs || tag.timestampMs,
    source: frame.source || tag.source,
    priority: frame.priority || tag.priority,
    correlation: frame.correlation || {
      sessionId: tag.sessionId,
      streamId: tag.streamId,
      streamKind: tag.streamKind,
      sequence: typeof frame.sequence === 'number' ? frame.sequence : tag.sequence,
      timestampMs: tag.timestampMs,
      priority: tag.priority,
      source: tag.source,
      robotId: tag.robotId,
      requestId: tag.requestId,
      turnId: tag.turnId
    }
  };
}

export function summarizeSessionCorrelation(correlation) {
  if (!correlation) return 'session correlation 未初始化';
  const seq = correlation.sequences || {};
  return `session=${correlation.sessionId || 'unknown'} · audio_in=${seq.audio_input || 0} · camera_in=${seq.camera_input || 0} · context=${seq.context_input || 0} · control=${seq.control || 0} · audio_out=${seq.audio_output || 0}`;
}
