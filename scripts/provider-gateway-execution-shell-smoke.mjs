#!/usr/bin/env node
// v1.4.3 Provider Gateway Execution Shell / Synthetic-only smoke.
//
// Local descriptor/policy/static checks only. No real provider endpoint is
// contacted and no media/billing/TTS path is enabled.

import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import {
  createProviderGatewayExecutionShell,
  validateProviderGatewayExecutionShell
} from '../src/runtime/providerGatewayExecutionShell.js';
import {
  createProviderGatewayExecutionPolicy,
  evaluateProviderGatewayExecutionRequest,
  validateProviderGatewayExecutionSafety
} from '../src/runtime/providerGatewayExecutionPolicy.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function serialize(value) {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function assertNoCanary(value, label) {
  const serialized = serialize(value);
  for (const canary of [
    'synthetic-secret-should-never-appear',
    'sk-bigmodel-v143-canary',
    'sk-dashscope-v143-canary',
    'raw-token-v143-canary',
    'sk-test****v143'
  ]) {
    assert(!serialized.includes(canary), `${label}: secret canary leaked: ${canary}`);
  }
}

const providerIds = [
  'bigmodel_glm_realtime_candidate',
  'dashscope_qwen_omni_candidate'
];

// 1. Default shell policy stays disabled / blocked / no-network.
const defaultPolicy = createProviderGatewayExecutionPolicy();
assert(defaultPolicy.enabled === false, 'gateway execution policy must be disabled by default');
assert(defaultPolicy.allowNetwork === false, 'gateway execution policy must default to no-network');
const defaultDecision = evaluateProviderGatewayExecutionRequest({
  providerId: providerIds[0],
  explicitOptIn: true,
  serverSideOnly: true
}, defaultPolicy);
assert(defaultDecision.decision === 'blocked', 'default gateway shell must be blocked');
assert(defaultDecision.blockReasons.includes('policy_disabled_by_default'), 'default block reason required');
assert(defaultDecision.safety.networkCallAttempted === false, 'default decision must not attempt network');

// 2-10. Dangerous requests are refused.
for (const [flag, reason] of [
  ['browserRuntime', 'browser_runtime_forbidden'],
  ['networkRequested', 'real_network_handshake_blocked'],
  ['realSocketRequested', 'real_provider_socket_blocked'],
  ['providerEndpointRequested', 'real_provider_endpoint_call_blocked'],
  ['audioUploadRequested', 'real_audio_upload_blocked'],
  ['cameraUploadRequested', 'real_camera_upload_blocked'],
  ['billingRequested', 'realtime_billing_blocked'],
  ['replyTextTtsRequested', 'reply_text_tts_blocked'],
  ['asrLlmTtsFallbackRequested', 'asr_llm_tts_fallback_blocked'],
  ['realProviderExecutionRequested', 'real_provider_execution_blocked']
]) {
  const decision = evaluateProviderGatewayExecutionRequest({
    providerId: providerIds[0],
    explicitOptIn: true,
    serverSideOnly: true,
    [flag]: true
  }, createProviderGatewayExecutionPolicy({ enabled: true }));
  assert(decision.decision === 'blocked', `${flag} must be blocked`);
  assert(decision.blockReasons.includes(reason), `${flag} must report ${reason}`);
  assert(validateProviderGatewayExecutionSafety(decision).ok, `${flag} blocked decision must keep safety locked`);
}

// 11-12. Candidate providers can generate shell metadata, but cannot execute.
for (const providerId of providerIds) {
  const shell = createProviderGatewayExecutionShell(providerId, { keyPresent: true });
  const validation = validateProviderGatewayExecutionShell(shell);
  assert(validation.ok, `${providerId} shell validation failed: ${validation.failures.join(',')}`);
  assert(shell.providerKind === 'real_cloud_candidate', `${providerId} must remain candidate`);
  assert(shell.executionKind === 'candidate_metadata_only', `${providerId} must be metadata only`);
  assert(shell.canExecuteRealProvider === false, `${providerId} must not execute real provider`);
  assert(shell.syntheticOnly === true, `${providerId} shell must be synthetic-only`);
  assert(shell.safety.networkCallAttempted === false, `${providerId} no network`);
  assert(shell.safety.opensRealSocket === false, `${providerId} no socket`);
  assert(shell.safety.callsRealEndpoint === false, `${providerId} no endpoint call`);
  assert(shell.safety.sendsAudio === false, `${providerId} no audio`);
  assert(shell.safety.sendsCamera === false, `${providerId} no camera`);
  assert(shell.safety.startsBilling === false, `${providerId} no billing`);
  assert(shell.safety.replyTextToTts === false, `${providerId} no TTS`);
  assert(shell.fallbackProviderId === 'localdev_mock', `${providerId} fallback required`);

  const decision = evaluateProviderGatewayExecutionRequest({
    providerId,
    explicitOptIn: true,
    serverSideOnly: true,
    keyPresent: true
  }, createProviderGatewayExecutionPolicy({ enabled: true }));
  assert(decision.decision === 'gateway_shell_metadata_ready', `${providerId} shell metadata should be ready`);
  assert(decision.canExecuteRealProvider === false, `${providerId} real execution must remain false`);
  assert(validateProviderGatewayExecutionSafety(decision).ok, `${providerId} decision safety must validate`);
}

// 13. Unknown provider is blocked with localdev fallback.
const unknown = evaluateProviderGatewayExecutionRequest({
  providerId: 'unknown_provider',
  explicitOptIn: true,
  serverSideOnly: true
}, createProviderGatewayExecutionPolicy({ enabled: true }));
assert(unknown.decision === 'blocked', 'unknown provider must be blocked');
assert(unknown.blockReasons.includes('provider_unknown'), 'unknown provider reason required');
assert(unknown.fallbackProviderId === 'localdev_mock', 'unknown fallback must be localdev_mock');

// 14. localdev_mock is not mistaken for a real provider.
const localdev = evaluateProviderGatewayExecutionRequest({
  providerId: 'localdev_mock',
  explicitOptIn: true,
  serverSideOnly: true
}, createProviderGatewayExecutionPolicy({ enabled: true }));
assert(localdev.decision === 'blocked', 'localdev_mock must not be a real gateway execution target');
assert(localdev.providerKind === 'localdev_mock', 'localdev kind must be preserved');
assert(localdev.blockReasons.includes('localdev_mock_is_fallback_or_synthetic_target_not_real_provider'), 'localdev reason required');

// 15. Synthetic shell remains synthetic-only.
const synthetic = evaluateProviderGatewayExecutionRequest({
  providerId: 'synthetic_test',
  explicitOptIn: true,
  serverSideOnly: true
}, createProviderGatewayExecutionPolicy({ enabled: true }));
assert(synthetic.decision === 'synthetic_shell_ready', 'synthetic provider may return synthetic shell');
assert(synthetic.syntheticOnly === true, 'synthetic decision must be synthetic-only');
assert(synthetic.canExecuteRealProvider === false, 'synthetic decision must not execute real provider');
assert(synthetic.safety.networkCallAttempted === false, 'synthetic decision must not attempt network');

// 16. Secret-like input is audited and never leaked.
const dirty = evaluateProviderGatewayExecutionRequest({
  providerId: providerIds[0],
  explicitOptIn: true,
  serverSideOnly: true,
  apiKey: 'sk-bigmodel-v143-canary',
  nested: {
    authorization: 'sk-dashscope-v143-canary',
    token: 'raw-token-v143-canary',
    maskedKey: 'sk-test****v143'
  },
  keyPresent: true
}, createProviderGatewayExecutionPolicy({ enabled: true }));
assert(dirty.decision === 'blocked', 'dirty request must be blocked');
assert(dirty.secretStripped === true, 'dirty request must report secretStripped');
assert(dirty.secretBoundaryAudit.status === 'blocked', 'dirty request audit must block');
assertNoCanary(dirty, 'dirty gateway execution decision');

// 17. keyPresent is boolean only.
for (const value of [true, false, 'sk-nope', 1, null]) {
  const shell = createProviderGatewayExecutionShell(providerIds[0], { keyPresent: value });
  assert(typeof shell.keyRequirement.keyPresent === 'boolean', 'shell keyPresent must be boolean');
  const decision = evaluateProviderGatewayExecutionRequest({
    providerId: providerIds[0],
    explicitOptIn: true,
    serverSideOnly: true,
    keyPresent: value
  }, createProviderGatewayExecutionPolicy({ enabled: true }));
  assert(typeof decision.keyRequirement.keyPresent === 'boolean', 'decision keyPresent must be boolean');
}

// 18-22. Diagnostics, fallback, and realtime voice path stay locked.
for (const item of [defaultDecision, synthetic, dirty]) {
  assert(item.diagnostics.redacted === true, 'diagnostics must be redacted');
  assert(item.fallbackProviderId === 'localdev_mock', 'fallback must be localdev_mock');
  assert(item.realtimeVoicePath.primaryOutput === 'omni.reply_audio_frame.v1', 'reply_audio_frame must be primary output');
  assert(item.realtimeVoicePath.ttsFallbackAllowed === false, 'reply_text -> TTS regression must be forbidden');
  assert(item.realtimeVoicePath.asrLlmTtsFallbackAllowed === false, 'ASR -> LLM -> TTS regression must be forbidden');
}

// 23-25. New v1.4.3 files have no real provider network/socket surface.
const sourceFiles = [
  'src/runtime/providerGatewayExecutionShell.js',
  'src/runtime/providerGatewayExecutionPolicy.js',
  'scripts/provider-gateway-execution-shell.mjs'
];
const sources = sourceFiles.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
const forbiddenFetchCall = 'fet' + 'ch(';
const forbiddenSocketCtor = 'new Web' + 'Socket(';
const forbiddenWsImport = new RegExp("from\\s+['\"]w" + "s['\"]|require\\(['\"]w" + "s['\"]\\)", 'm');
assert(!sources.includes(forbiddenFetchCall), 'v1.4.3 gateway shell files must not call provider network APIs');
assert(!sources.includes(forbiddenSocketCtor), 'v1.4.3 gateway shell files must not construct provider sockets');
assert(!forbiddenWsImport.test(sources), 'v1.4.3 gateway shell files must not import provider socket libraries');

// 26. Package smoke suite is configured for 31 checks.
const smokeSource = fs.readFileSync('scripts/run-smoke-suite.mjs', 'utf8');
assert(smokeSource.includes("'test:provider-gateway-execution-shell'"), 'smoke suite must include provider gateway execution shell test');
const checkCount = [...smokeSource.matchAll(/'test:[^']+'/g)].length;
assert(checkCount === 31, `smoke suite must contain 31 checks (got ${checkCount})`);

// 27. CLI defaults to disabled/no-network and leaks no canary.
const cliResult = spawnSync(process.execPath, ['scripts/provider-gateway-execution-shell.mjs', providerIds[0]], {
  encoding: 'utf8',
  env: {
    ...process.env,
    PROVIDER_GATEWAY_KEY_PRESENT: '1',
    BIGMODEL_API_KEY: 'sk-bigmodel-v143-canary'
  }
});
assert(cliResult.status === 0, 'gateway shell CLI must exit cleanly');
assertNoCanary(cliResult.stdout, 'gateway shell CLI stdout');
const cliJson = JSON.parse(cliResult.stdout);
assert(cliJson.status === 'disabled', 'gateway shell CLI must be disabled by default');
assert(cliJson.keyPresent === true, 'gateway shell CLI may report boolean key presence only');
assert(typeof cliJson.keyPresent === 'boolean', 'gateway shell CLI keyPresent must be boolean');
assert(cliJson.networkCallAttempted === false, 'gateway shell CLI must not attempt network');
assert(cliJson.opensRealSocket === false, 'gateway shell CLI must not open socket');
assert(cliJson.callsRealEndpoint === false, 'gateway shell CLI must not call provider endpoint');
assert(cliJson.audioUpload === false, 'gateway shell CLI must not upload audio');
assert(cliJson.cameraUpload === false, 'gateway shell CLI must not upload camera');
assert(cliJson.billing === false, 'gateway shell CLI must not start billing');
assert(cliJson.replyTextToTts === false, 'gateway shell CLI must not route reply_text to TTS');
assert(cliJson.asrLlmTtsFallback === false, 'gateway shell CLI must not allow ASR->LLM->TTS fallback');
assert(cliJson.fallbackProviderId === 'localdev_mock', 'gateway shell CLI fallback must be localdev_mock');

console.log('Provider gateway execution shell smoke passed: synthetic-only, disabled-by-default, 31-check suite, no real network/socket/media/billing/TTS, fallback=localdev_mock');
