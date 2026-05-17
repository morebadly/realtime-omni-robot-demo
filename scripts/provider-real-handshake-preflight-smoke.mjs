#!/usr/bin/env node
// v1.4.0 Limited Real Provider Handshake Preflight smoke.
//
// Runs local policy/descriptor checks and a loopback skeleton endpoint check.
// It does not require real API keys and does not contact provider endpoints.

import fs from 'node:fs';
import { startProviderProxySkeletonServer } from './provider-proxy-skeleton-server.mjs';
import {
  createRealHandshakePreflightPolicy,
  evaluateRealHandshakePreflightRequest,
  validateRealHandshakePreflightSafety
} from '../src/runtime/providerRealHandshakePreflightPolicy.js';
import {
  createRealHandshakePreflightDescriptor,
  validateRealHandshakePreflightDescriptor
} from '../src/runtime/providerRealHandshakePreflightDescriptor.js';
import { createProviderSpecificHandshakeAdapter } from '../src/runtime/providerSpecificHandshakeAdapters.js';
import { createProviderHandshakeEventMapping } from '../src/runtime/providerHandshakeEventMapping.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertNoCanary(serialized, label) {
  for (const probe of ['sk-bigmodel-v140-canary', 'sk-dashscope-v140-canary']) {
    assert(!serialized.includes(probe), `${label}: canary must not leak: ${probe}`);
  }
}

const providerIds = [
  'bigmodel_glm_realtime_candidate',
  'dashscope_qwen_omni_candidate'
];

process.env.BIGMODEL_API_KEY = 'sk-bigmodel-v140-canary';
process.env.DASHSCOPE_API_KEY = 'sk-dashscope-v140-canary';

// 1-5. Policy defaults and opt-in gate.
const defaultPolicy = createRealHandshakePreflightPolicy();
assert(defaultPolicy.enabled === false, 'preflight policy must be disabled by default');
assert(defaultPolicy.browserRuntimeAllowed === false, 'browserRuntimeAllowed must be false');
assert(defaultPolicy.serverSideOnly === true, 'serverSideOnly must be true');

const noOptIn = evaluateRealHandshakePreflightRequest({
  providerId: providerIds[0],
  serverSideOnly: true,
  env: { ALLOW_REAL_PROVIDER_HANDSHAKE: '1' }
}, createRealHandshakePreflightPolicy({ enabled: true }));
assert(noOptIn.decision === 'denied', 'explicitOptIn must be required');
assert(noOptIn.blockReasons.includes('explicit_opt_in_required'), 'missing explicit opt-in must be a block reason');

const noEnv = evaluateRealHandshakePreflightRequest({
  providerId: providerIds[0],
  explicitOptIn: true,
  serverSideOnly: true
}, createRealHandshakePreflightPolicy({ enabled: true }));
assert(noEnv.decision === 'denied', 'missing ALLOW_REAL_PROVIDER_HANDSHAKE=1 must be denied');
assert(noEnv.blockReasons.some((reason) => reason.includes('ALLOW_REAL_PROVIDER_HANDSHAKE')), 'missing env flag must be reported');

const allowed = evaluateRealHandshakePreflightRequest({
  providerId: providerIds[0],
  explicitOptIn: true,
  serverSideOnly: true,
  env: { ALLOW_REAL_PROVIDER_HANDSHAKE: '1' },
  keyPresent: true
}, createRealHandshakePreflightPolicy({ enabled: true }));
assert(allowed.decision === 'manual_preflight_allowed', 'manual opt-in server-side config validation may be allowed');
assert(allowed.output.networkCallAttempted === false, 'allowed preflight still must not attempt network');
assert(validateRealHandshakePreflightSafety(allowed).ok, 'allowed preflight safety must remain locked');

// 6-9. Real channel requests stay denied even with opt-in.
for (const [flag, reason] of [
  ['audioUploadRequested', 'real_audio_upload_blocked'],
  ['cameraUploadRequested', 'real_camera_upload_blocked'],
  ['billingRequested', 'realtime_billing_blocked'],
  ['replyTextTtsRequested', 'reply_text_tts_blocked']
]) {
  const decision = evaluateRealHandshakePreflightRequest({
    providerId: providerIds[0],
    explicitOptIn: true,
    serverSideOnly: true,
    env: { ALLOW_REAL_PROVIDER_HANDSHAKE: '1' },
    [flag]: true
  }, createRealHandshakePreflightPolicy({ enabled: true }));
  assert(decision.decision === 'denied', `${flag} must stay denied`);
  assert(decision.blockReasons.includes(reason), `${flag} must report ${reason}`);
}

for (const providerId of providerIds) {
  const adapter = createProviderSpecificHandshakeAdapter(providerId);
  assert(adapter?.realHandshakePreflightSupported === true, `${providerId} preflight support metadata must exist`);
  assert(adapter.realHandshakePreflightDefault === 'blocked', `${providerId} preflight default must be blocked`);
  assert(adapter.canOpenRealtimeSocket === false, `${providerId} must not open realtime socket`);
  assert(adapter.canSendRealAudio === false, `${providerId} must not send real audio`);
  assert(adapter.canSendRealCamera === false, `${providerId} must not send real camera`);
  assert(adapter.canStartBillingSession === false, `${providerId} must not start billing`);
  assert(adapter.replyTextToTts === false, `${providerId} must not use reply_text as TTS`);

  // 10-17. Descriptor exists and stays safety locked.
  const descriptor = createRealHandshakePreflightDescriptor(providerId);
  const validation = validateRealHandshakePreflightDescriptor(descriptor);
  assert(validation.ok, `${providerId} descriptor validation failed: ${validation.failures.join(',')}`);
  assert(descriptor.networkCallAttempted === false, `${providerId} descriptor networkCallAttempted must be false`);
  assert(descriptor.opensRealSocket === false, `${providerId} descriptor opensRealSocket must be false`);
  assert(descriptor.sendsMedia === false, `${providerId} descriptor sendsMedia must be false`);
  assert(descriptor.startsBilling === false, `${providerId} descriptor startsBilling must be false`);
  assert(descriptor.replyTextToTts === false, `${providerId} descriptor replyTextToTts must be false`);
  assert(descriptor.fallbackProviderId === 'localdev_mock', `${providerId} descriptor fallback must be localdev_mock`);

  // 24-27. Omni guardrails stay in force.
  const eventMapping = createProviderHandshakeEventMapping(providerId);
  assert(eventMapping.output['omni.reply_audio_frame.v1'].nativeAudioRequired === true, `${providerId} reply_audio_frame must remain native voice output`);
  assert(eventMapping.output['omni.reply_audio_frame.v1'].replyTextToTts === false, `${providerId} reply_text must not feed TTS`);
  assert(eventMapping.guardrails.asrLlmTtsRegressionForbidden === true, `${providerId} ASR->LLM->TTS regression must be forbidden`);
  assert(eventMapping.fallbackProviderId === 'localdev_mock', `${providerId} event mapping fallback must be localdev_mock`);
}

const handle = await startProviderProxySkeletonServer({ port: 0, host: '127.0.0.1' });
const baseUrl = handle.baseUrl;

async function getJson(pathname) {
  const res = await fetch(`${baseUrl}${pathname}`);
  const text = await res.text();
  return { status: res.status, body: JSON.parse(text), raw: text };
}

try {
  for (const providerId of providerIds) {
    // 18-20. Skeleton endpoint returns descriptor, reads no real key, and leaks no canary.
    const res = await getJson(`/provider-proxy/providers/${providerId}/real-handshake-preflight`);
    assert(res.status === 200, `${providerId} preflight endpoint must return 200`);
    assert(res.body.schema === 'omni.real_provider_handshake_preflight.v1', `${providerId} preflight endpoint schema must match`);
    assert(res.body.defaultBlocked === true, `${providerId} preflight endpoint default must be blocked`);
    assert(res.body.networkCallAttempted === false, `${providerId} preflight endpoint must not attempt network`);
    assert(res.body.keyRequiredServerSide === true, `${providerId} preflight endpoint must require server-side key`);
    assert(res.body.browserForbidden === true, `${providerId} preflight endpoint must forbid browser runtime`);
    assert(res.body.fallbackProviderId === 'localdev_mock', `${providerId} preflight endpoint fallback must be localdev_mock`);
    assertNoCanary(res.raw, `${providerId} preflight endpoint`);
  }

  // 21. Manual script skeleton has no real connection surface.
  const scriptSource = fs.readFileSync('scripts/provider-real-handshake-preflight.mjs', 'utf8');
  assert(!scriptSource.includes('new WebSocket('), 'manual preflight script must not construct WebSocket');
  assert(!scriptSource.includes('fetch('), 'manual preflight script must not call fetch');
  assert(!/from\s+['"]ws['"]/m.test(scriptSource), 'manual preflight script must not import ws');

  // 22. Skeleton server still contains no real provider endpoint calls.
  const skeletonSource = fs.readFileSync('scripts/provider-proxy-skeleton-server.mjs', 'utf8');
  assert(!skeletonSource.includes('new WebSocket('), 'skeleton must not construct WebSocket');
  assert(!skeletonSource.includes('fetch('), 'skeleton must not call fetch');
  assert(!/from\s+['"]ws['"]/m.test(skeletonSource), 'skeleton must not import ws');
  for (const host of ['open.bigmodel.cn', 'dashscope.aliyuncs.com']) {
    assert(!skeletonSource.includes(host), `skeleton must not contain real provider host ${host}`);
  }
  for (const envKey of ['BIGMODEL_API_KEY', 'DASHSCOPE_API_KEY']) {
    const reads = new RegExp(`process\\.env\\[?[\\s'"\`]*${envKey}`).test(skeletonSource);
    assert(!reads, `skeleton must not read ${envKey}`);
  }

  // 23. This smoke only talks to loopback skeleton.
  assert(baseUrl.startsWith('http://127.0.0.1:'), `smoke must use loopback only (got ${baseUrl})`);

  // 28. Package smoke suite is configured for 28 checks.
  const smokeSource = fs.readFileSync('scripts/run-smoke-suite.mjs', 'utf8');
  assert(smokeSource.includes("'test:provider-real-handshake-preflight'"), 'smoke suite must include provider real handshake preflight test');
  const checkCount = [...smokeSource.matchAll(/'test:[^']+'/g)].length;
  assert(checkCount === 28, `smoke suite must contain 28 checks (got ${checkCount})`);

  console.log(`Provider real handshake preflight smoke passed: 2 candidates · 28 checks suite · no real key read · no real network · fallback=localdev_mock`);
} finally {
  await handle.close();
}
