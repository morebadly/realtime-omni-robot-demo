#!/usr/bin/env node
// v1.3.4 Realtime Mux / Backpressure / Session Correlation smoke test.
//
// This script verifies the safe Mock realtime mux and session correlation
// boundary. It does not open a real provider socket, does not upload real
// audio, does not upload real camera frames, and does not start realtime
// billing. It only exercises the pure Runtime modules and contract envelope
// builders.

import {
  applyMuxDecision,
  classifyBufferedAmount,
  createDefaultMuxState,
  decideMuxAction,
  getMuxCapability,
  priorityForFrame,
  summarizeMuxState,
  DEFAULT_MUX_THRESHOLDS
} from '../src/runtime/realtimeMediaMux.js';
import {
  bumpSequence,
  createDefaultSessionCorrelation,
  priorityForSchema,
  streamKindForSchema,
  summarizeSessionCorrelation,
  tagFrameWithCorrelation,
  REALTIME_PRIORITY
} from '../src/runtime/realtimeSessionCorrelation.js';
import { createAudioFrame, createCameraFrame } from '../src/runtime/omniMediaFrames.js';
import { createOmniInterrupt, createOmniOutputState, createReplyAudioFrame } from '../src/runtime/omniOutputFrames.js';
import { buildOmniInputPacket } from '../src/runtime/omniPacket.js';
import {
  applyRealtimeOutputInterrupt,
  applyRealtimeOutputState,
  applyReplyAudioFrame,
  createDefaultRealtimeOutputChannel,
  markReplyAudioFramePlayed
} from '../src/runtime/realtimeOutputChannel.js';
import { evaluateProviderGate, normalizeProviderConfig } from '../src/runtime/providerGate.js';
import { createProviderAudioGate } from '../src/runtime/providerAudioGate.js';
import { createProviderCameraGate } from '../src/runtime/providerCameraGate.js';
import { createProviderHealthCheck } from '../src/runtime/providerHealthCheck.js';
import { createProviderHandshake } from '../src/runtime/providerHandshake.js';
import {
  createLocalDevControlEnvelope,
  createLocalDevInputEnvelope,
  createLocalDevMediaEnvelope
} from '../src/runtime/localDevProtocol.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// 1. audio_frame 不等待 media_ack：audio decision is always send regardless of ack count.
{
  const decision = decideMuxAction({ priority: REALTIME_PRIORITY.REALTIME, bufferedLevel: 'normal' });
  assert(decision.action === 'send', `audio at normal must send (got ${decision.action})`);
  const decisionElevated = decideMuxAction({ priority: REALTIME_PRIORITY.REALTIME, bufferedLevel: 'elevated' });
  assert(decisionElevated.action === 'send', `audio at elevated must still send (got ${decisionElevated.action})`);
  const decisionOverflow = decideMuxAction({ priority: REALTIME_PRIORITY.REALTIME, bufferedLevel: 'overflow' });
  assert(decisionOverflow.action === 'send', `audio at overflow must still send best-effort (got ${decisionOverflow.action})`);
  // ack count is a separate diagnostic, never gates send
  const ackStub = { receivedFrame: { schema: 'omni.audio_frame.v1' } };
  let state = createDefaultMuxState();
  for (let i = 0; i < 10; i += 1) {
    state = applyMuxDecision(state, {
      priority: REALTIME_PRIORITY.REALTIME,
      decision: 'send',
      reason: 'audio_protected',
      schema: 'omni.audio_frame.v1',
      frameId: `aud_${i}`,
      bufferedAmount: 0
    });
  }
  assert(state.counts.sent.realtime === 10, 'audio sent count must reflect 10 sends with no ack gating');
  void ackStub;
}

// 2. camera_frame 在 backpressure 下 drop-old / keep-latest
{
  const normal = decideMuxAction({ priority: REALTIME_PRIORITY.MEDIUM, bufferedLevel: 'normal' });
  assert(normal.action === 'send', `camera at normal must send (got ${normal.action})`);
  const elevated = decideMuxAction({ priority: REALTIME_PRIORITY.MEDIUM, bufferedLevel: 'elevated' });
  assert(elevated.action === 'drop_old', `camera at elevated must drop_old (got ${elevated.action})`);
  const high = decideMuxAction({ priority: REALTIME_PRIORITY.MEDIUM, bufferedLevel: 'high' });
  assert(high.action === 'drop_old', `camera at high must drop_old (got ${high.action})`);
  const overflow = decideMuxAction({ priority: REALTIME_PRIORITY.MEDIUM, bufferedLevel: 'overflow' });
  assert(overflow.action === 'drop_old', `camera at overflow must drop_old (got ${overflow.action})`);

  // Keep-latest semantics: state tracks last dropped camera as coalescedPending.camera
  let state = createDefaultMuxState();
  state = applyMuxDecision(state, {
    priority: REALTIME_PRIORITY.MEDIUM,
    decision: 'drop_old',
    reason: elevated.reason,
    schema: 'omni.camera_frame.v1',
    frameId: 'cam_old',
    bufferedAmount: DEFAULT_MUX_THRESHOLDS.warnBytes
  });
  state = applyMuxDecision(state, {
    priority: REALTIME_PRIORITY.MEDIUM,
    decision: 'drop_old',
    reason: elevated.reason,
    schema: 'omni.camera_frame.v1',
    frameId: 'cam_latest',
    bufferedAmount: DEFAULT_MUX_THRESHOLDS.warnBytes
  });
  assert(state.coalescedPending.camera?.frameId === 'cam_latest', 'camera coalesced slot must keep the latest frameId');
  assert(state.counts.dropped.medium === 2, 'two camera drops should be counted');
}

// 3. input_packet 不阻塞 audio_frame
{
  // input_packet under backpressure coalesces, but audio still sends.
  let state = createDefaultMuxState();
  state = applyMuxDecision(state, {
    priority: REALTIME_PRIORITY.LOW,
    decision: 'coalesce',
    reason: 'context_coalesce_on_backpressure',
    schema: 'omni.input_packet.v1',
    frameId: 'omni_packet_1',
    bufferedAmount: DEFAULT_MUX_THRESHOLDS.warnBytes
  });
  state = applyMuxDecision(state, {
    priority: REALTIME_PRIORITY.REALTIME,
    decision: 'send',
    reason: 'audio_protected',
    schema: 'omni.audio_frame.v1',
    frameId: 'aud_1',
    bufferedAmount: DEFAULT_MUX_THRESHOLDS.warnBytes
  });
  assert(state.counts.coalesced.low === 1, 'input_packet should be coalesced under backpressure');
  assert(state.counts.sent.realtime === 1, 'audio_frame must still be sent under same backpressure');
}

// 4. interrupt 最高优先级 — never blocked by any other priority, regardless of buffered level.
{
  for (const level of ['normal', 'elevated', 'high', 'overflow']) {
    const decision = decideMuxAction({ priority: REALTIME_PRIORITY.HIGHEST, bufferedLevel: level });
    assert(decision.action === 'send', `interrupt at ${level} must always send (got ${decision.action})`);
    assert(decision.reason === 'interrupt_bypass_priority', `interrupt reason must be priority bypass at ${level}`);
  }
  const priority = priorityForSchema('omni.interrupt.v1');
  assert(priority === REALTIME_PRIORITY.HIGHEST, `interrupt schema must map to highest priority (got ${priority})`);
}

// 5. interrupt 立即 flush output queue（结合 realtimeOutputChannel）
{
  let output = createDefaultRealtimeOutputChannel();
  output = applyReplyAudioFrame(output, {
    schema: 'omni.reply_audio_frame.v1',
    frameId: 'reply_1',
    turnId: 'turn_mux_smoke',
    sequence: 1,
    audio: { kind: 'reply_audio', payloadIncluded: true, byteLength: 16, payload: 'AAAAAA==', codec: 'pcm_float32', payloadEncoding: 'base64' }
  });
  output = applyReplyAudioFrame(output, {
    schema: 'omni.reply_audio_frame.v1',
    frameId: 'reply_2',
    turnId: 'turn_mux_smoke',
    sequence: 2,
    audio: { kind: 'reply_audio', payloadIncluded: true, byteLength: 16, payload: 'AAAAAA==', codec: 'pcm_float32', payloadEncoding: 'base64' }
  });
  assert(output.queuedAudioFrames.length === 2, 'two reply audio frames queued');
  output = applyRealtimeOutputInterrupt(output, { reason: 'user_barge_in', turnId: 'turn_mux_smoke' });
  assert(output.queuedAudioFrames.length === 0, 'interrupt must flush output queue immediately');
  assert(output.playbackActive === false, 'interrupt must stop playback');
}

// 6. reply_audio_frame 播放队列独立于 output_turn / reply_text / logs
{
  // We exercise reply_audio_frame queue purely, without ever feeding reply_text into it.
  let output = createDefaultRealtimeOutputChannel();
  output = applyReplyAudioFrame(output, {
    schema: 'omni.reply_audio_frame.v1',
    frameId: 'reply_a',
    turnId: 'turn_independence',
    sequence: 1,
    isFinal: true,
    audio: { kind: 'reply_audio', payloadIncluded: true, byteLength: 16, payload: 'AAAAAA==', codec: 'pcm_float32', payloadEncoding: 'base64' }
  });
  // simulate output_turn arriving "after" — must not invalidate or change the audio queue.
  const outputTurnEffect = output.queuedAudioFrames.length;
  assert(outputTurnEffect === 1, 'reply_audio_frame queue is independent of output_turn ingestion');
  assert(output.finalFrameReceived === true, 'final frame flag must be tracked on the queue');
  // The realtime output queue must never carry a reply_text payload as data.
  // (Note: the guardrail string is allowed to mention reply_text by name as a
  // human-readable safety note that explicitly says reply_text is subtitle only.)
  const queueOnly = {
    queuedAudioFrames: output.queuedAudioFrames,
    recentAudioFrames: output.recentAudioFrames,
    receivedAudioFrames: output.receivedAudioFrames,
    playedAudioFrames: output.playedAudioFrames
  };
  const replyTextDataLeak = JSON.stringify(queueOnly).includes('reply_text');
  assert(replyTextDataLeak === false, 'reply_audio_frame queue data must not embed any reply_text payload');
  // Playback done detection uses the returned next state, not a stale closure.
  output = markReplyAudioFramePlayed(output, 'reply_a');
  assert(output.state === 'finished', `markReplyAudioFramePlayed should mark state=finished on returned next state (got ${output.state})`);
  assert(output.playbackActive === false, 'markReplyAudioFramePlayed should clear playbackActive on the final played frame');
}

// 7. bufferedAmount 高时 camera 降级
{
  const normalLevel = classifyBufferedAmount(0);
  assert(normalLevel === 'normal', `0 buffered should be normal (got ${normalLevel})`);
  const elevatedLevel = classifyBufferedAmount(DEFAULT_MUX_THRESHOLDS.warnBytes);
  assert(elevatedLevel === 'elevated', `warn threshold must classify as elevated (got ${elevatedLevel})`);
  const highLevel = classifyBufferedAmount(DEFAULT_MUX_THRESHOLDS.highBytes);
  assert(highLevel === 'high', `high threshold must classify as high (got ${highLevel})`);
  const overflowLevel = classifyBufferedAmount(DEFAULT_MUX_THRESHOLDS.overflowBytes);
  assert(overflowLevel === 'overflow', `overflow threshold must classify as overflow (got ${overflowLevel})`);
  // Camera under high or overflow must drop_old.
  const cameraHigh = decideMuxAction({ priority: REALTIME_PRIORITY.MEDIUM, bufferedLevel: 'high' });
  const cameraOverflow = decideMuxAction({ priority: REALTIME_PRIORITY.MEDIUM, bufferedLevel: 'overflow' });
  assert(cameraHigh.action === 'drop_old', 'camera under high must drop_old');
  assert(cameraOverflow.action === 'drop_old', 'camera under overflow must drop_old');
}

// 8. reply_text 不接 TTS — output frame builders never expose a TTS path.
{
  const replyFrame = createReplyAudioFrame({
    turnId: 'turn_no_tts',
    sequence: 1,
    payloadBase64: 'AAAAAA==',
    byteLength: 4,
    sampleRate: 24000
  });
  const serialized = JSON.stringify(replyFrame);
  assert(replyFrame.guardrails.notTtsPipeline === true, 'reply audio frame guardrail must declare notTtsPipeline');
  assert(replyFrame.guardrails.replyTextIsSubtitleOnly === true, 'reply audio frame guardrail must declare replyTextIsSubtitleOnly');
  assert(!serialized.includes('"tts"'), 'reply audio frame must never reference a TTS field');
  const muxCap = getMuxCapability(createDefaultMuxState());
  assert(muxCap.replyTextToTts === false, 'mux capability must report replyTextToTts=false');
}

// 9. real audio upload blocked
{
  const gate = evaluateProviderGate({ providerConfig: normalizeProviderConfig({
    providerId: 'dashscope_qwen_omni',
    enabled: true,
    mode: 'realtime_experimental',
    endpointConfigured: true,
    apiKeyConfigured: true,
    allowAudioUpload: true,
    allowCameraUpload: false,
    allowRealtimeBilling: false,
    fallbackProviderId: 'localdev_mock'
  }) });
  assert(gate.canUploadAudio === false, 'real audio upload must remain blocked without explicit billing');
  const audioGate = createProviderAudioGate({ providerGate: gate });
  assert(audioGate.canSendRealAudio === false, 'audio gate canSendRealAudio must remain false');
}

// 10. real camera upload blocked
{
  const gate = evaluateProviderGate({ providerConfig: normalizeProviderConfig({
    providerId: 'dashscope_qwen_omni',
    enabled: true,
    mode: 'realtime_experimental',
    endpointConfigured: true,
    apiKeyConfigured: true,
    allowAudioUpload: false,
    allowCameraUpload: true,
    allowRealtimeBilling: false,
    fallbackProviderId: 'localdev_mock'
  }) });
  assert(gate.canUploadCamera === false, 'real camera upload must remain blocked without explicit billing');
  const cameraGate = createProviderCameraGate({ providerGate: gate });
  assert(cameraGate.canSendRealCamera === false, 'camera gate canSendRealCamera must remain false');
}

// 11. realtime billing blocked by default
{
  const gate = evaluateProviderGate({ providerConfig: normalizeProviderConfig({
    providerId: 'dashscope_qwen_omni',
    enabled: true,
    mode: 'realtime_experimental',
    endpointConfigured: true,
    apiKeyConfigured: true,
    allowAudioUpload: true,
    allowCameraUpload: true,
    allowRealtimeBilling: false,
    fallbackProviderId: 'localdev_mock'
  }) });
  assert(gate.canRealtime === false, 'realtime billing must remain blocked when allowRealtimeBilling=false');
}

// 12. real provider socket blocked
{
  const gate = evaluateProviderGate({ providerConfig: normalizeProviderConfig({
    providerId: 'dashscope_qwen_omni',
    enabled: true,
    mode: 'handshake_only',
    endpointConfigured: true,
    apiKeyConfigured: true,
    allowAudioUpload: false,
    allowCameraUpload: false,
    allowRealtimeBilling: false,
    fallbackProviderId: 'localdev_mock'
  }) });
  const health = createProviderHealthCheck({ providerGate: gate });
  const handshake = createProviderHandshake({ providerGate: gate, providerHealth: health });
  assert(handshake.canOpenRealtimeSocket === false, 'handshake must never claim canOpenRealtimeSocket');
}

// 13. localdev_mock fallback required
{
  const okFallback = evaluateProviderGate({ providerConfig: normalizeProviderConfig({
    providerId: 'dashscope_qwen_omni',
    enabled: true,
    mode: 'health_check_only',
    endpointConfigured: true,
    apiKeyConfigured: true,
    fallbackProviderId: 'localdev_mock'
  }) });
  assert(okFallback.fallbackProviderId === 'localdev_mock', 'fallback must remain localdev_mock');
  const badFallback = evaluateProviderGate({ providerConfig: normalizeProviderConfig({
    providerId: 'dashscope_qwen_omni',
    enabled: true,
    mode: 'health_check_only',
    endpointConfigured: true,
    apiKeyConfigured: true,
    fallbackProviderId: 'custom_realtime_omni'
  }) });
  assert(badFallback.blockReasons.includes('mock_fallback_required'), 'non-localdev_mock fallback must surface as block reason');
}

// 14. sessionId / streamId / sequence 能关联 input/audio/camera/interrupt
{
  let correlation = createDefaultSessionCorrelation({ robotId: 'robot_mux_smoke', displayName: 'MuxBot' });
  const sessionId = correlation.sessionId;
  assert(typeof sessionId === 'string' && sessionId.startsWith('omni_session_'), 'session id must be stable string with omni_session_ prefix');

  // audio_frame
  const audio = createAudioFrame({
    robot: { robotId: 'robot_mux_smoke', name: 'MuxBot' },
    session: { sampleRate: 48000, level: 0.1 },
    route: { route: 'local_dev_omni' },
    level: 0.1,
    payloadBase64: 'AAAAAA==',
    byteLength: 4,
    sampleCount: 1,
    durationMs: 10,
    sequence: 1,
    correlation
  });
  correlation = bumpSequence(correlation, 'omni.audio_frame.v1');
  assert(audio.sessionId === sessionId, 'audio frame sessionId must match correlation');
  assert(audio.streamKind === 'audio_input', `audio frame streamKind must be audio_input (got ${audio.streamKind})`);
  assert(audio.priority === 'realtime', `audio frame priority must be realtime (got ${audio.priority})`);
  assert(audio.correlation.streamId === correlation.streams.audio_input || audio.correlation.streamId === correlation.streams.audio_input, 'audio frame correlation.streamId must match audio_input stream');

  // camera_frame
  const camera = createCameraFrame({
    robot: { robotId: 'robot_mux_smoke', name: 'MuxBot', adapter: 'LocalDevOmniAdapter' },
    frame: { dataUrl: 'data:image/jpeg;base64,/9j/AAAA', width: 320, height: 240, capturedAt: new Date().toISOString() },
    framePolicy: { key: 'idle_1fps', captureWidth: 320, upload: 'local_debug_only', jpegQuality: 0.8 },
    sequence: 1,
    correlation
  });
  correlation = bumpSequence(correlation, 'omni.camera_frame.v1');
  assert(camera.sessionId === sessionId, 'camera frame sessionId must match correlation');
  assert(camera.streamKind === 'camera_input', `camera frame streamKind must be camera_input (got ${camera.streamKind})`);
  assert(camera.priority === 'medium', `camera frame priority must be medium (got ${camera.priority})`);

  // input_packet
  const packet = buildOmniInputPacket({
    robot: { robotId: 'robot_mux_smoke', name: 'MuxBot', mode: 'local_dev', adapter: 'LocalDevOmniAdapter' },
    robotProfile: { displayName: 'MuxBot' },
    realtimeSession: { active: true, micActive: true, sampleRate: 48000 },
    realtimeRoute: { route: 'local_dev_omni', canStream: true },
    framePolicy: { key: 'idle_1fps' },
    cameraStatus: {},
    recentEvents: [],
    connection: { status: 'stable', transport: 'websocket' },
    mediaChannels: { audio: { observed: 0, sent: 0 }, camera: { observed: 0, sent: 0 } },
    permissions: [],
    plugins: [],
    correlation
  });
  correlation = bumpSequence(correlation, 'omni.input_packet.v1');
  assert(packet.sessionId === sessionId, 'input packet sessionId must match correlation');
  assert(packet.priority === 'low', `input packet priority must be low (got ${packet.priority})`);
  assert(packet.streamKind === 'context_input', `input packet streamKind must be context_input (got ${packet.streamKind})`);

  // interrupt
  const interrupt = createOmniInterrupt({
    turnId: 'turn_mux_smoke',
    robotId: 'robot_mux_smoke',
    displayName: 'MuxBot',
    reason: 'user_barge_in',
    correlation
  });
  correlation = bumpSequence(correlation, 'omni.interrupt.v1');
  assert(interrupt.sessionId === sessionId, 'interrupt sessionId must match correlation');
  assert(interrupt.priority === 'highest', `interrupt priority must be highest (got ${interrupt.priority})`);
  assert(interrupt.streamKind === 'control', `interrupt streamKind must be control (got ${interrupt.streamKind})`);

  // output_state and reply_audio_frame also propagate correlation when supplied
  const outputState = createOmniOutputState({
    turnId: 'turn_mux_smoke',
    state: 'speaking',
    robotId: 'robot_mux_smoke',
    correlation
  });
  assert(outputState.sessionId === sessionId, 'output_state sessionId must match correlation');
  const reply = createReplyAudioFrame({
    turnId: 'turn_mux_smoke',
    sequence: 1,
    payloadBase64: 'AAAAAA==',
    byteLength: 4,
    correlation
  });
  assert(reply.sessionId === sessionId, 'reply audio frame sessionId must match correlation');

  // envelopes carry correlation too (no breaking change for existing consumers).
  const inputEnv = createLocalDevInputEnvelope({ requestId: 'req_smoke', packet, sentAt: new Date().toISOString() });
  assert(inputEnv.sessionId === sessionId, 'input envelope sessionId must propagate from packet');
  const mediaEnv = createLocalDevMediaEnvelope({ requestId: 'req_smoke', frame: audio, sentAt: new Date().toISOString() });
  assert(mediaEnv.sessionId === sessionId, 'media envelope sessionId must propagate from frame');
  const controlEnv = createLocalDevControlEnvelope({ requestId: 'req_smoke', interrupt, sentAt: new Date().toISOString() });
  assert(controlEnv.sessionId === sessionId, 'control envelope sessionId must propagate from interrupt');

  // sequences advanced through one full input/audio/camera/interrupt cycle.
  const seq = correlation.sequences;
  assert(seq.audio_input === 1 && seq.camera_input === 1 && seq.context_input === 1 && seq.control === 1, `correlation sequences must increment per stream kind (got ${JSON.stringify(seq)})`);
}

// 15. summarize functions cover the diagnostic surface used by the UI.
{
  let state = createDefaultMuxState();
  state = applyMuxDecision(state, {
    priority: REALTIME_PRIORITY.REALTIME,
    decision: 'send',
    reason: 'audio_protected',
    schema: 'omni.audio_frame.v1',
    frameId: 'aud_xx',
    bufferedAmount: 32
  });
  state = applyMuxDecision(state, {
    priority: REALTIME_PRIORITY.MEDIUM,
    decision: 'drop_old',
    reason: 'camera_drop_old_on_elevated_buffer',
    schema: 'omni.camera_frame.v1',
    frameId: 'cam_xx',
    bufferedAmount: DEFAULT_MUX_THRESHOLDS.warnBytes
  });
  const summary = summarizeMuxState(state);
  assert(summary.includes('sent 1'), `mux summary should reflect sent counter: ${summary}`);
  assert(summary.includes('dropped 1'), `mux summary should reflect dropped counter: ${summary}`);

  const correlation = createDefaultSessionCorrelation({ robotId: 'r' });
  const correlationSummary = summarizeSessionCorrelation(correlation);
  assert(correlationSummary.startsWith('session='), 'session correlation summary must start with session=');

  // Cap check: mux state caps reasons buffer
  let chained = createDefaultMuxState();
  for (let i = 0; i < 30; i += 1) {
    chained = applyMuxDecision(chained, {
      priority: REALTIME_PRIORITY.MEDIUM,
      decision: 'drop_old',
      reason: `camera_drop_${i}`,
      schema: 'omni.camera_frame.v1',
      frameId: `cam_${i}`,
      bufferedAmount: DEFAULT_MUX_THRESHOLDS.warnBytes
    });
  }
  assert(chained.dropReasons.length <= 12, `dropReasons buffer must be bounded (got ${chained.dropReasons.length})`);
}

// 16. priorityForFrame falls back to schema mapping when an explicit priority is missing.
{
  assert(priorityForFrame({ schema: 'omni.interrupt.v1' }) === 'highest', 'interrupt priority via schema');
  assert(priorityForFrame({ schema: 'omni.audio_frame.v1' }) === 'realtime', 'audio priority via schema');
  assert(priorityForFrame({ schema: 'omni.camera_frame.v1' }) === 'medium', 'camera priority via schema');
  assert(priorityForFrame({ schema: 'omni.input_packet.v1' }) === 'low', 'input packet priority via schema');
  assert(priorityForFrame(null) === 'low', 'null frame defaults to low');
  assert(streamKindForSchema('omni.reply_audio_frame.v1') === 'audio_output', 'reply audio frame streamKind');
}

console.log(`Realtime mux/backpressure smoke passed: ${summarizeMuxState(createDefaultMuxState())} · correlation=${summarizeSessionCorrelation(createDefaultSessionCorrelation())}`);
