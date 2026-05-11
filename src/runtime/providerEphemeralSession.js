// providerEphemeralSession.js
//
// v1.3.7 Ephemeral Session Token descriptor.
//
// This module defines the local Mock-only shape of a future ephemeral
// session token. It NEVER produces a real provider token, NEVER reaches a
// real provider, NEVER persists to storage, NEVER unlocks real audio /
// camera upload, NEVER unlocks billing, and NEVER converts reply_text to
// TTS.
//
// Tokens are synthetic-only or dry-run-only descriptors. Real realtime
// tokens are intentionally out of scope for v1.3.7.

import {
  PROVIDER_PROXY_ALLOWED_SYNTHETIC_SCOPES,
  PROVIDER_PROXY_ALLOWED_DRY_RUN_SCOPES,
  PROVIDER_PROXY_DENIED_SCOPES,
  PROVIDER_PROXY_DEFAULT_TTL_MS,
  PROVIDER_PROXY_TOKEN_KINDS
} from './providerProxyContract.js';

export const EPHEMERAL_SESSION_TOKEN_SCHEMA = 'omni.ephemeral_session_token.v1';
export const EPHEMERAL_TOKEN_KINDS = [...PROVIDER_PROXY_TOKEN_KINDS];
export const DEFAULT_EPHEMERAL_TTL_MS = PROVIDER_PROXY_DEFAULT_TTL_MS;
export const EPHEMERAL_TOKEN_DENIED_SCOPES = [...PROVIDER_PROXY_DENIED_SCOPES];

let tokenCounter = 0;

function nextTokenId(seed) {
  tokenCounter += 1;
  const noise = Math.floor(Math.random() * 1e6).toString(36);
  const tag = seed ? String(seed).replace(/[^a-zA-Z0-9_]/g, '').slice(0, 12) : 'eph';
  return `eph_sess_${tag}_${tokenCounter}_${noise}`;
}

function lockTokenSafety() {
  return {
    opensRealSocket: false,
    canSendRealAudio: false,
    canSendRealCamera: false,
    canStartBillingSession: false,
    replyTextToTts: false,
    sentToProvider: false,
    uploaded: false,
    persisted: false,
    replyAudioFrameNative: true,
    realMediaBlocked: true,
    syntheticOnly: true
  };
}

function pickScope(tokenKind, requestedScope) {
  const baseAllowed = tokenKind === 'dry_run_only'
    ? PROVIDER_PROXY_ALLOWED_DRY_RUN_SCOPES
    : PROVIDER_PROXY_ALLOWED_SYNTHETIC_SCOPES;
  if (!Array.isArray(requestedScope) || requestedScope.length === 0) {
    return [...baseAllowed];
  }
  const allowed = [];
  for (const s of requestedScope) {
    if (typeof s !== 'string') continue;
    if (PROVIDER_PROXY_DENIED_SCOPES.includes(s)) continue;
    if (baseAllowed.includes(s) && !allowed.includes(s)) allowed.push(s);
  }
  if (allowed.length === 0) return [...baseAllowed];
  return allowed;
}

export function createEphemeralSessionToken(input = {}) {
  const tokenKind = EPHEMERAL_TOKEN_KINDS.includes(input.tokenKind) ? input.tokenKind : 'synthetic_only';
  const ttlMs = Number.isFinite(input.ttlMs) && input.ttlMs > 0 ? Math.min(input.ttlMs, 30 * 60 * 1000) : DEFAULT_EPHEMERAL_TTL_MS;
  const issuedAt = Number.isFinite(input.issuedAt) ? input.issuedAt : Date.now();
  const expiresAt = issuedAt + ttlMs;
  const scope = pickScope(tokenKind, input.scope);
  return {
    schema: EPHEMERAL_SESSION_TOKEN_SCHEMA,
    tokenId: input.tokenId || nextTokenId(input.providerId || tokenKind),
    tokenKind,
    providerId: input.providerId || 'localdev_mock',
    robotId: input.robotId || null,
    sessionId: input.sessionId || null,
    issuedAt,
    expiresAt,
    ttlMs,
    scope,
    deniedScopes: [...EPHEMERAL_TOKEN_DENIED_SCOPES],
    safety: lockTokenSafety(),
    fallbackProviderId: 'localdev_mock',
    note: 'Synthetic / dry-run token descriptor only. Not a real provider token.'
  };
}

export function isTokenActive(token, nowMs = Date.now()) {
  if (!token || typeof token !== 'object') return false;
  if (token.schema !== EPHEMERAL_SESSION_TOKEN_SCHEMA) return false;
  if (!EPHEMERAL_TOKEN_KINDS.includes(token.tokenKind)) return false;
  if (!Number.isFinite(token.expiresAt)) return false;
  return nowMs < token.expiresAt;
}

export function validateEphemeralSessionToken(token, nowMs = Date.now()) {
  const failures = [];
  if (!token || typeof token !== 'object') return { ok: false, failures: ['token_must_be_object'] };
  if (token.schema !== EPHEMERAL_SESSION_TOKEN_SCHEMA) failures.push('schema_must_be_omni_ephemeral_session_token_v1');
  if (!EPHEMERAL_TOKEN_KINDS.includes(token.tokenKind)) failures.push('tokenKind_must_be_synthetic_only_or_dry_run_only');
  if (typeof token.tokenId !== 'string' || token.tokenId.length === 0) failures.push('tokenId_must_be_non_empty_string');
  if (!Number.isFinite(token.issuedAt)) failures.push('issuedAt_must_be_number');
  if (!Number.isFinite(token.expiresAt)) failures.push('expiresAt_must_be_number');
  if (!Number.isFinite(token.ttlMs) || token.ttlMs <= 0) failures.push('ttlMs_must_be_positive_number');
  if (Number.isFinite(token.expiresAt) && Number.isFinite(token.issuedAt) && token.expiresAt <= token.issuedAt) {
    failures.push('expiresAt_must_be_after_issuedAt');
  }
  if (token.fallbackProviderId !== 'localdev_mock') failures.push('fallback_must_be_localdev_mock');
  if (!Array.isArray(token.scope)) failures.push('scope_must_be_array');
  if (!Array.isArray(token.deniedScopes)) failures.push('deniedScopes_must_be_array');
  if (Array.isArray(token.scope)) {
    for (const s of token.scope) {
      if (EPHEMERAL_TOKEN_DENIED_SCOPES.includes(s)) failures.push(`scope_must_not_include_denied_scope:${s}`);
    }
  }
  if (Array.isArray(token.deniedScopes)) {
    for (const required of EPHEMERAL_TOKEN_DENIED_SCOPES) {
      if (!token.deniedScopes.includes(required)) failures.push(`deniedScopes_must_include:${required}`);
    }
  }
  const safety = token.safety || {};
  const lockedKeys = [
    'opensRealSocket',
    'canSendRealAudio',
    'canSendRealCamera',
    'canStartBillingSession',
    'replyTextToTts',
    'sentToProvider',
    'uploaded',
    'persisted'
  ];
  for (const key of lockedKeys) {
    if (safety[key] !== false) failures.push(`safety_${key}_must_be_false`);
  }
  if (failures.length === 0 && !isTokenActive(token, nowMs)) failures.push('token_expired');
  return { ok: failures.length === 0, failures };
}

export function summarizeEphemeralToken(token) {
  if (!token) return 'no ephemeral token';
  return `tokenId=${token.tokenId}; kind=${token.tokenKind}; providerId=${token.providerId}; ttlMs=${token.ttlMs}; scope=${(token.scope || []).join('|')}; fallback=${token.fallbackProviderId}`;
}

export function describeTokenForUi(token) {
  if (!token) {
    return {
      present: false,
      tokenKind: null,
      providerId: null,
      ttlMs: 0,
      expiresInMs: 0,
      scope: [],
      deniedScopes: [...EPHEMERAL_TOKEN_DENIED_SCOPES]
    };
  }
  const now = Date.now();
  return {
    present: true,
    tokenId: token.tokenId,
    tokenKind: token.tokenKind,
    providerId: token.providerId,
    sessionId: token.sessionId,
    robotId: token.robotId,
    ttlMs: token.ttlMs,
    expiresInMs: Math.max(0, (token.expiresAt || 0) - now),
    scope: [...(token.scope || [])],
    deniedScopes: [...(token.deniedScopes || [])],
    fallbackProviderId: token.fallbackProviderId,
    safety: { ...(token.safety || {}) }
  };
}
