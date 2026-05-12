#!/usr/bin/env node
// v1.3.8 Provider Proxy Server Skeleton smoke test.
//
// Boots the local Mock skeleton server on a random port, runs 24 safety
// assertions over HTTP, and shuts the server down. It does NOT contact a
// real provider endpoint. It does NOT read a real BIGMODEL_API_KEY /
// DASHSCOPE_API_KEY / OPENAI_API_KEY. It does NOT upload real audio /
// camera. It does NOT start realtime billing. It does NOT connect
// `reply_text` to TTS.

import fs from 'node:fs';
import path from 'node:path';
import { startProviderProxySkeletonServer } from './provider-proxy-skeleton-server.mjs';
import { createEphemeralSessionToken } from '../src/runtime/providerEphemeralSession.js';
import { getProviderCapability, BUILTIN_PROVIDER_CAPABILITIES } from '../src/runtime/providerCapabilities.js';
import {
  PROVIDER_PROXY_HANDSHAKE_SANDBOX_PROTOCOL,
  PROVIDER_PROXY_HANDSHAKE_SANDBOX_STATES,
  PROVIDER_PROXY_HANDSHAKE_SANDBOX_EVENTS,
  createDefaultProxyHandshakeSandboxState,
  runProxyHandshakeDryRun,
  transitionProxyHandshakeSandbox
} from '../src/runtime/providerProxyHandshakeSandbox.js';
import {
  applyReplyAudioFrame,
  createDefaultRealtimeOutputChannel
} from '../src/runtime/realtimeOutputChannel.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertNoSecretLeak(serialized, label) {
  const probes = [
    'sk-bigmodel-canary-v138',
    'sk-dashscope-canary-v138',
    'sk-openai-canary-v138',
    'should-not-be-read-bigmodel',
    'should-not-be-read-dashscope'
  ];
  for (const probe of probes) {
    assert(!serialized.includes(probe), `${label}: secret canary ${probe} must never leak`);
  }
}

// Set canary env vars BEFORE starting the server. The skeleton must NEVER
// read these. We will assert below that none of these strings appear in
// any server response.
process.env.BIGMODEL_API_KEY = 'sk-bigmodel-canary-v138-should-not-be-read';
process.env.BIGMODEL_TOKEN = 'should-not-be-read-bigmodel';
process.env.DASHSCOPE_API_KEY = 'sk-dashscope-canary-v138-should-not-be-read';
process.env.DASHSCOPE_TOKEN = 'should-not-be-read-dashscope';
process.env.QWEN_API_KEY = 'sk-qwen-canary-v138-should-not-be-read';
process.env.OPENAI_API_KEY = 'sk-openai-canary-v138-should-not-be-read';
process.env.MINIMAX_API_KEY = 'sk-minimax-canary-v138-should-not-be-read';

const handle = await startProviderProxySkeletonServer({ port: 0, host: '127.0.0.1' });
const baseUrl = handle.baseUrl;

async function getJson(pathname) {
  const res = await fetch(`${baseUrl}${pathname}`);
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body, raw: text, headers: Object.fromEntries(res.headers) };
}

async function postJson(pathname, payload) {
  const res = await fetch(`${baseUrl}${pathname}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {})
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body, raw: text, headers: Object.fromEntries(res.headers) };
}

try {
  // 1. health endpoint returns omni.provider_proxy_health.v1.
  {
    const { status, body, raw } = await getJson('/health');
    assert(status === 200, `/health status must be 200 (got ${status})`);
    assert(body.schema === 'omni.provider_proxy_health.v1', `/health schema must equal omni.provider_proxy_health.v1 (got ${body.schema})`);
    assert(body.productionReady === false, '/health productionReady must be false');
    assert(body.callsRealProviderEndpoint === false, '/health callsRealProviderEndpoint must be false');
    assert(body.readsRealApiKeyEnv === false, '/health readsRealApiKeyEnv must be false');
    assert(body.envGuard && Array.isArray(body.envGuard.refusedEnvVars) && body.envGuard.refusedEnvVars.includes('BIGMODEL_API_KEY'), '/health envGuard must declare BIGMODEL_API_KEY refused');
    assertNoSecretLeak(raw, '/health raw body');
  }

  // 2. contract endpoint returns proxyRequired=true.
  // 3. frontendCanHoldApiKey=false.
  // 4. browserDirectProviderSocketAllowed=false.
  {
    const { status, body, raw } = await getJson('/provider-proxy/contract');
    assert(status === 200, `/contract status must be 200 (got ${status})`);
    assert(body.schema === 'omni.provider_proxy_server_contract.v1', `/contract schema must equal omni.provider_proxy_server_contract.v1 (got ${body.schema})`);
    assert(body.proxyContract?.proxyRequired === true, 'contract.proxyContract.proxyRequired must be true');
    assert(body.frontendCanHoldApiKey === false, 'contract.frontendCanHoldApiKey must be false');
    assert(body.browserDirectProviderSocketAllowed === false, 'contract.browserDirectProviderSocketAllowed must be false');
    assert(body.serverSideSecretRequired === true, 'contract.serverSideSecretRequired must be true');
    assert(body.productionReady === false, 'contract.productionReady must be false');
    assert(Array.isArray(body.endpoints) && body.endpoints.length >= 6, 'contract.endpoints must list at least 6 endpoints');
    assertNoSecretLeak(raw, '/contract raw body');
  }

  // 5. session request for localdev_mock / synthetic_test returns synthetic_only token descriptor.
  {
    for (const providerId of ['localdev_mock', 'synthetic_test']) {
      const { status, body, raw } = await postJson('/provider-proxy/session/request', { providerId, tokenKind: 'synthetic_only', robotId: 'r_v138' });
      assert(status === 200, `session request for ${providerId} must return 200 (got ${status})`);
      assert(body.schema === 'omni.provider_proxy_decision.v1', `decision schema must be omni.provider_proxy_decision.v1 (got ${body.schema})`);
      assert(body.decision === 'granted', `${providerId} session request must be granted`);
      assert(body.token?.schema === 'omni.ephemeral_session_token.v1', `${providerId} session request must include omni.ephemeral_session_token.v1`);
      assert(body.token.tokenKind === 'synthetic_only', `${providerId} token kind must be synthetic_only`);
      assert(body.token.safety?.opensRealSocket === false, `${providerId} token.safety.opensRealSocket must be false`);
      assert(body.token.safety?.canStartBillingSession === false, `${providerId} token.safety.canStartBillingSession must be false`);
      assertNoSecretLeak(raw, `session request ${providerId} raw body`);
    }
  }

  // 6. real_cloud provider session request is denied.
  {
    for (const providerId of ['dashscope_qwen_omni', 'custom_realtime_omni']) {
      const { status, body, raw } = await postJson('/provider-proxy/session/request', { providerId, tokenKind: 'synthetic_only' });
      assert(status === 403, `${providerId} session request must return 403 (got ${status})`);
      assert(body.decision === 'denied', `${providerId} decision must be denied (got ${body.decision})`);
      assert(body.token === null, `${providerId} denied decision must not include a token`);
      assertNoSecretLeak(raw, `session request ${providerId} raw body`);
    }
  }

  // 7. handshake dry-run does not open a real socket.
  // 8. handshake dry-run does not upload audio.
  // 9. handshake dry-run does not upload camera.
  // 10. handshake dry-run does not start billing.
  {
    const token = createEphemeralSessionToken({ providerId: 'synthetic_test', tokenKind: 'synthetic_only' });
    const { status, body, raw } = await postJson('/provider-proxy/handshake/dry-run', { providerId: 'synthetic_test', token });
    assert(status === 200, `dry-run for synthetic_test must return 200 (got ${status})`);
    assert(body.schema === 'omni.provider_handshake_dry_run.v1', `dry-run schema must be omni.provider_handshake_dry_run.v1 (got ${body.schema})`);
    assert(body.decision === 'dry_run_ready', `dry-run must reach dry_run_ready (got ${body.decision})`);
    assert(body.dryRunReady === true, 'dry-run must report dryRunReady=true');
    assert(body.safety?.opensRealSocket === false, 'dry-run safety.opensRealSocket must be false (no real socket)');
    assert(body.safety?.canSendRealAudio === false, 'dry-run safety.canSendRealAudio must be false (no real audio)');
    assert(body.safety?.canSendRealCamera === false, 'dry-run safety.canSendRealCamera must be false (no real camera)');
    assert(body.safety?.canStartBillingSession === false, 'dry-run safety.canStartBillingSession must be false (no billing)');
    assert(body.safety?.realProviderHandshake === false, 'dry-run safety.realProviderHandshake must be false');
    assertNoSecretLeak(raw, '/handshake/dry-run raw body');
  }

  // 11. request body containing apiKey / secret / tokenRawValue must not leak the raw value into the response.
  {
    const dirty = {
      providerId: 'synthetic_test',
      tokenKind: 'synthetic_only',
      apiKey: 'sk-bigmodel-canary-v138-should-not-be-read',
      secret: 'sk-dashscope-canary-v138-should-not-be-read',
      tokenRawValue: 'sk-openai-canary-v138-should-not-be-read',
      authorization: 'Bearer sk-openai-canary-v138-should-not-be-read'
    };
    const { body, raw } = await postJson('/provider-proxy/session/request', dirty);
    assert(body.decision === 'granted', 'cleaned request must still be granted for synthetic_test');
    assert(body.secretStripped === true, 'decision must mark secretStripped=true when secret-like fields are present');
    assert(Array.isArray(body.strippedFields) && body.strippedFields.length >= 3, 'decision.strippedFields must list dropped keys');
    assertNoSecretLeak(raw, '/session/request dirty raw body');
    const scrubbedSerialized = JSON.stringify(body.scrubbedRequest || {});
    for (const droppedKey of ['apiKey', 'secret', 'tokenRawValue', 'authorization']) {
      assert(!scrubbedSerialized.includes(`"${droppedKey}"`), `scrubbedRequest must not echo the field name ${droppedKey}`);
    }
  }

  // 12. fallback decision always lands on localdev_mock.
  {
    const { status, body, raw } = await postJson('/provider-proxy/fallback', { fromProviderId: 'dashscope_qwen_omni', reason: 'simulated_failure' });
    assert(status === 200, `/fallback status must be 200 (got ${status})`);
    assert(body.schema === 'omni.provider_proxy_fallback_decision.v1', `fallback schema must be omni.provider_proxy_fallback_decision.v1 (got ${body.schema})`);
    assert(body.decision === 'fallback_to_localdev_mock', 'fallback decision must be fallback_to_localdev_mock');
    assert(body.fallbackProviderId === 'localdev_mock', 'fallbackProviderId must be localdev_mock');
    assertNoSecretLeak(raw, '/fallback raw body');
  }

  // 13. provider.realtime.open scope must be denied.
  // 14. media.audio.upload scope must be denied.
  // 15. media.camera.upload scope must be denied.
  // 16. billing.start scope must be denied.
  // 17. reply_text.tts scope must be denied.
  {
    const cases = [
      { label: 'provider.realtime.open', payload: { providerId: 'synthetic_test', realProviderSocket: true }, mustInclude: ['realProviderSocket', 'provider.realtime.open'] },
      { label: 'media.audio.upload', payload: { providerId: 'synthetic_test', realAudioUpload: true }, mustInclude: ['realAudioUpload', 'media.audio.upload'] },
      { label: 'media.camera.upload', payload: { providerId: 'synthetic_test', realCameraUpload: true }, mustInclude: ['realCameraUpload', 'media.camera.upload'] },
      { label: 'billing.start', payload: { providerId: 'synthetic_test', realtimeBilling: true }, mustInclude: ['billing'] },
      { label: 'reply_text.tts', payload: { providerId: 'synthetic_test', replyTextToTts: true }, mustInclude: ['replyTextToTts', 'reply_text.tts'] }
    ];
    for (const c of cases) {
      const { status, body } = await postJson('/provider-proxy/session/request', c.payload);
      assert(status === 403, `${c.label} scope request must return 403 (got ${status})`);
      assert(body.decision === 'denied', `${c.label} scope request must be denied`);
      const reasons = (body.blockReasons || []).join('|');
      assert(c.mustInclude.some((needle) => reasons.includes(needle)), `${c.label} block reasons must mention ${c.mustInclude.join(' or ')} (got ${reasons})`);
    }
  }

  // 18. reply_audio_frame is still the realtime voice output path.
  {
    let output = createDefaultRealtimeOutputChannel();
    output = applyReplyAudioFrame(output, {
      schema: 'omni.reply_audio_frame.v1',
      frameId: 'reply_aud_v138',
      turnId: 'turn_v138_voice',
      sequence: 1,
      isFinal: true,
      audio: { kind: 'reply_audio', codec: 'pcm_float32', sampleRate: 24000, channels: 1, payloadEncoding: 'base64', payloadIncluded: true, byteLength: 32, payload: 'AAAAAA==' },
      guardrails: { notTtsPipeline: true, replyTextIsSubtitleOnly: true }
    });
    assert(output.queuedAudioFrames.length === 1, 'reply_audio_frame must remain the realtime voice output path');
    assert(output.queuedAudioFrames[0].audio.kind === 'reply_audio', 'queue entry must keep audio kind=reply_audio');
  }

  // 19. ASR -> LLM -> TTS regression path must not exist.
  {
    const { body: contract } = await getJson('/provider-proxy/contract');
    assert(contract.guardrails?.asrLlmTtsRegressionForbidden === true, 'server contract.guardrails.asrLlmTtsRegressionForbidden must be true');
    assert(contract.guardrails?.replyTextNotTtsInput === true, 'server contract.guardrails.replyTextNotTtsInput must be true');
    assert(contract.guardrails?.replyAudioFrameIsRealtimeVoiceOutput === true, 'server contract.guardrails.replyAudioFrameIsRealtimeVoiceOutput must be true');
  }

  // 20. BigModel / DashScope candidate capabilities exist and are blocked.
  {
    for (const providerId of ['bigmodel_glm_realtime_candidate', 'dashscope_qwen_omni_candidate']) {
      const cap = getProviderCapability(providerId);
      assert(cap, `${providerId} capability must exist`);
      assert(cap.providerKind === 'real_cloud_candidate', `${providerId} providerKind must be real_cloud_candidate (got ${cap.providerKind})`);
      assert(cap.candidateOnly === true, `${providerId} candidateOnly must be true`);
      assert(cap.supportsRealtimeSocket === false, `${providerId} supportsRealtimeSocket must be false (candidate stays blocked)`);
      assert(cap.supportsAudioInput === false, `${providerId} supportsAudioInput must be false`);
      assert(cap.supportsCameraInput === false, `${providerId} supportsCameraInput must be false`);
      assert(cap.requiresServerSideSecret === true, `${providerId} requiresServerSideSecret must be true`);
      assert(cap.browserDirectProviderSocketAllowed === false, `${providerId} browserDirectProviderSocketAllowed must be false`);
      assert(cap.fallbackProviderId === 'localdev_mock', `${providerId} fallback must be localdev_mock`);
      // Handshake sandbox must block candidates.
      const candidateBlocked = runProxyHandshakeDryRun(null, { providerId, providerKind: cap.providerKind, token: createEphemeralSessionToken({ providerId, tokenKind: 'synthetic_only' }) });
      assert(candidateBlocked.state === 'provider_handshake_blocked', `${providerId} dry-run must end in provider_handshake_blocked (got ${candidateBlocked.state})`);
      assert(candidateBlocked.safety.opensRealSocket === false, `${providerId} sandbox.safety.opensRealSocket must be false`);
      // Server endpoint must deny candidate session requests too.
      const { status: candStatus, body: candBody } = await postJson('/provider-proxy/session/request', { providerId, tokenKind: 'synthetic_only' });
      assert(candStatus === 403, `${providerId} session request must be denied with 403 (got ${candStatus})`);
      assert(candBody.decision === 'denied', `${providerId} server decision must be denied`);
      const candDry = await postJson('/provider-proxy/handshake/dry-run', { providerId, token: createEphemeralSessionToken({ providerId, tokenKind: 'synthetic_only' }) });
      assert(candDry.status === 403, `${providerId} dry-run must be denied (got ${candDry.status})`);
      assert(candDry.body.decision === 'blocked', `${providerId} dry-run body.decision must be blocked`);
    }
  }

  // 21. provider proxy server skeleton must not read real env API keys.
  {
    // Send every canary back through the server in a session.validate request; the response must not echo any canary.
    const dirtyToken = {
      ...createEphemeralSessionToken({ providerId: 'synthetic_test', tokenKind: 'synthetic_only' }),
      apiKey: process.env.BIGMODEL_API_KEY,
      secret: process.env.DASHSCOPE_API_KEY
    };
    const { body, raw } = await postJson('/provider-proxy/session/validate', { token: dirtyToken });
    assertNoSecretLeak(raw, '/session/validate dirty raw body');
    // The /health endpoint must declare the env vars as REFUSED.
    const health = await getJson('/health');
    assertNoSecretLeak(JSON.stringify(health.body), '/health body');
    assert(Array.isArray(health.body.envGuard?.refusedEnvVars), '/health.envGuard.refusedEnvVars must be an array');
    for (const required of ['BIGMODEL_API_KEY', 'DASHSCOPE_API_KEY', 'OPENAI_API_KEY']) {
      assert(health.body.envGuard.refusedEnvVars.includes(required), `/health.envGuard.refusedEnvVars must include ${required}`);
    }
    void body;
  }

  // 22. provider proxy server skeleton source must not include real provider endpoint URLs.
  {
    const serverFile = path.join(process.cwd(), 'scripts', 'provider-proxy-skeleton-server.mjs');
    const source = fs.readFileSync(serverFile, 'utf8');
    const forbiddenHosts = [
      'dashscope.aliyuncs.com',
      'dashscope-intl.aliyuncs.com',
      'open.bigmodel.cn',
      'bigmodel.cn',
      'api.minimax.chat',
      'api.openai.com',
      'realtime.openai.com'
    ];
    // The contract module is allowed to NAME these hosts in a forbidden list.
    // The server source itself must not contain them.
    for (const host of forbiddenHosts) {
      assert(!source.includes(host), `provider-proxy-skeleton-server.mjs must not reference real provider host ${host}`);
    }
    // No outbound fetch / WebSocket to other origins. The server source must
    // not import 'ws' or 'undici' or call 'fetch(' or 'new WebSocket('.
    assert(!source.includes("new WebSocket("), 'skeleton server must not construct a WebSocket');
    assert(!/from\s+['"]ws['"]/m.test(source), 'skeleton server must not import the ws package');
    assert(!source.includes('fetch('), 'skeleton server must not perform outbound fetch calls');
    // It must also not READ the forbidden env keys directly.
    for (const envKey of ['BIGMODEL_API_KEY', 'BIGMODEL_TOKEN', 'DASHSCOPE_API_KEY', 'DASHSCOPE_TOKEN', 'QWEN_API_KEY', 'OPENAI_API_KEY', 'MINIMAX_API_KEY']) {
      const reads = new RegExp(`process\\.env\\[?[\\s'"\`]*${envKey}`).test(source);
      assert(!reads, `skeleton server must not read process.env.${envKey}`);
    }
  }

  // 23. localdev_mock fallback must remain.
  {
    const { body: contract } = await getJson('/provider-proxy/contract');
    assert(contract.fallbackProviderId === 'localdev_mock', 'server contract.fallbackProviderId must be localdev_mock');
    const { body: fb } = await postJson('/provider-proxy/fallback', { fromProviderId: 'bigmodel_glm_realtime_candidate' });
    assert(fb.fallbackProviderId === 'localdev_mock', 'fallback must always point to localdev_mock');
    // Sandbox fallback event also lands on localdev_mock.
    const sandbox = transitionProxyHandshakeSandbox(
      createDefaultProxyHandshakeSandboxState({ providerId: 'bigmodel_glm_realtime_candidate', providerKind: 'real_cloud_candidate' }),
      'provider.proxy.handshake.fallback',
      { reason: 'manual_fallback' }
    );
    assert(sandbox.state === 'fallback_to_localdev_mock', 'sandbox fallback state must be fallback_to_localdev_mock');
    assert(sandbox.fallbackProviderId === 'localdev_mock', 'sandbox fallback must be localdev_mock');
    assert(PROVIDER_PROXY_HANDSHAKE_SANDBOX_PROTOCOL === 'omni.provider_proxy_handshake_sandbox.v1', 'protocol constant must remain stable');
    assert(PROVIDER_PROXY_HANDSHAKE_SANDBOX_STATES.length >= 8, 'sandbox states list must cover at least 8 states');
    assert(PROVIDER_PROXY_HANDSHAKE_SANDBOX_EVENTS.length >= 6, 'sandbox events list must cover at least 6 events');
  }

  // 24. smoke must not require any real API key. We assert that the
  // capabilities map does not embed a real key, that no canary appeared
  // in any prior response, and that real candidates remain blocked even
  // when env canaries are present.
  {
    const allCapsSerialized = JSON.stringify(BUILTIN_PROVIDER_CAPABILITIES);
    assertNoSecretLeak(allCapsSerialized, 'BUILTIN_PROVIDER_CAPABILITIES');
    // No call in this smoke required a real API key. The whole exchange
    // ran against http://127.0.0.1 only.
    assert(baseUrl.startsWith('http://127.0.0.1:'), `smoke must run against local loopback only (got ${baseUrl})`);
  }

  console.log(`Provider proxy server smoke passed: ${baseUrl} · 24 checks · no real key read · no real provider call · fallback=localdev_mock`);
} finally {
  await handle.close();
}
