#!/usr/bin/env node
// v1.4.2 Provider Secret Boundary Audit smoke.
//
// Local audit/static checks only. No real provider endpoint is contacted.

import fs from 'node:fs';
import {
  auditProviderSecretBoundarySurfaces,
  auditSecretBoundarySurface,
  createSecretBoundarySinkDeclaration
} from '../src/runtime/providerSecretBoundaryAudit.js';
import {
  createProviderSecretRedactionPolicy,
  classifySecretBoundaryField,
  isForbiddenSecretSink
} from '../src/runtime/providerSecretRedactionPolicy.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function serialize(value) {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function assertNotIncludes(serialized, needle, label) {
  assert(!serialize(serialized).includes(needle), `${label}: must not include ${needle}`);
}

function assertViolation(audit, code, label) {
  assert(audit.status === 'blocked', `${label}: audit must be blocked`);
  assert(audit.violations.some((item) => item.code === code), `${label}: must include ${code}`);
}

const rawSecret = 'synthetic-secret-should-never-appear';
const bigmodelCanary = 'sk-bigmodel-v142-canary';
const dashscopeCanary = 'sk-dashscope-v142-canary';
const rawTokenCanary = 'raw-token-v142-canary';
const maskedKey = 'sk-test****never-output';
const keyPrefix = 'sk-prefix';
const keyHash = 'sha256:0123456789abcdef0123456789abcdef';

// 1. Raw key does not appear in audit output.
const rawAudit = auditSecretBoundarySurface({
  surface: 'CLI output-like object',
  payload: {
    providerId: 'bigmodel_glm_realtime_candidate',
    apiKey: rawSecret,
    fallbackProviderId: 'localdev_mock'
  },
  requireLocaldevMockFallback: true
});
assertViolation(rawAudit, 'raw_secret_field_forbidden', 'raw key');
assertNotIncludes(rawAudit, rawSecret, 'raw audit output');

// 2. Masked key does not appear in audit output.
const maskedAudit = auditSecretBoundarySurface({
  surface: 'diagnostics-like object',
  payload: { maskedKey, fallbackProviderId: 'localdev_mock' },
  requireLocaldevMockFallback: true
});
assertViolation(maskedAudit, 'masked_key_output_forbidden', 'masked key');
assertNotIncludes(maskedAudit, maskedKey, 'masked audit output');

// 3. Key prefix does not appear in audit output.
const prefixAudit = auditSecretBoundarySurface({
  surface: 'preflight output-like object',
  payload: { keyPrefix, fallbackProviderId: 'localdev_mock' },
  requireLocaldevMockFallback: true
});
assertViolation(prefixAudit, 'key_prefix_output_forbidden', 'key prefix');
assertNotIncludes(prefixAudit, keyPrefix, 'prefix audit output');

// 4. Key length does not appear in audit output.
const lengthAudit = auditSecretBoundarySurface({
  surface: 'probe plan output-like object',
  payload: { keyLength: 32, fallbackProviderId: 'localdev_mock' },
  requireLocaldevMockFallback: true
});
assertViolation(lengthAudit, 'key_length_output_forbidden', 'key length');
assertNotIncludes(lengthAudit, '"keyLength":32', 'length audit output');

// 5. Key hash does not appear in audit output.
const hashAudit = auditSecretBoundarySurface({
  surface: 'runtime config-like object',
  payload: { keyHash, fallbackProviderId: 'localdev_mock' },
  requireLocaldevMockFallback: true
});
assertViolation(hashAudit, 'key_hash_output_forbidden', 'key hash');
assertNotIncludes(hashAudit, keyHash, 'hash audit output');

// 6. keyPresent must be boolean.
const keyPresentOk = auditSecretBoundarySurface({
  surface: 'server-side diagnostics',
  payload: { keyPresent: true, fallbackProviderId: 'localdev_mock' },
  requireLocaldevMockFallback: true
});
assert(keyPresentOk.status === 'pass', 'boolean keyPresent must pass');
const keyPresentBad = auditSecretBoundarySurface({
  surface: 'server-side diagnostics',
  payload: { keyPresent: 'true', fallbackProviderId: 'localdev_mock' },
  requireLocaldevMockFallback: true
});
assertViolation(keyPresentBad, 'keyPresent_must_be_boolean', 'non-boolean keyPresent');

// 7-11. Descriptor, diagnostics, Visible Context, Action Log, and Runtime config surfaces catch raw key without leaking it.
const surfaceAudits = auditProviderSecretBoundarySurfaces([
  {
    surface: 'provider descriptor-like object',
    payload: { providerId: 'dashscope_qwen_omni_candidate', secret: bigmodelCanary, fallbackProviderId: 'localdev_mock' },
    requireLocaldevMockFallback: true
  },
  {
    surface: 'diagnostics object',
    payload: { nested: { authorization: dashscopeCanary }, fallbackProviderId: 'localdev_mock' },
    requireLocaldevMockFallback: true
  },
  {
    surface: 'Visible Context',
    payload: { detail: { accessToken: rawTokenCanary }, fallbackProviderId: 'localdev_mock' },
    requireLocaldevMockFallback: true
  },
  {
    surface: 'Action Log',
    payload: { detail: { bearer: bigmodelCanary }, fallbackProviderId: 'localdev_mock' },
    requireLocaldevMockFallback: true
  },
  {
    surface: 'Runtime config snapshot',
    payload: { providerConfig: { password: dashscopeCanary }, fallbackProviderId: 'localdev_mock' },
    requireLocaldevMockFallback: true
  }
]);
assert(surfaceAudits.status === 'blocked', 'surface audit set must block dirty payloads');
assert(surfaceAudits.blockedCount === 5, 'all dirty surfaces must be blocked');
for (const canary of [bigmodelCanary, dashscopeCanary, rawTokenCanary]) {
  assertNotIncludes(surfaceAudits, canary, 'surface audit set');
}

// 12-13. localStorage / sessionStorage / browser runtime are forbidden secret sinks.
for (const sink of ['localStorage', 'sessionStorage', 'browser runtime']) {
  const declaration = createSecretBoundarySinkDeclaration(sink);
  assert(declaration.forbiddenForProviderSecrets === true, `${sink} must be a forbidden secret sink`);
  assert(isForbiddenSecretSink(sink) === true, `${sink} policy lookup must be forbidden`);
  const audit = auditSecretBoundarySurface({ surface: sink, sink, payload: {} });
  assertViolation(audit, 'forbidden_secret_sink', `${sink} audit`);
}

// 14. Synthetic canary secret does not appear in any output.
for (const audit of [rawAudit, maskedAudit, prefixAudit, lengthAudit, hashAudit, keyPresentBad, surfaceAudits]) {
  for (const canary of [rawSecret, bigmodelCanary, dashscopeCanary, rawTokenCanary]) {
    assertNotIncludes(audit, canary, 'canary leak check');
  }
}

// 15. fallbackProviderId remains localdev_mock.
const fallbackBad = auditSecretBoundarySurface({
  surface: 'provider descriptor-like object',
  payload: { keyPresent: false, fallbackProviderId: 'real_cloud_provider' },
  requireLocaldevMockFallback: true
});
assertViolation(fallbackBad, 'fallbackProviderId_must_be_localdev_mock', 'fallback guard');
assert(keyPresentOk.fallbackProviderId === 'localdev_mock', 'clean audit fallback must be localdev_mock');

// Additional policy checks for required forbidden names.
const policy = createProviderSecretRedactionPolicy();
for (const name of [
  'apiKey',
  'api_key',
  'accessToken',
  'access_token',
  'secret',
  'secretKey',
  'clientSecret',
  'bearer',
  'authorization',
  'token',
  'credential',
  'password',
  'BIGMODEL_API_KEY',
  'DASHSCOPE_API_KEY'
]) {
  assert(policy.forbiddenFieldNames.includes(name), `${name} must be in forbiddenFieldNames`);
  assert(classifySecretBoundaryField(name, 'x') === 'forbidden_secret_field', `${name} must classify as forbidden`);
}

// 16. Static check v1.4.2 audit modules/scripts do not expose provider network surfaces.
const auditSources = [
  'scripts/provider-secret-boundary-audit-smoke.mjs',
  'src/runtime/providerSecretRedactionPolicy.js',
  'src/runtime/providerSecretBoundaryAudit.js'
].map((file) => fs.readFileSync(file, 'utf8')).join('\n');
const forbiddenFetchCall = 'fet' + 'ch(';
const forbiddenSocketCtor = 'new Web' + 'Socket(';
const forbiddenWsImport = new RegExp("from\\s+['\"]w" + "s['\"]", 'm');
assert(!auditSources.includes(forbiddenFetchCall), 'secret audit code must not call provider network APIs');
assert(!auditSources.includes(forbiddenSocketCtor), 'secret audit code must not construct provider sockets');
assert(!forbiddenWsImport.test(auditSources), 'secret audit code must not import provider socket libraries');

// 17. Verify/smoke does not perform real network calls through this audit check.
const smokeSource = fs.readFileSync('scripts/run-smoke-suite.mjs', 'utf8');
assert(smokeSource.includes("'test:provider-secret-boundary-audit'"), 'smoke suite must include provider secret boundary audit test');
const checkCount = [...smokeSource.matchAll(/'test:[^']+'/g)].length;
assert(checkCount === 31, `smoke suite must contain 31 checks (got ${checkCount})`);

console.log('Provider secret boundary audit smoke passed: raw/masked/prefix/length/hash blocked, keyPresent boolean-only, forbidden sinks checked, 31-check suite, no real network, fallback=localdev_mock');
