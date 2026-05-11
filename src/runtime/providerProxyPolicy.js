// providerProxyPolicy.js
//
// v1.3.7 Provider Proxy Policy.
//
// Pure functions that model how a future server-side proxy / Robot Gateway /
// Device Runtime would evaluate restricted requests from a Web Console and
// optionally issue ephemeral session tokens.
//
// In v1.3.7 this module is Runtime-only and Mock-safe:
//   - NEVER stores real API keys (any apiKey/secret/tokenRawValue field in
//     the request is stripped before any return value is built).
//   - NEVER returns tokens that unlock real audio/camera upload, real
//     realtime sockets, billing, or reply_text -> TTS.
//   - real_cloud and self_hosted providers are denied by default.
//   - synthetic_test, localdev_mock, offline_pet_engine can receive a
//     synthetic_only token descriptor.
//   - Any request that asks for `media.audio.upload`, `media.camera.upload`,
//     `billing.start`, `provider.realtime.open`, or `reply_text.tts` is
//     denied with explicit blockReasons.

import {
  PROVIDER_PROXY_CONTRACT_SCHEMA,
  PROVIDER_PROXY_DECISION_SCHEMA,
  PROVIDER_PROXY_REQUEST_SCHEMA,
  PROVIDER_PROXY_DENIED_SCOPES,
  PROVIDER_PROXY_ALLOWED_SYNTHETIC_SCOPES,
  PROVIDER_PROXY_ALLOWED_DRY_RUN_SCOPES,
  PROVIDER_PROXY_TOKEN_KINDS,
  createProviderProxyContract
} from './providerProxyContract.js';
import {
  createEphemeralSessionToken,
  validateEphemeralSessionToken,
  EPHEMERAL_SESSION_TOKEN_SCHEMA
} from './providerEphemeralSession.js';
import { getProviderCapability } from './providerCapabilities.js';

const SECRET_FIELD_NAMES = new Set([
  'apiKey',
  'apikey',
  'api_key',
  'token',
  'tokenRawValue',
  'token_raw',
  'authorization',
  'auth',
  'secret',
  'clientSecret',
  'client_secret',
  'accessKey',
  'access_key',
  'accessKeyId',
  'accessKeySecret',
  'refreshToken',
  'refresh_token',
  'bearerToken',
  'bearer_token',
  'password',
  'sessionKey',
  'session_key',
  'authToken'
]);

const REAL_ACTION_SCOPE_MAP = {
  realAudioUpload: 'media.audio.upload',
  realCameraUpload: 'media.camera.upload',
  realtimeBilling: 'billing.start',
  realProviderSocket: 'provider.realtime.open',
  replyTextToTts: 'reply_text.tts'
};

function isRealProviderKind(kind) {
  return kind === 'real_cloud' || kind === 'self_hosted';
}

function stripSecrets(obj, droppedOut) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    return obj.map((item) => stripSecrets(item, droppedOut));
  }
  const out = {};
  for (const [key, value] of Object.entries(obj)) {
    if (SECRET_FIELD_NAMES.has(key)) {
      droppedOut.push(key);
      continue;
    }
    if (value && typeof value === 'object') {
      out[key] = stripSecrets(value, droppedOut);
    } else {
      out[key] = value;
    }
  }
  return out;
}

export function createDefaultProviderProxyPolicy(overrides = {}) {
  const contract = createProviderProxyContract();
  return {
    schema: 'omni.provider_proxy_policy.v1',
    contract,
    defaultTokenKind: 'synthetic_only',
    defaultTtlMs: contract.defaultTtlMs,
    allowDryRunTokenForSynthetic: true,
    allowSyntheticTokenForLocalDevMock: true,
    allowSyntheticTokenForOfflineEngine: true,
    denyRealCloudByDefault: true,
    denySelfHostedByDefault: true,
    fallbackProviderId: 'localdev_mock',
    safety: {
      apiKeyAllowedInRequest: false,
      apiKeyAllowedInResponse: false,
      uploadAllowed: false,
      billingAllowed: false,
      socketOpenAllowed: false,
      replyTextToTts: false
    },
    ...overrides,
    notes: overrides.notes || [
      'Real provider keys live server-side. Web Console must never send them.',
      'Any secret-like field in the request is stripped before evaluation.',
      'Default decision for real providers is denied.',
      'All issued tokens are synthetic_only or dry_run_only.'
    ]
  };
}

function describeBlockReasons(request) {
  const reasons = [];
  if (!request || typeof request !== 'object') return reasons;
  for (const [key, scope] of Object.entries(REAL_ACTION_SCOPE_MAP)) {
    if (request[key] === true) {
      reasons.push(`requested_${key}_blocked:${scope}`);
    }
  }
  if (Array.isArray(request.requestedScope)) {
    for (const s of request.requestedScope) {
      if (typeof s === 'string' && PROVIDER_PROXY_DENIED_SCOPES.includes(s)) {
        reasons.push(`scope_denied:${s}`);
      }
    }
  }
  if (request.providerSecretInline) {
    reasons.push('provider_secret_must_not_be_inline');
  }
  return reasons;
}

function pickAllowedScope(tokenKind, requestedScope) {
  const allowed = tokenKind === 'dry_run_only'
    ? PROVIDER_PROXY_ALLOWED_DRY_RUN_SCOPES
    : PROVIDER_PROXY_ALLOWED_SYNTHETIC_SCOPES;
  if (!Array.isArray(requestedScope) || requestedScope.length === 0) return [...allowed];
  const out = [];
  for (const s of requestedScope) {
    if (typeof s !== 'string') continue;
    if (PROVIDER_PROXY_DENIED_SCOPES.includes(s)) continue;
    if (allowed.includes(s) && !out.includes(s)) out.push(s);
  }
  return out.length > 0 ? out : [...allowed];
}

function buildDecisionEnvelope({
  decision,
  policy,
  providerId,
  providerKind,
  tokenKind,
  token,
  blockReasons,
  secretStripped,
  strippedFields,
  scrubbedRequest,
  notes
}) {
  return {
    schema: PROVIDER_PROXY_DECISION_SCHEMA,
    decision,
    providerId,
    providerKind,
    tokenKind: tokenKind || null,
    token: token || null,
    fallbackProviderId: policy.fallbackProviderId,
    contractSchema: PROVIDER_PROXY_CONTRACT_SCHEMA,
    tokenSchema: EPHEMERAL_SESSION_TOKEN_SCHEMA,
    blockReasons: blockReasons || [],
    secretStripped: secretStripped === true,
    strippedFields: strippedFields || [],
    scrubbedRequest: scrubbedRequest || null,
    safety: {
      opensRealSocket: false,
      canSendRealAudio: false,
      canSendRealCamera: false,
      canStartBillingSession: false,
      replyTextToTts: false,
      sentToProvider: false,
      uploaded: false,
      persisted: false,
      apiKeyReturned: false,
      apiKeyAccepted: false
    },
    decidedAt: new Date().toISOString(),
    notes: notes || []
  };
}

export function evaluateProviderProxyRequest(request = {}, policy = null) {
  const effectivePolicy = policy || createDefaultProviderProxyPolicy();
  const strippedFields = [];
  const scrubbedRequest = stripSecrets({ ...request, schema: PROVIDER_PROXY_REQUEST_SCHEMA }, strippedFields);
  const secretStripped = strippedFields.length > 0;

  const providerId = scrubbedRequest.providerId || 'localdev_mock';
  const capability = getProviderCapability(providerId);
  const providerKind = capability?.providerKind || 'unknown';
  const blockReasons = describeBlockReasons(scrubbedRequest);

  const realActionRequested = blockReasons.length > 0;
  const realProvider = isRealProviderKind(providerKind);

  if (realActionRequested) {
    return buildDecisionEnvelope({
      decision: 'denied',
      policy: effectivePolicy,
      providerId,
      providerKind,
      tokenKind: null,
      token: null,
      blockReasons,
      secretStripped,
      strippedFields,
      scrubbedRequest,
      notes: ['Real audio upload / camera upload / billing / socket / TTS are blocked.']
    });
  }

  if (realProvider) {
    return buildDecisionEnvelope({
      decision: 'denied',
      policy: effectivePolicy,
      providerId,
      providerKind,
      tokenKind: null,
      token: null,
      blockReasons: ['real_provider_blocked_by_default'],
      secretStripped,
      strippedFields,
      scrubbedRequest,
      notes: ['Real provider sockets must be opened by a future server-side proxy / Robot Gateway / Device Runtime, not by the browser.']
    });
  }

  const requestedTokenKind = PROVIDER_PROXY_TOKEN_KINDS.includes(scrubbedRequest.tokenKind)
    ? scrubbedRequest.tokenKind
    : effectivePolicy.defaultTokenKind || 'synthetic_only';
  const allowedScope = pickAllowedScope(requestedTokenKind, scrubbedRequest.requestedScope);

  const token = createEphemeralSessionToken({
    tokenKind: requestedTokenKind,
    providerId,
    robotId: scrubbedRequest.robotId || null,
    sessionId: scrubbedRequest.sessionId || null,
    ttlMs: Number.isFinite(scrubbedRequest.ttlMs) ? scrubbedRequest.ttlMs : effectivePolicy.defaultTtlMs,
    scope: allowedScope
  });

  return buildDecisionEnvelope({
    decision: 'granted',
    policy: effectivePolicy,
    providerId,
    providerKind,
    tokenKind: requestedTokenKind,
    token,
    blockReasons: [],
    secretStripped,
    strippedFields,
    scrubbedRequest,
    notes: ['Synthetic / dry-run token descriptor. Not a real provider token. No real socket, no real upload, no billing.']
  });
}

export function requestEphemeralProviderSession(input = {}) {
  const policy = input.policy || createDefaultProviderProxyPolicy();
  return evaluateProviderProxyRequest(input, policy);
}

export { validateEphemeralSessionToken };

export function summarizeProviderProxyDecision(decision) {
  if (!decision) return 'no decision';
  if (decision.decision === 'denied') {
    return `denied: provider=${decision.providerId}/${decision.providerKind}; reasons=${(decision.blockReasons || []).join(',') || 'none'}; secretStripped=${decision.secretStripped}; fallback=${decision.fallbackProviderId}`;
  }
  return `granted: provider=${decision.providerId}/${decision.providerKind}; tokenKind=${decision.tokenKind}; tokenId=${decision.token?.tokenId}; scope=${(decision.token?.scope || []).join('|')}; ttlMs=${decision.token?.ttlMs}; secretStripped=${decision.secretStripped}; fallback=${decision.fallbackProviderId}`;
}

export function describeProxyForUi(policy, lastDecision) {
  const contract = (policy && policy.contract) || createProviderProxyContract();
  return {
    proxyRequired: contract.proxyRequired,
    frontendCanHoldApiKey: contract.frontendCanHoldApiKey,
    browserDirectProviderSocketAllowed: contract.browserDirectProviderSocketAllowed,
    serverSideSecretRequired: contract.serverSideSecretRequired,
    supportedTokenKinds: [...(contract.supportedTokenKinds || [])],
    defaultTtlMs: contract.defaultTtlMs,
    realMediaUploadAllowed: contract.realMediaUploadAllowed,
    realtimeBillingAllowed: contract.realtimeBillingAllowed,
    replyTextToTts: contract.replyTextToTts,
    replyAudioFrameNative: contract.replyAudioFrameNative,
    fallbackProviderId: contract.fallbackProviderId,
    lastDecision: lastDecision
      ? {
          decision: lastDecision.decision,
          providerId: lastDecision.providerId,
          providerKind: lastDecision.providerKind,
          tokenKind: lastDecision.tokenKind,
          tokenId: lastDecision.token?.tokenId || null,
          ttlMs: lastDecision.token?.ttlMs || 0,
          secretStripped: lastDecision.secretStripped,
          blockReasons: [...(lastDecision.blockReasons || [])],
          decidedAt: lastDecision.decidedAt
        }
      : null
  };
}
