#!/usr/bin/env node
// v1.4.1 Manual Real Handshake Probe Stub smoke.
//
// Local policy/plan/static checks only. No real provider endpoint is contacted.

import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import {
  createRealHandshakeProbePlan,
  validateRealHandshakeProbePlan
} from '../src/runtime/providerRealHandshakeProbePlan.js';
import {
  createRealHandshakeProbePolicy,
  evaluateRealHandshakeProbeRequest,
  validateRealHandshakeProbeSafety
} from '../src/runtime/providerRealHandshakeProbePolicy.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertNoCanary(value, label) {
  const serialized = typeof value === 'string' ? value : JSON.stringify(value);
  for (const probe of ['sk-bigmodel-v141-canary', 'sk-dashscope-v141-canary']) {
    assert(!serialized.includes(probe), `${label}: raw API key leaked: ${probe}`);
  }
}

const providerIds = [
  'bigmodel_glm_realtime_candidate',
  'dashscope_qwen_omni_candidate'
];

process.env.BIGMODEL_API_KEY = 'sk-bigmodel-v141-canary';
process.env.DASHSCOPE_API_KEY = 'sk-dashscope-v141-canary';

// 1. Default policy / plan stays disabled, no-network, dry-run.
const defaultPolicy = createRealHandshakeProbePolicy();
assert(defaultPolicy.enabled === false, 'probe policy must be disabled by default');
assert(defaultPolicy.allowNetwork === false, 'probe policy must default to no network');
assert(defaultPolicy.safety.networkCallAttempted === false, 'default policy must not attempt network');
const defaultDecision = evaluateRealHandshakeProbeRequest({
  providerId: providerIds[0],
  explicitOptIn: true,
  serverSideOnly: true
}, defaultPolicy);
assert(defaultDecision.decision === 'blocked', 'default policy must block probe plan');
assert(defaultDecision.blockReasons.includes('policy_disabled_by_default'), 'default policy disabled reason required');

// 2-3. Candidate providers can generate plans, but cannot execute real handshake.
for (const providerId of providerIds) {
  const plan = createRealHandshakeProbePlan(providerId, { keyPresent: true });
  const validation = validateRealHandshakeProbePlan(plan);
  assert(validation.ok, `${providerId} probe plan must validate: ${validation.failures.join(',')}`);
  assert(plan.planStatus === 'probe_plan_ready', `${providerId} plan should be ready metadata`);
  assert(plan.providerKind === 'real_cloud_candidate', `${providerId} must stay candidate kind`);
  assert(plan.executionMode.manualOnly === true, `${providerId} manualOnly required`);
  assert(plan.executionMode.serverSideOnly === true, `${providerId} serverSideOnly required`);
  assert(plan.executionMode.browserForbidden === true, `${providerId} browser forbidden required`);
  assert(plan.executionMode.dryRunDefault === true, `${providerId} dryRun default required`);
  assert(plan.executionMode.noNetworkDefault === true, `${providerId} no-network default required`);
  assert(plan.safety.networkCallAttempted === false, `${providerId} no network`);
  assert(plan.safety.opensRealSocket === false, `${providerId} no socket`);
  assert(plan.safety.sendsAudio === false, `${providerId} no audio`);
  assert(plan.safety.sendsCamera === false, `${providerId} no camera`);
  assert(plan.safety.startsBilling === false, `${providerId} no billing`);
  assert(plan.safety.replyTextToTts === false, `${providerId} no TTS`);
  assert(plan.fallbackProviderId === 'localdev_mock', `${providerId} fallback required`);

  const decision = evaluateRealHandshakeProbeRequest({
    providerId,
    explicitOptIn: true,
    serverSideOnly: true,
    keyPresent: true
  }, createRealHandshakeProbePolicy({ enabled: true }));
  assert(decision.decision === 'probe_plan_ready', `${providerId} candidate should generate plan`);
  assert(decision.canExecuteRealHandshake === false, `${providerId} must not execute real handshake`);
  assert(validateRealHandshakeProbeSafety(decision).ok, `${providerId} decision safety must validate`);
}

// 4. Unknown provider blocked with fallback.
const unknown = evaluateRealHandshakeProbeRequest({
  providerId: 'unknown_provider',
  explicitOptIn: true,
  serverSideOnly: true
}, createRealHandshakeProbePolicy({ enabled: true }));
assert(unknown.decision === 'blocked', 'unknown provider must be blocked');
assert(unknown.fallbackProviderId === 'localdev_mock', 'unknown provider fallback must be localdev_mock');
assert(unknown.blockReasons.includes('provider_must_be_known_candidate'), 'unknown provider reason required');

// 5. localdev_mock is not treated as a real provider.
const localdev = evaluateRealHandshakeProbeRequest({
  providerId: 'localdev_mock',
  explicitOptIn: true,
  serverSideOnly: true
}, createRealHandshakeProbePolicy({ enabled: true }));
assert(localdev.decision === 'blocked', 'localdev_mock must not generate real provider probe');
assert(localdev.providerKind === 'localdev_mock', 'localdev_mock kind must be preserved');
assert(localdev.blockReasons.includes('localdev_mock_is_not_real_provider'), 'localdev_mock must not be mistaken as real');

// 6-10. Dangerous requests are refused.
for (const [flag, reason] of [
  ['audioUploadRequested', 'real_audio_upload_blocked'],
  ['cameraUploadRequested', 'real_camera_upload_blocked'],
  ['billingRequested', 'realtime_billing_blocked'],
  ['replyTextTtsRequested', 'reply_text_tts_blocked'],
  ['browserRuntime', 'browser_runtime_forbidden'],
  ['realSocketRequested', 'real_provider_socket_blocked'],
  ['networkRequested', 'real_network_handshake_blocked']
]) {
  const decision = evaluateRealHandshakeProbeRequest({
    providerId: providerIds[0],
    explicitOptIn: true,
    serverSideOnly: true,
    [flag]: true
  }, createRealHandshakeProbePolicy({ enabled: true }));
  assert(decision.decision === 'blocked', `${flag} must be blocked`);
  assert(decision.blockReasons.includes(reason), `${flag} must report ${reason}`);
}

// 11. keyPresent is boolean only.
for (const value of [true, false, 'sk-nope', 1, null]) {
  const plan = createRealHandshakeProbePlan(providerIds[0], { keyPresent: value });
  assert(typeof plan.keyRequirement.keyPresent === 'boolean', 'keyPresent must always be boolean');
  assert(plan.keyRequirement.keyPrinted === false, 'key must never be printed');
  assert(plan.keyRequirement.rawKeyIncluded === false, 'raw key must never be included');
}

// 12. Raw API key cannot appear in plan, diagnostics, logs, or Visible Context-like output.
const secretDecision = evaluateRealHandshakeProbeRequest({
  providerId: providerIds[0],
  explicitOptIn: true,
  serverSideOnly: true,
  apiKey: 'sk-bigmodel-v141-canary',
  nested: { authorization: 'sk-dashscope-v141-canary' },
  keyPresent: true
}, createRealHandshakeProbePolicy({ enabled: true }));
assert(secretDecision.secretStripped === true, 'secret-like fields must be stripped');
assertNoCanary(secretDecision, 'probe decision');
assert(secretDecision.diagnostics.redacted === true, 'diagnostics must be redacted');
assert(secretDecision.diagnostics.visibleContextSafe === true, 'diagnostics must be visible-context safe');
assert(secretDecision.diagnostics.logsSafe === true, 'diagnostics must be log safe');

// 13. Endpoint / region / model / quota / billing are metadata only.
const metadataPlan = createRealHandshakeProbePlan(providerIds[1], {
  region: 'cn-beijing',
  modelId: 'qwen-omni-metadata-only',
  quotaRisk: 'quota_metadata_only',
  billingRisk: 'pay_per_use'
});
assert(metadataPlan.diagnostics.endpointMetadataOnly === true, 'endpoint must be metadata only');
assert(metadataPlan.diagnostics.quotaMetadataOnly === true, 'quota must be metadata only');
assert(metadataPlan.diagnostics.billingMetadataOnly === true, 'billing risk must be metadata only');
assert(metadataPlan.safety.networkCallAttempted === false, 'metadata must not imply network');

// 14. Fallback is always localdev_mock.
for (const item of [defaultDecision, unknown, localdev, secretDecision, metadataPlan]) {
  assert((item.fallbackProviderId || item.safety?.fallbackProviderId) === 'localdev_mock', 'fallback must be localdev_mock');
}

// 15. Verify/smoke does not perform real network calls.
const cliSource = fs.readFileSync('scripts/provider-real-handshake-probe-plan.mjs', 'utf8');
assert(!cliSource.includes('fetch('), 'probe CLI must not call fetch');
assert(!cliSource.includes('new WebSocket('), 'probe CLI must not construct WebSocket');
assert(!/from\s+['"]ws['"]/m.test(cliSource), 'probe CLI must not import ws');

const moduleSources = [
  'src/runtime/providerRealHandshakeProbePlan.js',
  'src/runtime/providerRealHandshakeProbePolicy.js'
].map((file) => fs.readFileSync(file, 'utf8')).join('\n');
assert(!moduleSources.includes('fetch('), 'probe runtime modules must not call fetch');
assert(!moduleSources.includes('new WebSocket('), 'probe runtime modules must not construct WebSocket');
assert(!/from\s+['"]ws['"]/m.test(moduleSources), 'probe runtime modules must not import ws');

const smokeSource = fs.readFileSync('scripts/run-smoke-suite.mjs', 'utf8');
assert(smokeSource.includes("'test:provider-real-handshake-probe-plan'"), 'smoke suite must include probe plan test');
const checkCount = [...smokeSource.matchAll(/'test:[^']+'/g)].length;
assert(checkCount === 29, `smoke suite must contain 29 checks (got ${checkCount})`);

const cliResult = spawnSync(process.execPath, ['scripts/provider-real-handshake-probe-plan.mjs', providerIds[0]], {
  encoding: 'utf8',
  env: {
    ...process.env,
    BIGMODEL_API_KEY: 'sk-bigmodel-v141-canary'
  }
});
assert(cliResult.status === 0, 'probe CLI must exit cleanly');
assertNoCanary(cliResult.stdout, 'probe CLI stdout');
const cliJson = JSON.parse(cliResult.stdout);
assert(cliJson.status === 'disabled', 'probe CLI must be disabled by default');
assert(cliJson.keyPresent === true, 'probe CLI may report boolean key presence only');
assert(typeof cliJson.keyPresent === 'boolean', 'probe CLI keyPresent must be boolean');
assert(cliJson.networkCallAttempted === false, 'probe CLI must not attempt network');
assert(cliJson.fallbackProviderId === 'localdev_mock', 'probe CLI fallback must be localdev_mock');

console.log('Provider real handshake probe plan smoke passed: 2 candidates, disabled-by-default, 29-check suite, no real network, no raw key leak, fallback=localdev_mock');
