#!/usr/bin/env node
// v1.3.7 Provider Proxy Skeleton / Ephemeral Session Token smoke test.
//
// This script verifies the Provider Proxy Contract, the Ephemeral Session
// Token descriptor, the Provider Proxy Policy decisions, and the link into
// the v1.3.6 Provider Socket Sandbox. It does NOT open any real socket,
// does NOT upload real audio or real camera frames, does NOT start
// realtime billing, and does NOT connect `reply_text` to TTS.

import {
  PROVIDER_PROXY_CONTRACT_SCHEMA,
  PROVIDER_PROXY_REQUEST_SCHEMA,
  PROVIDER_PROXY_DECISION_SCHEMA,
  PROVIDER_PROXY_TOKEN_KINDS,
  PROVIDER_PROXY_DENIED_SCOPES,
  PROVIDER_PROXY_DEFAULT_TTL_MS,
  createProviderProxyContract,
  validateProviderProxyContract,
  summarizeProviderProxyContract
} from '../src/runtime/providerProxyContract.js';
import {
  EPHEMERAL_SESSION_TOKEN_SCHEMA,
  EPHEMERAL_TOKEN_DENIED_SCOPES,
  createEphemeralSessionToken,
  validateEphemeralSessionToken,
  isTokenActive
} from '../src/runtime/providerEphemeralSession.js';
import {
  createDefaultProviderProxyPolicy,
  evaluateProviderProxyRequest,
  requestEphemeralProviderSession,
  summarizeProviderProxyDecision,
  describeProxyForUi
} from '../src/runtime/providerProxyPolicy.js';
import {
  runSyntheticSocketSessionWithToken,
  validateSocketSandboxToken,
  PROVIDER_SOCKET_SANDBOX_ACCEPTED_TOKEN_KINDS,
  createDefaultSocketSandboxState
} from '../src/runtime/providerSocketSandbox.js';
import { createSyntheticProviderAdapter } from '../src/runtime/providerAdapters/syntheticProviderAdapter.js';
import { createProviderAdapterDescriptor } from '../src/runtime/providerAdapterContract.js';
import {
  applyReplyAudioFrame,
  createDefaultRealtimeOutputChannel
} from '../src/runtime/realtimeOutputChannel.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertNoSecretLeak(serialized, label) {
  const probes = ['sk-v137-leak-canary', 'super-secret-rotate-me', 'tok_raw_v137_should_strip'];
  for (const probe of probes) {
    assert(!serialized.includes(probe), `${label}: secret-like value ${probe} must never leak`);
  }
}

function assertTokenSafetyLocked(token, label) {
  const safety = token?.safety || {};
  for (const key of ['opensRealSocket', 'canSendRealAudio', 'canSendRealCamera', 'canStartBillingSession', 'replyTextToTts', 'sentToProvider', 'uploaded', 'persisted']) {
    assert(safety[key] === false, `${label}: token safety.${key} must be false`);
  }
}

// 1. Provider Proxy Contract exists with the v1.3.7 schema id.
{
  const contract = createProviderProxyContract();
  assert(contract.schema === PROVIDER_PROXY_CONTRACT_SCHEMA, `contract.schema must equal ${PROVIDER_PROXY_CONTRACT_SCHEMA} (got ${contract.schema})`);
  const validation = validateProviderProxyContract(contract);
  assert(validation.ok, `contract must validate ok (failures=${validation.failures?.join(',') || ''})`);
  assert(summarizeProviderProxyContract(contract).includes('proxy=required'), 'summary must mark proxy=required');
}

// 2. frontendCanHoldApiKey must be false.
{
  const contract = createProviderProxyContract();
  assert(contract.frontendCanHoldApiKey === false, 'frontendCanHoldApiKey must be false');
}

// 3. browserDirectProviderSocketAllowed must be false.
{
  const contract = createProviderProxyContract();
  assert(contract.browserDirectProviderSocketAllowed === false, 'browserDirectProviderSocketAllowed must be false');
}

// 4. serverSideSecretRequired must be true.
{
  const contract = createProviderProxyContract();
  assert(contract.serverSideSecretRequired === true, 'serverSideSecretRequired must be true');
}

// 5. synthetic_test / localdev_mock may receive a synthetic_only ephemeral token descriptor.
{
  const policy = createDefaultProviderProxyPolicy();
  for (const providerId of ['synthetic_test', 'localdev_mock']) {
    const decision = evaluateProviderProxyRequest({
      providerId,
      tokenKind: 'synthetic_only',
      robotId: 'r_v137',
      sessionId: 'omni_v137_session'
    }, policy);
    assert(decision.schema === PROVIDER_PROXY_DECISION_SCHEMA, `decision schema must be ${PROVIDER_PROXY_DECISION_SCHEMA}`);
    assert(decision.decision === 'granted', `${providerId} must receive granted decision (got ${decision.decision})`);
    assert(decision.token?.schema === EPHEMERAL_SESSION_TOKEN_SCHEMA, 'token must carry omni.ephemeral_session_token.v1 schema');
    assert(decision.token.tokenKind === 'synthetic_only', `${providerId} token kind must be synthetic_only`);
    assertTokenSafetyLocked(decision.token, providerId);
  }
}

// 6. real_cloud / self_hosted are denied by default.
{
  const policy = createDefaultProviderProxyPolicy();
  for (const providerId of ['dashscope_qwen_omni', 'custom_realtime_omni']) {
    const decision = evaluateProviderProxyRequest({ providerId }, policy);
    assert(decision.decision === 'denied', `${providerId} must be denied by default (got ${decision.decision})`);
    assert(decision.token === null, `${providerId} denied decision must not include a token`);
    assert(Array.isArray(decision.blockReasons) && decision.blockReasons.length > 0, `${providerId} denied decision must explain block reasons`);
  }
}

// 7. token scope must only contain synthetic/dry-run scopes.
{
  const policy = createDefaultProviderProxyPolicy();
  const synthetic = evaluateProviderProxyRequest({ providerId: 'synthetic_test', tokenKind: 'synthetic_only' }, policy);
  assert(synthetic.decision === 'granted', 'synthetic decision must be granted');
  for (const s of synthetic.token.scope) {
    assert(s.startsWith('provider.synthetic.'), `synthetic_only scope ${s} must start with provider.synthetic.`);
  }
  const dryRun = evaluateProviderProxyRequest({ providerId: 'synthetic_test', tokenKind: 'dry_run_only' }, policy);
  assert(dryRun.decision === 'granted', 'dry-run decision must be granted');
  for (const s of dryRun.token.scope) {
    assert(s.startsWith('provider.dry_run.'), `dry_run_only scope ${s} must start with provider.dry_run.`);
  }
}

// 8. token.deniedScopes must include the v1.3.7 denied scopes.
{
  const token = createEphemeralSessionToken({ providerId: 'synthetic_test', tokenKind: 'synthetic_only' });
  for (const required of [
    'provider.realtime.open',
    'media.audio.upload',
    'media.camera.upload',
    'billing.start',
    'reply_text.tts'
  ]) {
    assert(token.deniedScopes.includes(required), `token.deniedScopes must include ${required}`);
  }
  for (const required of PROVIDER_PROXY_DENIED_SCOPES) {
    assert(EPHEMERAL_TOKEN_DENIED_SCOPES.includes(required), `EPHEMERAL_TOKEN_DENIED_SCOPES must include ${required}`);
  }
}

// 9. token safety must lock all dangerous bits to false.
{
  const token = createEphemeralSessionToken({ providerId: 'localdev_mock', tokenKind: 'synthetic_only' });
  assertTokenSafetyLocked(token, 'createEphemeralSessionToken');
  const validation = validateEphemeralSessionToken(token);
  assert(validation.ok, `token must validate ok (failures=${validation.failures?.join(',') || ''})`);
  assert(isTokenActive(token), 'fresh token must be active');
}

// 10. Request containing apiKey / secret / tokenRawValue must be stripped from response.
{
  const policy = createDefaultProviderProxyPolicy();
  const request = {
    providerId: 'synthetic_test',
    tokenKind: 'synthetic_only',
    apiKey: 'sk-v137-leak-canary',
    secret: 'super-secret-rotate-me',
    tokenRawValue: 'tok_raw_v137_should_strip',
    nested: {
      client_secret: 'sk-v137-leak-canary',
      authorization: 'Bearer sk-v137-leak-canary'
    }
  };
  const decision = evaluateProviderProxyRequest(request, policy);
  assert(decision.secretStripped === true, 'secretStripped must be true when any secret-like field is present');
  assert(Array.isArray(decision.strippedFields) && decision.strippedFields.length >= 3, 'strippedFields must list dropped keys');
  const serialized = JSON.stringify(decision);
  assertNoSecretLeak(serialized, 'decision');
  // Scrubbed request must not echo secret-like keys back as object fields.
  const scrubbedSerialized = JSON.stringify(decision.scrubbedRequest || {});
  for (const droppedKey of ['apiKey', 'secret', 'tokenRawValue', 'authorization', 'client_secret']) {
    assert(!scrubbedSerialized.includes(`"${droppedKey}"`), `scrubbedRequest must not contain key ${droppedKey}`);
  }
}

// 11. fallbackProviderId must be localdev_mock everywhere.
{
  const contract = createProviderProxyContract();
  assert(contract.fallbackProviderId === 'localdev_mock', 'contract.fallbackProviderId must be localdev_mock');
  const policy = createDefaultProviderProxyPolicy();
  assert(policy.fallbackProviderId === 'localdev_mock', 'policy.fallbackProviderId must be localdev_mock');
  const granted = evaluateProviderProxyRequest({ providerId: 'synthetic_test' }, policy);
  assert(granted.fallbackProviderId === 'localdev_mock', 'granted decision fallback must be localdev_mock');
  assert(granted.token.fallbackProviderId === 'localdev_mock', 'token fallback must be localdev_mock');
  const denied = evaluateProviderProxyRequest({ providerId: 'dashscope_qwen_omni' }, policy);
  assert(denied.fallbackProviderId === 'localdev_mock', 'denied decision fallback must be localdev_mock');
}

// 12. real audio upload request must be denied.
{
  const decision = evaluateProviderProxyRequest({ providerId: 'localdev_mock', realAudioUpload: true }, createDefaultProviderProxyPolicy());
  assert(decision.decision === 'denied', 'real audio upload request must be denied');
  assert(decision.blockReasons.some((r) => r.includes('realAudioUpload') || r.includes('media.audio.upload')), 'block reason must mention audio upload');
}

// 13. real camera upload request must be denied.
{
  const decision = evaluateProviderProxyRequest({ providerId: 'localdev_mock', realCameraUpload: true }, createDefaultProviderProxyPolicy());
  assert(decision.decision === 'denied', 'real camera upload request must be denied');
  assert(decision.blockReasons.some((r) => r.includes('realCameraUpload') || r.includes('media.camera.upload')), 'block reason must mention camera upload');
}

// 14. realtime billing request must be denied.
{
  const decision = evaluateProviderProxyRequest({ providerId: 'localdev_mock', realtimeBilling: true }, createDefaultProviderProxyPolicy());
  assert(decision.decision === 'denied', 'realtime billing request must be denied');
  assert(decision.blockReasons.some((r) => r.includes('billing')), 'block reason must mention billing');
}

// 15. real provider socket request must be denied.
{
  const decision = evaluateProviderProxyRequest({ providerId: 'synthetic_test', realProviderSocket: true }, createDefaultProviderProxyPolicy());
  assert(decision.decision === 'denied', 'real provider socket request must be denied');
  assert(decision.blockReasons.some((r) => r.includes('realProviderSocket') || r.includes('provider.realtime.open')), 'block reason must mention real provider socket');
}

// 16. reply_text -> TTS request must be denied.
{
  const decision = evaluateProviderProxyRequest({ providerId: 'localdev_mock', replyTextToTts: true }, createDefaultProviderProxyPolicy());
  assert(decision.decision === 'denied', 'reply_text -> TTS request must be denied');
  assert(decision.blockReasons.some((r) => r.includes('replyTextToTts') || r.includes('reply_text.tts')), 'block reason must mention reply_text.tts');
}

// 17. synthetic socket sandbox can accept synthetic_only token for synthetic lifecycle.
{
  const decision = requestEphemeralProviderSession({ providerId: 'synthetic_test', tokenKind: 'synthetic_only' });
  assert(decision.decision === 'granted', 'synthetic decision must be granted');
  const sandbox = runSyntheticSocketSessionWithToken(null, decision.token, { providerId: 'synthetic_test', providerKind: 'synthetic' });
  assert(sandbox.state === 'synthetic_closed', `token-gated synthetic lifecycle must end in synthetic_closed (got ${sandbox.state})`);
  assert(sandbox.requiresEphemeralToken === true, 'sandbox.requiresEphemeralToken must be true');
  assert(sandbox.acceptedTokenKinds.includes('synthetic_only'), 'sandbox.acceptedTokenKinds must include synthetic_only');
  assert(sandbox.tokenAcceptedCount >= 1, 'sandbox must record token acceptance');
  assert(sandbox.safety.opensRealSocket === false, 'sandbox.safety.opensRealSocket must remain false even with token');

  // Adapter path with token gating.
  const adapter = createSyntheticProviderAdapter();
  adapter.createSyntheticSession({ correlation: { sessionId: 'omni_v137_adapter' } });
  const acceptedToken = createEphemeralSessionToken({ providerId: adapter.providerId, tokenKind: 'synthetic_only' });
  const accepted = adapter.acceptEphemeralToken(acceptedToken);
  assert(accepted.ok === true, 'adapter must accept synthetic_only token');
  const opened = adapter.openSyntheticSocketWithToken(acceptedToken);
  assert(opened.ok !== false || opened.socketSandbox.state !== 'blocked', 'token-gated synthetic open must not be blocked');
  assert(opened.socketSandbox.state === 'synthetic_open', `adapter sandbox should be synthetic_open (got ${opened.socketSandbox.state})`);
  adapter.closeSyntheticSocket('synthetic_close_after_token');

  // Sandbox without a token must NOT enter ready.
  const noTokenValidation = validateSocketSandboxToken(createDefaultSocketSandboxState({ providerId: 'synthetic_test', providerKind: 'synthetic' }), null);
  assert(noTokenValidation.ok === false, 'token validation must fail when no token is provided');
  assert(noTokenValidation.reason === 'ephemeral_token_required', `no-token reason must be ephemeral_token_required (got ${noTokenValidation.reason})`);
  const noTokenSandbox = runSyntheticSocketSessionWithToken(null, null, { providerId: 'synthetic_test', providerKind: 'synthetic' });
  assert(noTokenSandbox.state !== 'synthetic_ready' && noTokenSandbox.state !== 'synthetic_closed', `no-token sandbox must not reach ready/closed (got ${noTokenSandbox.state})`);
  assert(noTokenSandbox.tokenRejectedCount >= 1, 'no-token sandbox must record token rejection');
}

// 18. synthetic token cannot make real_cloud provider open a socket.
{
  const policy = createDefaultProviderProxyPolicy();
  const syntheticToken = createEphemeralSessionToken({ providerId: 'dashscope_qwen_omni', tokenKind: 'synthetic_only' });
  const sandbox = runSyntheticSocketSessionWithToken(null, syntheticToken, { providerId: 'dashscope_qwen_omni', providerKind: 'real_cloud' });
  assert(sandbox.state === 'blocked', `real provider must stay blocked even with synthetic token (got ${sandbox.state})`);
  assert(sandbox.safety.opensRealSocket === false, 'real provider sandbox.safety.opensRealSocket must remain false');

  const direct = evaluateProviderProxyRequest({ providerId: 'dashscope_qwen_omni', tokenKind: 'synthetic_only' }, policy);
  assert(direct.decision === 'denied', 'real_cloud direct request must be denied even with synthetic_only intent');
  assert(direct.token === null, 'denied decision for real provider must not include a token');

  // Adapter API key must not leak into the descriptor either.
  const descriptor = createProviderAdapterDescriptor({
    adapter: { key: 'wifi_cloud', apiKey: 'sk-v137-leak-canary' },
    providerConfig: { providerId: 'dashscope_qwen_omni', apiKey: 'sk-v137-leak-canary' }
  });
  assertNoSecretLeak(JSON.stringify(descriptor), 'providerAdapterDescriptor');
  assert(descriptor.providerProxy?.schema === PROVIDER_PROXY_CONTRACT_SCHEMA, 'descriptor must surface providerProxy contract schema');
  assert(descriptor.providerProxy?.frontendCanHoldApiKey === false, 'descriptor providerProxy must lock frontend api key to false');
}

// 19. reply_audio_frame remains the realtime voice output path; reply_text never becomes TTS input.
{
  let output = createDefaultRealtimeOutputChannel();
  output = applyReplyAudioFrame(output, {
    schema: 'omni.reply_audio_frame.v1',
    frameId: 'reply_aud_v137',
    turnId: 'turn_v137_voice',
    sequence: 1,
    isFinal: true,
    audio: {
      kind: 'reply_audio',
      codec: 'pcm_float32',
      sampleRate: 24000,
      channels: 1,
      payloadEncoding: 'base64',
      payloadIncluded: true,
      byteLength: 32,
      payload: 'AAAAAA=='
    },
    guardrails: { notTtsPipeline: true, replyTextIsSubtitleOnly: true }
  });
  assert(output.queuedAudioFrames.length === 1, 'reply_audio_frame must remain the realtime voice output path');
  assert(output.queuedAudioFrames[0].audio.kind === 'reply_audio', 'reply_audio_frame queue entry must keep audio kind');
  const contract = createProviderProxyContract();
  assert(contract.replyAudioFrameNative === true, 'contract.replyAudioFrameNative must remain true');
  assert(contract.replyTextToTts === false, 'contract.replyTextToTts must remain false');
}

// 20. ASR -> LLM -> TTS regression path must not exist.
{
  const contract = createProviderProxyContract();
  assert(contract.guardrails.asrLlmTtsRegressionForbidden === true, 'contract.guardrails.asrLlmTtsRegressionForbidden must be true');
  assert(contract.guardrails.replyTextNotTtsInput === true, 'contract.guardrails.replyTextNotTtsInput must be true');
  assert(contract.guardrails.replyAudioFrameIsRealtimeVoiceOutput === true, 'contract.guardrails.replyAudioFrameIsRealtimeVoiceOutput must be true');

  const descriptor = createProviderAdapterDescriptor({
    providerConfig: { providerId: 'dashscope_qwen_omni', enabled: true, mode: 'realtime_experimental', endpointConfigured: true, apiKeyConfigured: true }
  });
  assert(descriptor.replyTextToTts === false, 'descriptor.replyTextToTts must remain false');
  assert(descriptor.guardrails.asrLlmTtsRegressionForbidden === true, 'descriptor guardrails must forbid ASR->LLM->TTS regression');
  assert(descriptor.providerProxy?.replyTextToTts === false, 'descriptor.providerProxy.replyTextToTts must remain false');

  // Constants stable.
  assert(Array.isArray(PROVIDER_PROXY_TOKEN_KINDS) && PROVIDER_PROXY_TOKEN_KINDS.includes('synthetic_only') && PROVIDER_PROXY_TOKEN_KINDS.includes('dry_run_only'), 'PROVIDER_PROXY_TOKEN_KINDS must include synthetic_only and dry_run_only');
  assert(PROVIDER_PROXY_REQUEST_SCHEMA === 'omni.provider_proxy_request.v1', 'request schema must be omni.provider_proxy_request.v1');
  assert(PROVIDER_PROXY_DEFAULT_TTL_MS > 0, 'default TTL must be positive');
  assert(PROVIDER_SOCKET_SANDBOX_ACCEPTED_TOKEN_KINDS.includes('synthetic_only'), 'sandbox must accept synthetic_only tokens');
  assert(describeProxyForUi(createDefaultProviderProxyPolicy(), null).proxyRequired === true, 'describeProxyForUi must declare proxy required');
}

const summary = summarizeProviderProxyDecision(evaluateProviderProxyRequest({ providerId: 'synthetic_test', tokenKind: 'synthetic_only' }, createDefaultProviderProxyPolicy()));
console.log(`Provider proxy contract smoke passed: ${summary}`);
