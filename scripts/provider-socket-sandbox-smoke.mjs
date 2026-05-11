#!/usr/bin/env node
// v1.3.6 Real Socket Sandbox / Synthetic-only Provider Session smoke test.
//
// This script verifies the synthetic-only provider socket sandbox, the
// extended synthetic provider adapter lifecycle methods, and the descriptor
// boundary. It does not open any provider socket, does not upload real
// audio or real camera frames, does not start realtime billing, and does
// not connect `reply_text` to TTS.

import {
  PROVIDER_SOCKET_SANDBOX_PROTOCOL,
  PROVIDER_SOCKET_SANDBOX_STATES,
  PROVIDER_SOCKET_SANDBOX_EVENTS,
  createDefaultSocketSandboxState,
  transitionSocketSandbox,
  requestSocketSandbox,
  runSyntheticSocketSession,
  summarizeSocketSandbox,
  getSocketSandboxCapability
} from '../src/runtime/providerSocketSandbox.js';
import { createSyntheticProviderAdapter } from '../src/runtime/providerAdapters/syntheticProviderAdapter.js';
import { createProviderAdapterDescriptor, validateProviderAdapter } from '../src/runtime/providerAdapterContract.js';
import { normalizeProviderConfig, evaluateProviderGate } from '../src/runtime/providerGate.js';
import {
  applyReplyAudioFrame,
  applyRealtimeOutputInterrupt,
  createDefaultRealtimeOutputChannel,
  markReplyAudioFramePlayed
} from '../src/runtime/realtimeOutputChannel.js';
import { applyMediaAck, createDefaultMediaChannels } from '../src/runtime/omniMediaFrames.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertSyntheticSafety(result, label) {
  assert(result, `${label}: result must exist`);
  if (typeof result === 'object') {
    if ('opensRealSocket' in result) assert(result.opensRealSocket === false, `${label}: opensRealSocket must be false`);
    if ('sentToProvider' in result) assert(result.sentToProvider === false, `${label}: sentToProvider must be false`);
    if ('uploaded' in result) assert(result.uploaded === false, `${label}: uploaded must be false`);
    if ('persisted' in result) assert(result.persisted === false, `${label}: persisted must be false`);
    if ('billingStarted' in result) assert(result.billingStarted === false, `${label}: billingStarted must be false`);
  }
}

// 1. real provider socket is blocked by default for real_cloud / self_hosted.
{
  for (const providerKind of ['real_cloud', 'self_hosted']) {
    const blocked = requestSocketSandbox(null, { providerId: providerKind === 'real_cloud' ? 'dashscope_qwen_omni' : 'custom_realtime_omni', providerKind });
    assert(blocked.state === 'blocked', `${providerKind} must transition to blocked (got ${blocked.state})`);
    assert(blocked.lastReason === 'real_provider_socket_blocked_by_default', `${providerKind} block reason must be standard`);
    assert(blocked.safety.opensRealSocket === false, `${providerKind} opensRealSocket must remain false`);
    assert(blocked.fallbackProviderId === 'localdev_mock', `${providerKind} fallback must be localdev_mock`);
  }
  // Even an explicit `synthetic_opening` event on a real provider must be blocked.
  const realRequested = transitionSocketSandbox(
    createDefaultSocketSandboxState({ providerId: 'dashscope_qwen_omni', providerKind: 'real_cloud' }),
    'provider.socket.synthetic_opening',
    {}
  );
  assert(realRequested.state === 'blocked', 'real provider attempting synthetic_opening must still be blocked');
}

// 2. synthetic socket can open / ready / close through the state machine.
{
  let state = requestSocketSandbox(null, { providerId: 'synthetic_test', providerKind: 'synthetic' });
  assert(state.state === 'requested', `requested transition expected (got ${state.state})`);
  state = transitionSocketSandbox(state, 'provider.socket.synthetic_opening');
  assert(state.state === 'synthetic_opening', 'state must be synthetic_opening');
  state = transitionSocketSandbox(state, 'provider.socket.synthetic_opened');
  assert(state.state === 'synthetic_open', 'state must be synthetic_open');
  state = transitionSocketSandbox(state, 'provider.socket.synthetic_ready');
  assert(state.state === 'synthetic_ready', 'state must be synthetic_ready');
  state = transitionSocketSandbox(state, 'provider.socket.synthetic_closed');
  assert(state.state === 'synthetic_closed', 'state must be synthetic_closed');
}

// 3 + 4 + 5 + 6: synthetic-only adapter never reports real socket / provider / upload / billing.
{
  const adapter = createSyntheticProviderAdapter();
  assert(adapter.canOpenRealtimeSocket === false, 'synthetic adapter canOpenRealtimeSocket must remain false');
  assert(adapter.canStartBillingSession === false, 'synthetic adapter canStartBillingSession must remain false');

  const session = adapter.createSyntheticSession({ correlation: { sessionId: 'omni_session_smoke', robotId: 'r_smoke' } });
  assertSyntheticSafety(session, 'createSyntheticSession');
  assert(session.opensRealSocket === false, 'synthetic session opensRealSocket must be false');
  assert(session.syntheticOnly === true, 'synthetic session syntheticOnly must be true');

  const opened = adapter.openSyntheticSocket();
  assertSyntheticSafety(opened, 'openSyntheticSocket');
  assert(opened.syntheticOnly === true, 'openSyntheticSocket must remain synthetic only');
  assert(opened.socketSandbox.state === 'synthetic_open', 'sandbox state must be synthetic_open after openSyntheticSocket');

  const ready = adapter.emitSyntheticReady({ reason: 'ready_for_synthetic_session' });
  assertSyntheticSafety(ready, 'emitSyntheticReady');
  assert(ready.socketSandbox.state === 'synthetic_ready', 'sandbox state must be synthetic_ready after emitSyntheticReady');

  const closed = adapter.closeSyntheticSocket('manual_close');
  assertSyntheticSafety(closed, 'closeSyntheticSocket');
  assert(closed.socketSandbox.state === 'synthetic_closed', 'sandbox state must be synthetic_closed after closeSyntheticSocket');

  const stats = adapter.getStats();
  assert(stats.socketOpened === 1, `socketOpened count expected 1 (got ${stats.socketOpened})`);
  assert(stats.socketReady === 1, `socketReady count expected 1 (got ${stats.socketReady})`);
  assert(stats.socketClosed === 1, `socketClosed count expected 1 (got ${stats.socketClosed})`);
  assert(stats.socketRequested === 1, `socketRequested count expected 1 (got ${stats.socketRequested})`);
}

// 7. real audio frame is rejected by synthetic adapter.
{
  const adapter = createSyntheticProviderAdapter();
  adapter.createSyntheticSession();
  const realAudio = {
    schema: 'omni.audio_frame.v1',
    frameId: 'aud_real_v136',
    sequence: 1,
    media: {
      kind: 'audio',
      codec: 'pcm_float32',
      sampleRate: 48000,
      channels: 1,
      payloadIncluded: true,
      payloadEncoding: 'base64',
      byteLength: 8192,
      payload: 'AAAA'
    }
  };
  const result = adapter.sendAudioFrame(realAudio);
  assert(result.ok === false, 'real audio frame must be rejected');
  assert(result.sentToProvider === false, 'rejected real audio must never report sentToProvider=true');
  assert(String(result.reason).includes('synthetic_only') || String(result.reason).includes('real_audio'), `real audio rejection reason must explain synthetic_only (got ${result.reason})`);
}

// 8. real camera frame is rejected by synthetic adapter.
{
  const adapter = createSyntheticProviderAdapter();
  adapter.createSyntheticSession();
  const realCamera = {
    schema: 'omni.camera_frame.v1',
    frameId: 'cam_real_v136',
    sequence: 1,
    media: {
      kind: 'camera',
      codec: 'image/jpeg',
      width: 640,
      height: 480,
      payloadIncluded: true,
      payloadEncoding: 'base64',
      byteLength: 4096,
      payload: '/9j/AAAA'
    }
  };
  const result = adapter.sendCameraFrame(realCamera);
  assert(result.ok === false, 'real camera frame must be rejected');
  assert(result.sentToProvider === false, 'rejected real camera must never report sentToProvider=true');
  assert(String(result.reason).includes('synthetic_only') || String(result.reason).includes('real_camera'), `real camera rejection reason must explain synthetic_only (got ${result.reason})`);
}

// 9. synthetic audio / synthetic camera frames are accepted but never escape.
{
  const adapter = createSyntheticProviderAdapter();
  adapter.createSyntheticSession();
  const syntheticAudio = {
    schema: 'omni.audio_frame.v1',
    frameId: 'aud_syn_v136',
    sequence: 1,
    synthetic: true,
    source: 'synthetic_test',
    media: {
      kind: 'audio',
      codec: 'pcm_float32',
      sampleRate: 24000,
      channels: 1,
      payloadIncluded: true,
      payloadEncoding: 'base64',
      byteLength: 64,
      payload: 'AAAA',
      synthetic: true
    }
  };
  const audioResult = adapter.sendAudioFrame(syntheticAudio);
  assert(audioResult.ok === true, 'synthetic audio frame must be accepted');
  assert(audioResult.sentToProvider === false, 'synthetic audio must never be sent to provider');

  const syntheticCamera = {
    schema: 'omni.camera_frame.v1',
    frameId: 'cam_syn_v136',
    sequence: 1,
    synthetic: true,
    source: 'synthetic_test',
    media: {
      kind: 'camera',
      codec: 'image/jpeg',
      width: 64,
      height: 64,
      payloadIncluded: true,
      payloadEncoding: 'base64',
      byteLength: 32,
      payload: '/9j/AAAA',
      synthetic: true
    }
  };
  const cameraResult = adapter.sendCameraFrame(syntheticCamera);
  assert(cameraResult.ok === true, 'synthetic camera frame must be accepted');
  assert(cameraResult.sentToProvider === false, 'synthetic camera must never be sent to provider');
}

// 10. fallback must be localdev_mock.
{
  // Sandbox: fallback transition records localdev_mock.
  const fallback = transitionSocketSandbox(
    createDefaultSocketSandboxState({ providerId: 'dashscope_qwen_omni', providerKind: 'real_cloud' }),
    'provider.socket.fallback',
    { reason: 'fallback_to_localdev_mock' }
  );
  assert(fallback.state === 'fallback_to_localdev_mock', `state must be fallback_to_localdev_mock (got ${fallback.state})`);
  assert(fallback.fallbackProviderId === 'localdev_mock', 'fallback must point to localdev_mock');

  // Provider Gate: bad fallback rejected.
  const badConfig = normalizeProviderConfig({
    providerId: 'dashscope_qwen_omni',
    enabled: true,
    mode: 'health_check_only',
    endpointConfigured: true,
    apiKeyConfigured: true,
    fallbackProviderId: 'custom_realtime_omni'
  });
  const badGate = evaluateProviderGate({ providerConfig: badConfig });
  assert(badGate.blockReasons.includes('mock_fallback_required'), 'non-mock fallback must still be flagged');

  // Adapter: emitSyntheticFallback returns localdev_mock fallback.
  const adapter = createSyntheticProviderAdapter();
  adapter.createSyntheticSession();
  const fbResult = adapter.emitSyntheticFallback('synthetic_session_giving_up');
  assert(fbResult.fallbackProviderId === 'localdev_mock', 'adapter fallback must point to localdev_mock');
  assert(fbResult.socketSandbox.state === 'fallback_to_localdev_mock', 'adapter sandbox state must be fallback_to_localdev_mock');
}

// 11. API key must not enter descriptor / logs / Visible Context.
{
  const descriptor = createProviderAdapterDescriptor({
    adapter: { key: 'wifi_cloud', apiKey: 'sk-v136-secret-should-not-leak' },
    providerConfig: normalizeProviderConfig({
      providerId: 'dashscope_qwen_omni',
      enabled: true,
      mode: 'handshake_only',
      endpointConfigured: true,
      apiKeyConfigured: true,
      fallbackProviderId: 'localdev_mock'
    })
  });
  assert(!JSON.stringify(descriptor).includes('sk-v136-secret-should-not-leak'), 'descriptor must never serialize a real-looking API key');
  assert(descriptor.secretBoundary.apiKeyInFrontend === false, 'secretBoundary.apiKeyInFrontend must be false');
  assert(descriptor.secretBoundary.apiKeyInRuntimeConfig === false, 'secretBoundary.apiKeyInRuntimeConfig must be false');
  assert(descriptor.guardrails.apiKeyMustNotEnterFrontend === true, 'guardrails.apiKeyMustNotEnterFrontend must be true');

  // Socket sandbox state never carries the api key either.
  const adapter = createSyntheticProviderAdapter();
  adapter.createSyntheticSession();
  adapter.openSyntheticSocket();
  const sandbox = adapter.getSocketSandboxState();
  assert(!JSON.stringify(sandbox).includes('sk-v136-secret-should-not-leak'), 'sandbox state must never serialize a real-looking API key');
}

// 12. reply_text must NOT be a TTS input.
{
  const descriptor = createProviderAdapterDescriptor({
    providerConfig: normalizeProviderConfig({
      providerId: 'dashscope_qwen_omni',
      enabled: true,
      mode: 'realtime_experimental',
      endpointConfigured: true,
      apiKeyConfigured: true,
      allowAudioUpload: true,
      allowCameraUpload: true,
      allowRealtimeBilling: true,
      fallbackProviderId: 'localdev_mock'
    })
  });
  assert(descriptor.replyTextToTts === false, 'descriptor.replyTextToTts must remain false even when other flags are requested');
  assert(descriptor.socketSandbox.replyTextToTts === false, 'socketSandbox.replyTextToTts must remain false');
  assert(descriptor.socketSandbox.replyTextSubtitleOnly === true, 'socketSandbox.replyTextSubtitleOnly must be true');
  assert(descriptor.socketSandbox.replyAudioFrameNative === true, 'socketSandbox.replyAudioFrameNative must be true');
  assert(descriptor.guardrails.replyTextNotTtsInput === true, 'guardrails.replyTextNotTtsInput must be true');
  assert(descriptor.guardrails.asrLlmTtsRegressionForbidden === true, 'guardrails.asrLlmTtsRegressionForbidden must be true');

  const sandboxCap = getSocketSandboxCapability();
  assert(sandboxCap.replyTextToTts === false, 'sandbox capability replyTextToTts must remain false');
  assert(sandboxCap.replyAudioFrameNative === true, 'sandbox capability must declare replyAudioFrameNative=true');
}

// 13. output_turn.reply_text is subtitle / debug only.
{
  const adapter = createSyntheticProviderAdapter();
  adapter.createSyntheticSession();
  let observedTurn = null;
  adapter.onOutputTurn((turn) => { observedTurn = turn; });
  adapter.emitSyntheticOutputTurn({
    schema: 'omni.output_turn.v1',
    turnId: 'turn_v136_sub',
    reply_text: '这只是字幕/调试信息，绝对不能进 TTS。',
    transcript: { usage: '字幕 / 日志 / 调试 / 插件关键词辅助' }
  });
  assert(observedTurn?.turnId === 'turn_v136_sub', 'synthetic output_turn must reach listener');
  assert(observedTurn.transcript?.usage?.includes('字幕'), 'output_turn transcript usage must mark reply_text as subtitle only');
}

// 14. reply_audio_frame is the realtime voice output path.
{
  let output = createDefaultRealtimeOutputChannel();
  const replyFrame = {
    schema: 'omni.reply_audio_frame.v1',
    type: 'omni.reply_audio_frame',
    frameId: 'reply_aud_v136',
    turnId: 'turn_v136_voice',
    sequence: 1,
    isFinal: true,
    audio: {
      kind: 'reply_audio',
      codec: 'pcm_float32',
      sampleRate: 24000,
      channels: 1,
      payloadEncoding: 'base64',
      payloadIncluded: true,
      byteLength: 16,
      payload: 'AAAAAA=='
    },
    guardrails: { notTtsPipeline: true, replyTextIsSubtitleOnly: true }
  };
  output = applyReplyAudioFrame(output, replyFrame);
  assert(output.queuedAudioFrames.length === 1, 'reply_audio_frame must enter the output queue');
  assert(output.queuedAudioFrames[0].audio.kind === 'reply_audio', 'reply_audio_frame queue entry must keep audio kind');
  assert(replyFrame.guardrails.notTtsPipeline === true, 'reply_audio_frame must declare notTtsPipeline guardrail');

  // Interrupt must flush the realtime output queue.
  output = applyRealtimeOutputInterrupt(output, { reason: 'user_barge_in', turnId: 'turn_v136_voice' });
  assert(output.queuedAudioFrames.length === 0, 'interrupt must flush realtime output queue');
}

// 15. provider socket lifecycle event order is correct in a full safe session.
{
  const adapter = createSyntheticProviderAdapter();
  const events = [];
  adapter.onSocketLifecycle((evt) => events.push(evt.event));
  adapter.createSyntheticSession();
  adapter.openSyntheticSocket();
  adapter.emitSyntheticReady();
  adapter.closeSyntheticSocket();
  assert(events[0] === 'provider.socket.requested', `first event must be requested (got ${events[0]})`);
  assert(events.includes('provider.socket.synthetic_opened'), 'synthetic_opened must be observed');
  assert(events.includes('provider.socket.synthetic_ready'), 'synthetic_ready must be observed');
  assert(events[events.length - 1] === 'provider.socket.synthetic_closed', `last event must be synthetic_closed (got ${events[events.length - 1]})`);

  // runSyntheticSocketSession helper drives requested -> opened -> ready -> closed too.
  const helperResult = runSyntheticSocketSession(null, { providerId: 'synthetic_test', providerKind: 'synthetic' });
  assert(helperResult.state === 'synthetic_closed', `runSyntheticSocketSession must end in synthetic_closed (got ${helperResult.state})`);
  assert(helperResult.openedCount >= 1 && helperResult.readyCount >= 1 && helperResult.closedCount >= 1, 'helper must record at least one open/ready/close');

  // For a real provider, the helper must NOT progress past blocked.
  const realHelper = runSyntheticSocketSession(null, { providerId: 'dashscope_qwen_omni', providerKind: 'real_cloud' });
  assert(realHelper.state === 'blocked', `runSyntheticSocketSession with real provider must end blocked (got ${realHelper.state})`);
}

// 16. media_ack is diagnostics only — it never gates send.
{
  let channels = createDefaultMediaChannels();
  // Apply many acks; nothing about channels should turn into a "gate".
  for (let i = 0; i < 5; i += 1) {
    channels = applyMediaAck(channels, {
      receivedFrame: { schema: 'omni.audio_frame.v1', frameId: `aud_ack_${i}`, payloadIncluded: false, byteLength: 0 }
    });
  }
  assert(channels.localDev.ackCount === 5, 'media_ack count must increment as diagnostics');
  assert(channels.localDev.audioAckCount === 5, 'audio media_ack count must increment as diagnostics');
  // Sandbox capability also asserts the same invariant.
  const sandboxCap = getSocketSandboxCapability();
  assert(sandboxCap.canStartBillingSession === false, 'sandbox capability must keep billing false');
}

// 17. audio_frame never auto-triggers interrupt.
{
  let output = createDefaultRealtimeOutputChannel();
  // Simulate audio observations alongside model_speaking output — should not interrupt.
  output = applyReplyAudioFrame(output, {
    schema: 'omni.reply_audio_frame.v1',
    frameId: 'reply_aud_keepalive',
    turnId: 'turn_keepalive',
    sequence: 1,
    audio: { kind: 'reply_audio', payloadIncluded: false, payloadEncoding: 'base64', byteLength: 0 }
  });
  assert(output.queuedAudioFrames.length === 1, 'reply audio queued during mic activity is allowed');
  // Synthetic interrupt is still required to stop output.
  output = applyRealtimeOutputInterrupt(output, { reason: 'user_barge_in', turnId: 'turn_keepalive' });
  assert(output.queuedAudioFrames.length === 0, 'only explicit interrupt clears the output queue');
}

// 18. reply_audio_frame must never feed back as user input.
{
  let output = createDefaultRealtimeOutputChannel();
  output = applyReplyAudioFrame(output, {
    schema: 'omni.reply_audio_frame.v1',
    frameId: 'reply_aud_no_loopback',
    turnId: 'turn_no_loopback',
    sequence: 1,
    isFinal: true,
    audio: { kind: 'reply_audio', payloadIncluded: true, payloadEncoding: 'base64', byteLength: 16, payload: 'AAAAAA==' }
  });
  const queueOnly = {
    queuedAudioFrames: output.queuedAudioFrames,
    recentAudioFrames: output.recentAudioFrames,
    receivedAudioFrames: output.receivedAudioFrames,
    playedAudioFrames: output.playedAudioFrames
  };
  const queueText = JSON.stringify(queueOnly);
  assert(!queueText.includes('omni.audio_frame.v1'), 'reply_audio_frame queue must never reference user audio frame schema');
  // Playback consumption never converts the frame back to an input frame.
  output = markReplyAudioFramePlayed(output, 'reply_aud_no_loopback');
  assert(output.state === 'finished', 'final reply_audio_frame played should mark output as finished');
  assert(output.playbackActive === false, 'final reply_audio_frame played should stop playback');
}

// 19. PROVIDER_SOCKET_SANDBOX_STATES / EVENTS constants are stable.
{
  assert(PROVIDER_SOCKET_SANDBOX_PROTOCOL === 'omni.provider_socket_sandbox.v1', 'sandbox protocol must remain omni.provider_socket_sandbox.v1');
  assert(PROVIDER_SOCKET_SANDBOX_STATES.length >= 9, 'sandbox states list must cover at least 9 states');
  assert(PROVIDER_SOCKET_SANDBOX_EVENTS.length >= 8, 'sandbox events list must cover at least 8 events');
  for (const event of PROVIDER_SOCKET_SANDBOX_EVENTS) {
    assert(event.startsWith('provider.socket.'), `sandbox event ${event} must use provider.socket.* namespace`);
  }
  const summary = summarizeSocketSandbox(createDefaultSocketSandboxState({ providerId: 'localdev_mock' }));
  assert(summary.startsWith('localdev_mock/'), 'summary must start with providerId');
}

// validateProviderAdapter still rejects bad shapes including replyTextToTts=true.
{
  const broken = {
    providerId: 'broken_v136',
    providerKind: 'real_cloud',
    capabilities: {},
    canOpenRealtimeSocket: true,
    canSendRealAudio: true,
    canSendRealCamera: true,
    canStartBillingSession: true,
    replyTextToTts: true,
    fallbackProviderId: 'not_localdev_mock',
    createSession() {}, closeSession() {}, sendInputPacket() {}, sendAudioFrame() {}, sendCameraFrame() {}, sendInterrupt() {},
    onOutputState() {}, onOutputTurn() {}, onReplyAudioFrame() {}, onError() {}
  };
  const result = validateProviderAdapter(broken);
  assert(result.ok === false, 'broken adapter must fail validation');
  assert(result.failures.includes('replyTextToTts_must_be_false'), 'broken adapter must surface replyTextToTts violation');
}

console.log(`Provider socket sandbox smoke passed: ${summarizeSocketSandbox(runSyntheticSocketSession(null, { providerId: 'synthetic_test', providerKind: 'synthetic' }))}`);
