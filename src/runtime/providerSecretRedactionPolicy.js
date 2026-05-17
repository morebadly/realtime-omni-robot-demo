// providerSecretRedactionPolicy.js
//
// v1.4.2 Provider Secret Boundary Audit policy.
//
// Pure local helpers only. This module does not read env values, does not
// open network connections, and does not produce raw / masked / prefix /
// length / hash representations of keys.

export const PROVIDER_SECRET_REDACTION_POLICY_SCHEMA = 'omni.provider_secret_redaction_policy.v1';

export const FORBIDDEN_SECRET_FIELD_NAMES = Object.freeze([
  'apiKey',
  'api_key',
  'accessToken',
  'access_token',
  'secret',
  'secretKey',
  'clientSecret',
  'client_secret',
  'bearer',
  'authorization',
  'token',
  'credential',
  'credentials',
  'password',
  'BIGMODEL_API_KEY',
  'DASHSCOPE_API_KEY'
]);

export const FORBIDDEN_DERIVED_SECRET_FIELD_NAMES = Object.freeze([
  'maskedKey',
  'maskedApiKey',
  'keyMask',
  'keyPrefix',
  'apiKeyPrefix',
  'secretPrefix',
  'tokenPrefix',
  'keyLength',
  'apiKeyLength',
  'secretLength',
  'tokenLength',
  'keyHash',
  'apiKeyHash',
  'secretHash',
  'tokenHash'
]);

export const FORBIDDEN_SECRET_SINKS = Object.freeze([
  'frontend bundle',
  'Runtime config snapshot',
  'Visible Context',
  'Action Log',
  'localStorage',
  'sessionStorage',
  'browser runtime'
]);

export const SYNTHETIC_SECRET_CANARIES = Object.freeze([
  'synthetic-secret-should-never-appear',
  'sk-bigmodel-v142-canary',
  'sk-dashscope-v142-canary',
  'raw-token-v142-canary',
  'masked-secret-v142-canary'
]);

const SECRET_FIELD_NAME_SET = new Set(FORBIDDEN_SECRET_FIELD_NAMES.map((name) => name.toLowerCase()));
const DERIVED_FIELD_NAME_SET = new Set(FORBIDDEN_DERIVED_SECRET_FIELD_NAMES.map((name) => name.toLowerCase()));
const FORBIDDEN_SINK_SET = new Set(FORBIDDEN_SECRET_SINKS.map((name) => name.toLowerCase()));

const SECRET_VALUE_PATTERNS = [
  /^sk-[A-Za-z0-9._-]{6,}$/i,
  /^Bearer\s+\S+/i,
  /^AKIA[A-Z0-9]{8,}$/i,
  /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/i
];

const MASKED_SECRET_PATTERNS = [
  /\*{3,}/,
  /sk-[A-Za-z0-9]{1,8}\*{2,}/i,
  /\b[A-Za-z0-9]{2,8}\.{3,}[A-Za-z0-9]{2,8}\b/
];

const HASH_VALUE_PATTERNS = [
  /^sha(1|256|512):[a-f0-9]{16,}$/i,
  /^[a-f0-9]{32,}$/i
];

export function createProviderSecretRedactionPolicy(overrides = {}) {
  return {
    schema: PROVIDER_SECRET_REDACTION_POLICY_SCHEMA,
    allowKeyPresentBooleanOnly: true,
    forbidRawKeyOutput: true,
    forbidMaskedKeyOutput: true,
    forbidKeyPrefixOutput: true,
    forbidKeyLengthOutput: true,
    forbidKeyHashOutput: true,
    readRealEnvValues: false,
    fallbackProviderId: 'localdev_mock',
    forbiddenFieldNames: [...FORBIDDEN_SECRET_FIELD_NAMES],
    forbiddenDerivedFieldNames: [...FORBIDDEN_DERIVED_SECRET_FIELD_NAMES],
    forbiddenSinks: [...FORBIDDEN_SECRET_SINKS],
    syntheticCanaries: [...SYNTHETIC_SECRET_CANARIES],
    ...overrides,
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
      ...(overrides.safety || {})
    }
  };
}

export function isForbiddenSecretFieldName(name) {
  return SECRET_FIELD_NAME_SET.has(String(name || '').toLowerCase());
}

export function isForbiddenDerivedSecretFieldName(name) {
  return DERIVED_FIELD_NAME_SET.has(String(name || '').toLowerCase());
}

export function isForbiddenSecretSink(name) {
  return FORBIDDEN_SINK_SET.has(String(name || '').toLowerCase());
}

export function isAllowedKeyPresenceField(name, value) {
  return name === 'keyPresent' && typeof value === 'boolean';
}

export function isSyntheticSecretCanary(value) {
  if (typeof value !== 'string') return false;
  return SYNTHETIC_SECRET_CANARIES.some((canary) => value.includes(canary));
}

export function isRawSecretLikeValue(value) {
  if (typeof value !== 'string') return false;
  return isSyntheticSecretCanary(value) || SECRET_VALUE_PATTERNS.some((pattern) => pattern.test(value));
}

export function isMaskedSecretLikeValue(value) {
  if (typeof value !== 'string') return false;
  return MASKED_SECRET_PATTERNS.some((pattern) => pattern.test(value));
}

export function isHashLikeSecretValue(value) {
  if (typeof value !== 'string') return false;
  return HASH_VALUE_PATTERNS.some((pattern) => pattern.test(value));
}

export function classifySecretBoundaryField(name, value) {
  if (isAllowedKeyPresenceField(name, value)) return 'allowed_key_present_boolean';
  if (name === 'keyPresent') return 'key_present_must_be_boolean';
  if (isForbiddenSecretFieldName(name)) return 'forbidden_secret_field';
  if (isForbiddenDerivedSecretFieldName(name)) return 'forbidden_derived_secret_field';
  if (isRawSecretLikeValue(value)) return 'raw_secret_like_value';
  if (isMaskedSecretLikeValue(value)) return 'masked_secret_like_value';
  if (isHashLikeSecretValue(value)) return 'secret_hash_like_value';
  return 'safe_metadata';
}

export function sanitizeSecretBoundaryValue(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item) => sanitizeSecretBoundaryValue(item));
  const out = {};
  for (const [key, child] of Object.entries(value)) {
    const classification = classifySecretBoundaryField(key, child);
    if (classification !== 'safe_metadata' && classification !== 'allowed_key_present_boolean') {
      continue;
    }
    out[key] = sanitizeSecretBoundaryValue(child);
  }
  return out;
}
