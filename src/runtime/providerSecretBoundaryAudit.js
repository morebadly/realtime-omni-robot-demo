// providerSecretBoundaryAudit.js
//
// v1.4.2 Provider Secret Boundary Audit.
//
// Pure local audit logic. Audit reports include issue codes and object paths
// only; they never echo the secret-like value that triggered a finding.

import {
  createProviderSecretRedactionPolicy,
  classifySecretBoundaryField,
  isForbiddenSecretSink,
  sanitizeSecretBoundaryValue
} from './providerSecretRedactionPolicy.js';

export const PROVIDER_SECRET_BOUNDARY_AUDIT_SCHEMA = 'omni.provider_secret_boundary_audit.v1';

const DEFAULT_FORBIDDEN_SINKS = [
  'frontend bundle',
  'Runtime config snapshot',
  'Visible Context',
  'Action Log',
  'localStorage',
  'sessionStorage',
  'browser runtime'
];

function pathJoin(parent, key) {
  if (!parent) return String(key);
  return `${parent}.${String(key)}`;
}

function issue(code, path, detail = {}) {
  return {
    code,
    path,
    leakedValueIncluded: false,
    ...detail
  };
}

function normalizeSinkName(input) {
  return String(input || '').trim();
}

function walkForSecretBoundary(value, path = '') {
  const issues = [];
  if (value === null || value === undefined) return issues;

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      issues.push(...walkForSecretBoundary(item, pathJoin(path, index)));
    });
    return issues;
  }

  if (typeof value !== 'object') return issues;

  for (const [key, child] of Object.entries(value)) {
    const childPath = pathJoin(path, key);
    const classification = classifySecretBoundaryField(key, child);

    if (classification === 'key_present_must_be_boolean') {
      issues.push(issue('keyPresent_must_be_boolean', childPath));
    } else if (classification === 'forbidden_secret_field') {
      issues.push(issue('raw_secret_field_forbidden', childPath));
    } else if (classification === 'forbidden_derived_secret_field') {
      if (/prefix/i.test(key)) issues.push(issue('key_prefix_output_forbidden', childPath));
      else if (/length/i.test(key)) issues.push(issue('key_length_output_forbidden', childPath));
      else if (/hash/i.test(key)) issues.push(issue('key_hash_output_forbidden', childPath));
      else issues.push(issue('masked_key_output_forbidden', childPath));
    } else if (classification === 'raw_secret_like_value') {
      issues.push(issue('raw_secret_value_forbidden', childPath));
    } else if (classification === 'masked_secret_like_value') {
      issues.push(issue('masked_key_output_forbidden', childPath));
    } else if (classification === 'secret_hash_like_value') {
      issues.push(issue('key_hash_output_forbidden', childPath));
    }

    if (child && typeof child === 'object') {
      issues.push(...walkForSecretBoundary(child, childPath));
    }
  }

  return issues;
}

function collectForbiddenSinkIssues(input = {}) {
  const sinkName = normalizeSinkName(input.sink || input.surface || input.name);
  const explicitSink = input.forbiddenSink === true || isForbiddenSecretSink(sinkName);
  if (!explicitSink) return [];
  return [issue('forbidden_secret_sink', sinkName || 'unknown_sink', {
    sink: sinkName || 'unknown_sink',
    sinkForbidden: true
  })];
}

function fallbackIssues(value) {
  if (!value || typeof value !== 'object') return [];
  if (!Object.prototype.hasOwnProperty.call(value, 'fallbackProviderId')) return [];
  return value.fallbackProviderId === 'localdev_mock'
    ? []
    : [issue('fallbackProviderId_must_be_localdev_mock', 'fallbackProviderId')];
}

export function auditSecretBoundarySurface(input = {}) {
  const policy = input.policy || createProviderSecretRedactionPolicy();
  const surface = input.surface || input.name || 'unknown_surface';
  const payload = input.payload ?? input.value ?? {};
  const sinkIssues = collectForbiddenSinkIssues(input);
  const payloadIssues = walkForSecretBoundary(payload);
  const fallbackProviderIssues = input.requireLocaldevMockFallback === true ? fallbackIssues(payload) : [];
  const violations = [...sinkIssues, ...payloadIssues, ...fallbackProviderIssues];

  return {
    schema: PROVIDER_SECRET_BOUNDARY_AUDIT_SCHEMA,
    surface,
    status: violations.length === 0 ? 'pass' : 'blocked',
    allowedKeyPresence: true,
    keyPresentBooleanOnly: true,
    rawKeyIncluded: false,
    maskedKeyIncluded: false,
    keyPrefixIncluded: false,
    keyLengthIncluded: false,
    keyHashIncluded: false,
    leakedValueIncluded: false,
    forbiddenSinks: [...DEFAULT_FORBIDDEN_SINKS],
    sinkForbidden: sinkIssues.length > 0,
    fallbackProviderId: payload?.fallbackProviderId || input.fallbackProviderId || 'localdev_mock',
    violations,
    violationCount: violations.length,
    sanitizedPreview: sanitizeSecretBoundaryValue(payload),
    safety: {
      networkCallAttempted: false,
      opensRealSocket: false,
      sendsAudio: false,
      sendsCamera: false,
      startsBilling: false,
      replyTextToTts: false,
      rawKeyPrinted: false,
      maskedKeyPrinted: false,
      keyPrefixPrinted: false,
      keyLengthPrinted: false,
      keyHashPrinted: false,
      fallbackProviderId: 'localdev_mock',
      ...policy.safety
    },
    notes: [
      'Audit results include issue codes and paths only.',
      'Raw, masked, prefix, length, and hash forms of provider keys are forbidden.',
      'keyPresent is the only allowed key-state output and must be boolean.'
    ]
  };
}

export function auditProviderSecretBoundarySurfaces(surfaces = []) {
  const audits = surfaces.map((surface) => auditSecretBoundarySurface(surface));
  const blocked = audits.filter((audit) => audit.status !== 'pass');
  return {
    schema: 'omni.provider_secret_boundary_audit_set.v1',
    status: blocked.length === 0 ? 'pass' : 'blocked',
    count: audits.length,
    blockedCount: blocked.length,
    leakedValueIncluded: false,
    fallbackProviderId: 'localdev_mock',
    audits
  };
}

export function createSecretBoundarySinkDeclaration(name) {
  return {
    schema: 'omni.provider_secret_sink_declaration.v1',
    sink: name,
    forbiddenForProviderSecrets: isForbiddenSecretSink(name),
    keyPresentAllowed: name === 'server-side diagnostics',
    rawKeyAllowed: false,
    maskedKeyAllowed: false,
    keyPrefixAllowed: false,
    keyLengthAllowed: false,
    keyHashAllowed: false,
    fallbackProviderId: 'localdev_mock'
  };
}

export function summarizeProviderSecretBoundaryAudit(audit) {
  if (!audit) return 'provider secret boundary audit=unknown';
  return `surface=${audit.surface}; status=${audit.status}; violations=${audit.violationCount || 0}; values_leaked=no; keyPresent=boolean_only; fallback=${audit.fallbackProviderId || 'localdev_mock'}`;
}
