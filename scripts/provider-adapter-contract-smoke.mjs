#!/usr/bin/env node
// v1.3.5 Provider Adapter Contract / Real Provider Safety Boundary smoke test.
//
// This script verifies the Provider Adapter Contract and synthetic-only
// adapter behavior. It does not open any provider socket, does not upload
// real audio, does not upload real camera, does not start realtime billing,
// and does not connect `reply_text` to TTS.

import {
  BUILTIN_PROVIDER_CAPABILITIES,
  PROVIDER_CAPABILITY_KEYS,
  PROVIDER_KINDS,
  BILLING_RISK_LEVELS,
  getProviderCapability,
  listProviderCapabilities,
  mergeProviderCapability,
  summarizeProviderCapability
} from '../src/runtime/providerCapabilities.js';
import {
  PROVIDER_ADAPTER_SCHEMA,
  PROVIDER_ADAPTER_CONTRACT_METHODS,
  PROVIDER_ADAPTER_REQUIRED_SCHEMAS,
  createProviderAdapterDescriptor,
  summarizeProviderAdapterDescriptor,
  validateProviderAdapter
} from '../src/runtime/providerAdapterContract.js';
import { createSyntheticProviderAdapter } from '../src/runtime/providerAdapters/syntheticProviderAdapter.js';
import { evaluateProviderGate, normalizeProviderConfig } from '../src/runtime/providerGate.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// 1. localdev_mock capability is correct and stays mock-only.
{
  const cap = getProviderCapability('localdev_mock');
  assert(cap, 'localdev_mock capability must exist');
  assert(cap.providerKind === 'localdev_mock', `localdev_mock kind must be localdev_mock (got ${cap.providerKind})`);
  assert(cap.supportsRealtimeSocket === true, 'localdev_mock declares mock realtime socket support');
  assert(cap.supportsAudioInput === true, 'localdev_mock supports audio input over mock realtime');
  assert(cap.supportsCameraInput === true, 'localdev_mock supports camera input over mock realtime');
  assert(cap.supportsReplyAudioFrame === true, 'localdev_mock supports reply_audio_frame');
  assert(cap.supportsInterrupt === true, 'localdev_mock supports interrupt');
  assert(cap.requiresServerSideSecret === false, 'localdev_mock does not require a server-side secret');
  assert(cap.billingRisk === 'mock_only', `localdev_mock billing risk must be mock_only (got ${cap.billingRisk})`);
  assert(cap.experimentalOnly === false, 'localdev_mock is not experimental-only');
  assert(cap.defaultSafetyMode === 'mock_only', 'localdev_mock default safety mode must be mock_only');
  assert(cap.fallbackProviderId === 'localdev_mock', 'localdev_mock fallback must be localdev_mock');
  assert(cap.safety.canOpenRealtimeSocket === false, 'localdev_mock real-cloud socket lock must remain false');
  assert(cap.safety.canSendRealAudio === false, 'localdev_mock real audio lock must remain false');
  assert(cap.safety.canSendRealCamera === false, 'localdev_mock real camera lock must remain false');
  assert(cap.safety.canStartBillingSession === false, 'localdev_mock billing lock must remain false');
  assert(cap.safety.replyTextToTts === false, 'localdev_mock TTS lock must remain false');
}

// 2. Real provider capability is declared but default-blocked.
{
  for (const providerId of ['dashscope_qwen_omni', 'custom_realtime_omni']) {
    const cap = getProviderCapability(providerId);
    assert(cap, `${providerId} capability must exist`);
    assert(['real_cloud', 'self_hosted'].includes(cap.providerKind), `${providerId} kind must be real_cloud or self_hosted (got ${cap.providerKind})`);
    assert(cap.requiresServerSideSecret === true, `${providerId} must require server-side secret`);
    assert(cap.experimentalOnly === true, `${providerId} must remain experimental-only`);
    assert(cap.fallbackProviderId === 'localdev_mock', `${providerId} fallback must be localdev_mock`);
    assert(cap.safety.canOpenRealtimeSocket === false, `${providerId} must not open a real realtime socket by default`);
    assert(cap.safety.canSendRealAudio === false, `${providerId} must not send real audio by default`);
    assert(cap.safety.canSendRealCamera === false, `${providerId} must not send real camera by default`);
    assert(cap.safety.canStartBillingSession === false, `${providerId} must not start billing by default`);
    assert(cap.safety.replyTextToTts === false, `${providerId} must not enable reply_text -> TTS`);
  }
}

// 3. synthetic adapter is synthetic-only.
{
  const adapter = createSyntheticProviderAdapter();
  assert(adapter.providerId === 'synthetic_test', 'synthetic adapter providerId must be synthetic_test');
  assert(adapter.providerKind === 'synthetic', 'synthetic adapter kind must be synthetic');
  assert(adapter.canOpenRealtimeSocket === false, 'synthetic adapter must never open a real socket');
  assert(adapter.canSendRealAudio === false, 'synthetic adapter must never send real audio');
  assert(adapter.canSendRealCamera === false, 'synthetic adapter must never send real camera');
  assert(adapter.canStartBillingSession === false, 'synthetic adapter must never start billing');
  assert(adapter.replyTextToTts === false, 'synthetic adapter must never connect reply_text to TTS');
  assert(adapter.fallbackProviderId === 'localdev_mock', 'synthetic adapter fallback must be localdev_mock');

  const session = adapter.createSession({ correlation: { sessionId: 'omni_session_test', robotId: 'r_test', displayName: 'TestBot' } });
  assert(session.ok === true && session.opensRealSocket === false, 'synthetic createSession must succeed without opening a real socket');

  // Real audio payload (no synthetic marker) MUST be rejected.
  const realAudioFrame = {
    schema: 'omni.audio_frame.v1',
    frameId: 'aud_real_1',
    sequence: 1,
    media: {
      kind: 'audio',
      codec: 'pcm_float32',
      sampleRate: 48000,
      channels: 1,
      payloadIncluded: true,
      payloadEncoding: 'base64',
      byteLength: 4096,
      payload: 'AAAA'
    }
  };
  const realAudioResult = adapter.sendAudioFrame(realAudioFrame);
  assert(realAudioResult.ok === false, 'synthetic adapter must reject real audio payload');
  assert(realAudioResult.sentToProvider === false, 'synthetic adapter must never report sentToProvider=true');
  assert(String(realAudioResult.reason).includes('synthetic_only') || String(realAudioResult.reason).includes('real_audio'), `synthetic adapter must explain real audio block (got ${realAudioResult.reason})`);

  // Real camera payload (no synthetic marker) MUST be rejected.
  const realCameraFrame = {
    schema: 'omni.camera_frame.v1',
    frameId: 'cam_real_1',
    sequence: 1,
    media: {
      kind: 'camera',
      codec: 'image/jpeg',
      width: 640,
      height: 480,
      payloadIncluded: true,
      payloadEncoding: 'base64',
      byteLength: 2048,
      payload: '/9j/AAAA'
    }
  };
  const realCameraResult = adapter.sendCameraFrame(realCameraFrame);
  assert(realCameraResult.ok === false, 'synthetic adapter must reject real camera payload');
  assert(realCameraResult.sentToProvider === false, 'synthetic adapter must never report sentToProvider=true for camera');
  assert(String(realCameraResult.reason).includes('synthetic_only') || String(realCameraResult.reason).includes('real_camera'), `synthetic adapter must explain real camera block (got ${realCameraResult.reason})`);

  // Synthetic-marked frames are accepted but never leave the adapter.
  const syntheticAudio = { ...realAudioFrame, frameId: 'aud_syn_1', synthetic: true, source: 'synthetic_test' };
  const acceptedAudio = adapter.sendAudioFrame(syntheticAudio);
  assert(acceptedAudio.ok === true, 'synthetic adapter must accept synthetic audio');
  assert(acceptedAudio.sentToProvider === false, 'synthetic-accepted audio must not be sent to any provider');
  assert(acceptedAudio.accepted === 'synthetic_only', `synthetic audio must be marked synthetic_only (got ${acceptedAudio.accepted})`);

  const syntheticCamera = { ...realCameraFrame, frameId: 'cam_syn_1', synthetic: true, source: 'synthetic_test' };
  const acceptedCamera = adapter.sendCameraFrame(syntheticCamera);
  assert(acceptedCamera.ok === true, 'synthetic adapter must accept synthetic camera');
  assert(acceptedCamera.sentToProvider === false, 'synthetic-accepted camera must not be sent to any provider');

  // Input packet always synthetic; sentToProvider must remain false.
  const packetResult = adapter.sendInputPacket({ schema: 'omni.input_packet.v1', packetId: 'packet_syn_1', source: 'synthetic_test' });
  assert(packetResult.ok === true && packetResult.sentToProvider === false, 'synthetic input packet must be accepted without provider traffic');

  // Interrupt
  const interruptResult = adapter.sendInterrupt({ schema: 'omni.interrupt.v1', interruptId: 'interrupt_syn_1', reason: 'user_barge_in' });
  assert(interruptResult.ok === true && interruptResult.sentToProvider === false, 'synthetic interrupt must be accepted without provider traffic');

  // Synthetic emitters drive listeners deterministically.
  let observedState = null;
  let observedReplyAudio = null;
  let observedTurn = null;
  adapter.onOutputState((state) => { observedState = state; });
  adapter.onReplyAudioFrame((frame) => { observedReplyAudio = frame; });
  adapter.onOutputTurn((turn) => { observedTurn = turn; });
  adapter.emitSyntheticOutputState({ schema: 'omni.output_state.v1', state: 'speaking', turnId: 'turn_syn_1' });
  adapter.emitSyntheticReplyAudioFrame({ schema: 'omni.reply_audio_frame.v1', frameId: 'reply_syn_1', sequence: 1, audio: { kind: 'reply_audio', payloadIncluded: false } });
  adapter.emitSyntheticOutputTurn({ schema: 'omni.output_turn.v1', turnId: 'turn_syn_1', reply_text: 'subtitle only' });
  assert(observedState?.state === 'speaking', 'synthetic adapter must deliver output_state to listener');
  assert(observedReplyAudio?.frameId === 'reply_syn_1', 'synthetic adapter must deliver reply_audio_frame to listener');
  assert(observedTurn?.turnId === 'turn_syn_1', 'synthetic adapter must deliver output_turn to listener');

  const stats = adapter.getStats();
  assert(stats.audioFramesRejected >= 1, 'rejected real audio must be counted');
  assert(stats.cameraFramesRejected >= 1, 'rejected real camera must be counted');
  assert(stats.audioFramesAccepted >= 1, 'accepted synthetic audio must be counted');
  assert(stats.cameraFramesAccepted >= 1, 'accepted synthetic camera must be counted');
}

// 4. real audio upload blocked at adapter contract layer.
{
  const descriptor = createProviderAdapterDescriptor({
    adapter: { key: 'wifi_cloud' },
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
  assert(descriptor.canSendAudio === false, 'real provider canSendAudio must remain false in descriptor');
}

// 5. real camera upload blocked at adapter contract layer.
{
  const descriptor = createProviderAdapterDescriptor({
    adapter: { key: 'wifi_cloud' },
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
  assert(descriptor.canSendCamera === false, 'real provider canSendCamera must remain false in descriptor');
}

// 6. realtime billing blocked at adapter contract layer.
{
  const descriptor = createProviderAdapterDescriptor({
    adapter: { key: 'wifi_cloud' },
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
  assert(descriptor.canStartBillingSession === false, 'real provider canStartBillingSession must remain false in descriptor');
}

// 7. real provider socket blocked by default.
{
  const descriptor = createProviderAdapterDescriptor({
    adapter: { key: 'wifi_cloud' },
    providerConfig: normalizeProviderConfig({
      providerId: 'dashscope_qwen_omni',
      enabled: true,
      mode: 'handshake_only',
      endpointConfigured: true,
      apiKeyConfigured: true,
      fallbackProviderId: 'localdev_mock'
    })
  });
  assert(descriptor.canOpenRealtimeSocket === false, 'real provider canOpenRealtimeSocket must remain false in descriptor');
  assert(descriptor.safetyMode === 'handshake_only', `descriptor safetyMode should follow handshake_only mode (got ${descriptor.safetyMode})`);
}

// 8. localdev_mock fallback required.
{
  // Bad fallback must surface as a reason on the descriptor and the gate.
  const badConfig = normalizeProviderConfig({
    providerId: 'dashscope_qwen_omni',
    enabled: true,
    mode: 'health_check_only',
    endpointConfigured: true,
    apiKeyConfigured: true,
    fallbackProviderId: 'custom_realtime_omni'
  });
  const badGate = evaluateProviderGate({ providerConfig: badConfig });
  assert(badGate.blockReasons.includes('mock_fallback_required'), 'non-mock fallback must surface mock_fallback_required');
  const badDescriptor = createProviderAdapterDescriptor({ providerConfig: badConfig });
  assert(badDescriptor.reasons.includes('mock_fallback_required'), 'descriptor must surface mock_fallback_required reason');
  assert(badDescriptor.fallbackProviderId === 'localdev_mock', 'descriptor fallback must always normalize to localdev_mock');
}

// 9. Contract preserves output_state / output_turn / reply_audio_frame / interrupt semantics.
{
  const localDescriptor = createProviderAdapterDescriptor({ providerConfig: normalizeProviderConfig({ providerId: 'localdev_mock', mode: 'mock', fallbackProviderId: 'localdev_mock' }) });
  for (const schema of [
    'omni.input_packet.v1',
    'omni.audio_frame.v1',
    'omni.camera_frame.v1',
    'omni.interrupt.v1',
    'omni.output_state.v1',
    'omni.output_turn.v1',
    'omni.reply_audio_frame.v1'
  ]) {
    assert(localDescriptor.supportedSchemas.includes(schema), `localdev_mock descriptor must list supported schema ${schema}`);
  }
  for (const method of ['createSession', 'closeSession', 'sendInputPacket', 'sendAudioFrame', 'sendCameraFrame', 'sendInterrupt', 'onOutputState', 'onOutputTurn', 'onReplyAudioFrame', 'onError']) {
    assert(localDescriptor.contractSurface[method] === 'required', `descriptor must declare ${method} as required surface`);
  }
  assert(PROVIDER_ADAPTER_REQUIRED_SCHEMAS.length === 7, 'PROVIDER_ADAPTER_REQUIRED_SCHEMAS must cover the 7 realtime schemas');
}

// 10. reply_text is never connected to TTS.
{
  for (const providerId of Object.keys(BUILTIN_PROVIDER_CAPABILITIES)) {
    const cap = BUILTIN_PROVIDER_CAPABILITIES[providerId];
    assert(cap.safety.replyTextToTts === false, `${providerId} replyTextToTts must remain false`);
  }
  const descriptor = createProviderAdapterDescriptor({ providerConfig: normalizeProviderConfig({ providerId: 'dashscope_qwen_omni', enabled: true, mode: 'realtime_experimental', endpointConfigured: true, apiKeyConfigured: true, allowAudioUpload: true, allowCameraUpload: true, allowRealtimeBilling: true, fallbackProviderId: 'localdev_mock' }) });
  assert(descriptor.replyTextToTts === false, 'descriptor must report replyTextToTts=false even when other realtime flags are requested');
  assert(descriptor.guardrails.replyTextNotTtsInput === true, 'descriptor guardrails must declare replyTextNotTtsInput');
}

// 11. API key / secrets do not enter frontend runtime config.
{
  // Adapter input intentionally carries an apiKey value to simulate misuse.
  const descriptor = createProviderAdapterDescriptor({
    adapter: { key: 'wifi_cloud', apiKey: 'sk-not-real-but-should-not-leak' },
    providerConfig: normalizeProviderConfig({
      providerId: 'dashscope_qwen_omni',
      enabled: true,
      mode: 'health_check_only',
      endpointConfigured: true,
      apiKeyConfigured: true,
      fallbackProviderId: 'localdev_mock'
    })
  });
  // Descriptor must not expose the secret anywhere.
  const serialized = JSON.stringify(descriptor);
  assert(!serialized.includes('sk-not-real-but-should-not-leak'), 'descriptor must not serialize a real-looking API key');
  assert(descriptor.secretBoundary.apiKeyInFrontend === false, 'secretBoundary must declare apiKeyInFrontend=false');
  assert(descriptor.secretBoundary.apiKeyInRuntimeConfig === false, 'secretBoundary must declare apiKeyInRuntimeConfig=false');
  assert(descriptor.secretBoundary.requiresServerSideSecret === true, 'real provider descriptor must require server-side secret');
  assert(descriptor.secretBoundary.serverSideProxyRecommended === true, 'real provider descriptor must recommend server-side proxy');
  assert(descriptor.guardrails.apiKeyMustNotEnterFrontend === true, 'descriptor guardrails must declare apiKeyMustNotEnterFrontend');
}

// 12. validateProviderAdapter against synthetic adapter passes.
{
  const adapter = createSyntheticProviderAdapter();
  const descriptor = createProviderAdapterDescriptor({ providerConfig: normalizeProviderConfig({ providerId: 'synthetic_test', mode: 'mock', fallbackProviderId: 'localdev_mock' }) });
  const result = validateProviderAdapter(adapter, descriptor);
  // synthetic adapter providerKind should match the descriptor; if the descriptor
  // resolved to localdev_mock (because synthetic_test isn't tied to a Provider Gate
  // config), allow that too — we only enforce safety locks here.
  for (const failure of result.failures) {
    assert(!failure.startsWith('canOpenRealtimeSocket'), `synthetic adapter must keep canOpenRealtimeSocket=false (failure=${failure})`);
    assert(!failure.startsWith('canSendRealAudio'), `synthetic adapter must keep canSendRealAudio=false (failure=${failure})`);
    assert(!failure.startsWith('canSendRealCamera'), `synthetic adapter must keep canSendRealCamera=false (failure=${failure})`);
    assert(!failure.startsWith('canStartBillingSession'), `synthetic adapter must keep canStartBillingSession=false (failure=${failure})`);
    assert(!failure.startsWith('replyTextToTts'), `synthetic adapter must keep replyTextToTts=false (failure=${failure})`);
    assert(failure !== 'fallback_must_be_localdev_mock', 'synthetic adapter fallback must remain localdev_mock');
  }
  // The contract surface must be fully implemented.
  const missingMethodFailures = result.failures.filter((failure) => failure.startsWith('missing_method:'));
  assert(missingMethodFailures.length === 0, `synthetic adapter must implement all contract methods (missing: ${missingMethodFailures.join(', ')})`);

  // A bad adapter shape must fail validation.
  const broken = {
    providerId: 'broken_test',
    providerKind: 'real_cloud',
    capabilities: { ...BUILTIN_PROVIDER_CAPABILITIES.dashscope_qwen_omni },
    canOpenRealtimeSocket: true, // <- safety violation
    canSendRealAudio: true,
    canSendRealCamera: true,
    canStartBillingSession: true,
    replyTextToTts: true,
    fallbackProviderId: 'not_localdev_mock',
    createSession() {}, closeSession() {}, sendInputPacket() {}, sendAudioFrame() {}, sendCameraFrame() {}, sendInterrupt() {},
    onOutputState() {}, onOutputTurn() {}, onReplyAudioFrame() {}, onError() {}
  };
  const brokenResult = validateProviderAdapter(broken);
  assert(brokenResult.ok === false, 'broken adapter shape must fail validation');
  assert(brokenResult.failures.includes('canOpenRealtimeSocket_must_be_false_in_default_demo'), 'broken adapter must surface canOpenRealtimeSocket violation');
  assert(brokenResult.failures.includes('canSendRealAudio_must_be_false_in_default_demo'), 'broken adapter must surface canSendRealAudio violation');
  assert(brokenResult.failures.includes('canSendRealCamera_must_be_false_in_default_demo'), 'broken adapter must surface canSendRealCamera violation');
  assert(brokenResult.failures.includes('canStartBillingSession_must_be_false_in_default_demo'), 'broken adapter must surface canStartBillingSession violation');
  assert(brokenResult.failures.includes('replyTextToTts_must_be_false'), 'broken adapter must surface replyTextToTts violation');
  assert(brokenResult.failures.includes('fallback_must_be_localdev_mock'), 'broken adapter must surface fallback violation');
}

// 13. mergeProviderCapability is narrowing-only.
{
  const dashscope = getProviderCapability('dashscope_qwen_omni');
  const widened = mergeProviderCapability('dashscope_qwen_omni', {
    supportsRealtimeSocket: true,
    requiresServerSideSecret: false,
    billingRisk: 'pay_per_use',
    experimentalOnly: false
  });
  // narrowing-only: booleans can only go true -> false, billing can only go safer.
  assert(widened.supportsRealtimeSocket === dashscope.supportsRealtimeSocket, 'merge must not flip support flags up');
  assert(widened.requiresServerSideSecret === true, 'merge cannot drop requiresServerSideSecret from true to false (safety-critical)');
  assert(widened.experimentalOnly === true, 'merge cannot drop experimentalOnly from true to false');
  assert(widened.billingRisk === 'pay_per_use', 'merge must keep dashscope billing risk because override equals base');

  // Narrowing succeeds.
  const narrowed = mergeProviderCapability('dashscope_qwen_omni', {
    supportsCameraInput: false,
    supportsAudioInput: false,
    billingRisk: 'none'
  });
  assert(narrowed.supportsCameraInput === false, 'merge can narrow supportsCameraInput true -> false');
  assert(narrowed.supportsAudioInput === false, 'merge can narrow supportsAudioInput true -> false');
  assert(narrowed.billingRisk === 'none', 'merge can narrow billing risk to a safer level');
  // Hard safety always remains locked.
  assert(narrowed.safety.canOpenRealtimeSocket === false, 'merge cannot reopen real socket');
  assert(narrowed.safety.canSendRealAudio === false, 'merge cannot reopen real audio');
  assert(narrowed.safety.canSendRealCamera === false, 'merge cannot reopen real camera');
  assert(narrowed.fallbackProviderId === 'localdev_mock', 'merge cannot change fallback away from localdev_mock');
}

// 14. PROVIDER_ADAPTER_SCHEMA is stable.
{
  assert(PROVIDER_ADAPTER_SCHEMA === 'omni.provider_adapter.v1', 'PROVIDER_ADAPTER_SCHEMA must remain omni.provider_adapter.v1');
  for (const method of PROVIDER_ADAPTER_CONTRACT_METHODS) {
    assert(typeof method === 'string' && method.length > 0, 'contract methods must be non-empty strings');
  }
  const list = listProviderCapabilities();
  const ids = list.map((cap) => cap.providerId);
  assert(ids.includes('localdev_mock'), 'capability list must include localdev_mock');
  assert(ids.includes('dashscope_qwen_omni'), 'capability list must include dashscope_qwen_omni');
  assert(ids.includes('custom_realtime_omni'), 'capability list must include custom_realtime_omni');
  assert(ids.includes('synthetic_test'), 'capability list must include synthetic_test');
  assert(ids.includes('offline_pet_engine'), 'capability list must include offline_pet_engine');
  for (const key of PROVIDER_CAPABILITY_KEYS) {
    assert(typeof key === 'string' && key.length > 0, 'PROVIDER_CAPABILITY_KEYS must be non-empty strings');
  }
  for (const kind of PROVIDER_KINDS) {
    assert(typeof kind === 'string' && kind.length > 0, 'PROVIDER_KINDS must be non-empty strings');
  }
  for (const risk of BILLING_RISK_LEVELS) {
    assert(typeof risk === 'string' && risk.length > 0, 'BILLING_RISK_LEVELS must be non-empty strings');
  }
}

console.log(`Provider adapter contract smoke passed: ${summarizeProviderAdapterDescriptor(createProviderAdapterDescriptor({ providerConfig: normalizeProviderConfig({ providerId: 'localdev_mock', mode: 'mock', fallbackProviderId: 'localdev_mock' }) }))}`);
