// providerProxyHandshakeSandbox.js
//
// v1.3.8 Provider Proxy Handshake Sandbox.
//
// Pure state machine for "how a future server-side proxy would validate
// an ephemeral session token and perform a real provider handshake". In
// v1.3.8 it stays dry-run / synthetic-only. It does NOT open a real
// provider socket. It does NOT upload real audio / camera. It does NOT
// start realtime billing. It does NOT connect `reply_text` to TTS.

import { getProviderCapability } from './providerCapabilities.js';
import {
  isTokenActive,
  validateEphemeralSessionToken,
  EPHEMERAL_SESSION_TOKEN_SCHEMA
} from './providerEphemeralSession.js';

export const PROVIDER_PROXY_HANDSHAKE_SANDBOX_PROTOCOL = 'omni.provider_proxy_handshake_sandbox.v1';

export const PROVIDER_PROXY_HANDSHAKE_SANDBOX_STATES = Object.freeze([
  'idle',
  'requested',
  'proxy_validating',
  'token_validated',
  'provider_handshake_blocked',
  'dry_run_ready',
  'dry_run_error',
  'fallback_to_localdev_mock'
]);

export const PROVIDER_PROXY_HANDSHAKE_SANDBOX_EVENTS = Object.freeze([
  'provider.proxy.handshake.requested',
  'provider.proxy.handshake.token_validated',
  'provider.proxy.handshake.blocked',
  'provider.proxy.handshake.dry_run_ready',
  'provider.proxy.handshake.dry_run_error',
  'provider.proxy.handshake.fallback'
]);

const MAX_HISTORY = 16;

function nowIso() { return new Date().toISOString(); }

function safeProviderKind(providerId) {
  const cap = getProviderCapability(providerId);
  return cap?.providerKind || 'unknown';
}

function isRealProviderKind(kind) {
  return kind === 'real_cloud' || kind === 'self_hosted' || kind === 'real_cloud_candidate';
}

function lockSafetyFields() {
  return {
    opensRealSocket: false,
    sentToProvider: false,
    uploaded: false,
    persisted: false,
    billingStarted: false,
    replyTextToTts: false,
    replyAudioFrameNative: true,
    replyTextSubtitleOnly: true,
    realMediaBlocked: true,
    realProviderHandshakeBlocked: true,
    dryRunOnly: true
  };
}

export function createDefaultProxyHandshakeSandboxState({ providerId = 'localdev_mock', providerKind = null } = {}) {
  return {
    protocol: PROVIDER_PROXY_HANDSHAKE_SANDBOX_PROTOCOL,
    providerId,
    providerKind: providerKind || safeProviderKind(providerId),
    state: 'idle',
    previousState: null,
    handshakeMode: 'idle',
    lastEvent: null,
    lastReason: null,
    lastTransitionAt: null,
    requestedCount: 0,
    validatedCount: 0,
    blockedCount: 0,
    dryRunReadyCount: 0,
    dryRunErrorCount: 0,
    fallbackCount: 0,
    history: [],
    activeTokenId: null,
    activeTokenKind: null,
    fallbackProviderId: 'localdev_mock',
    safety: lockSafetyFields(),
    guardrails: {
      realProviderHandshakeBlockedByDefault: true,
      noRealAudioUpload: true,
      noRealCameraUpload: true,
      noRealtimeBilling: true,
      noRealProviderSocket: true,
      replyAudioFrameIsRealtimeVoiceOutput: true,
      replyTextNotTtsInput: true,
      asrLlmTtsRegressionForbidden: true,
      localdevMockFallbackRequired: true,
      apiKeyMustNotEnterFrontend: true,
      ephemeralTokenSyntheticOrDryRunOnly: true,
      dryRunOnly: true
    }
  };
}

function appendHistory(prev, event, nextState, detail = {}) {
  const item = {
    at: nowIso(),
    event,
    from: prev?.state || 'idle',
    to: nextState,
    reason: detail.reason || event,
    providerId: prev?.providerId || null,
    dryRunOnly: true,
    opensRealSocket: false
  };
  return [item, ...(prev?.history || [])].slice(0, MAX_HISTORY);
}

export function transitionProxyHandshakeSandbox(prev, event, detail = {}) {
  const base = prev || createDefaultProxyHandshakeSandboxState();
  const providerKind = base.providerKind || safeProviderKind(base.providerId);
  const reason = detail.reason || event;

  if (event === 'provider.proxy.handshake.requested') {
    if (isRealProviderKind(providerKind)) {
      const nextState = 'provider_handshake_blocked';
      return {
        ...base,
        previousState: base.state,
        state: nextState,
        handshakeMode: 'blocked',
        lastEvent: 'provider.proxy.handshake.blocked',
        lastReason: 'real_provider_handshake_blocked_by_default',
        lastTransitionAt: nowIso(),
        requestedCount: base.requestedCount + 1,
        blockedCount: base.blockedCount + 1,
        history: appendHistory(base, 'provider.proxy.handshake.blocked', nextState, { reason: 'real_provider_handshake_blocked_by_default' }),
        safety: lockSafetyFields()
      };
    }
    const nextState = 'requested';
    return {
      ...base,
      previousState: base.state,
      state: nextState,
      handshakeMode: 'dry_run_only',
      lastEvent: event,
      lastReason: reason,
      lastTransitionAt: nowIso(),
      requestedCount: base.requestedCount + 1,
      history: appendHistory(base, event, nextState, detail),
      safety: lockSafetyFields()
    };
  }

  if (event === 'provider.proxy.handshake.token_validated') {
    if (isRealProviderKind(providerKind)) {
      return transitionProxyHandshakeSandbox(base, 'provider.proxy.handshake.blocked', { reason: 'real_provider_handshake_blocked_by_default' });
    }
    const nextState = 'token_validated';
    return {
      ...base,
      previousState: base.state,
      state: nextState,
      handshakeMode: 'dry_run_only',
      lastEvent: event,
      lastReason: reason,
      lastTransitionAt: nowIso(),
      validatedCount: base.validatedCount + 1,
      activeTokenId: detail.tokenId || base.activeTokenId,
      activeTokenKind: detail.tokenKind || base.activeTokenKind,
      history: appendHistory(base, event, nextState, detail),
      safety: lockSafetyFields()
    };
  }

  if (event === 'provider.proxy.handshake.blocked') {
    const nextState = 'provider_handshake_blocked';
    return {
      ...base,
      previousState: base.state,
      state: nextState,
      handshakeMode: 'blocked',
      lastEvent: event,
      lastReason: reason,
      lastTransitionAt: nowIso(),
      blockedCount: base.blockedCount + 1,
      history: appendHistory(base, event, nextState, detail),
      safety: lockSafetyFields()
    };
  }

  if (event === 'provider.proxy.handshake.dry_run_ready') {
    if (isRealProviderKind(providerKind)) {
      return transitionProxyHandshakeSandbox(base, 'provider.proxy.handshake.blocked', { reason: 'real_provider_handshake_blocked_by_default' });
    }
    const nextState = 'dry_run_ready';
    return {
      ...base,
      previousState: base.state,
      state: nextState,
      handshakeMode: 'dry_run_only',
      lastEvent: event,
      lastReason: reason,
      lastTransitionAt: nowIso(),
      dryRunReadyCount: base.dryRunReadyCount + 1,
      history: appendHistory(base, event, nextState, detail),
      safety: lockSafetyFields()
    };
  }

  if (event === 'provider.proxy.handshake.dry_run_error') {
    const nextState = 'dry_run_error';
    return {
      ...base,
      previousState: base.state,
      state: nextState,
      handshakeMode: 'dry_run_only',
      lastEvent: event,
      lastReason: detail.error || reason,
      lastTransitionAt: nowIso(),
      dryRunErrorCount: base.dryRunErrorCount + 1,
      history: appendHistory(base, event, nextState, detail),
      safety: lockSafetyFields()
    };
  }

  if (event === 'provider.proxy.handshake.fallback') {
    const nextState = 'fallback_to_localdev_mock';
    return {
      ...base,
      previousState: base.state,
      state: nextState,
      handshakeMode: 'localdev_mock_fallback',
      lastEvent: event,
      lastReason: reason || 'fallback_to_localdev_mock',
      lastTransitionAt: nowIso(),
      fallbackCount: base.fallbackCount + 1,
      fallbackProviderId: 'localdev_mock',
      history: appendHistory(base, event, nextState, detail),
      safety: lockSafetyFields()
    };
  }

  return base;
}

export function requestProxyHandshakeSandbox(prev, { providerId, providerKind, token } = {}) {
  const seed = prev || createDefaultProxyHandshakeSandboxState({ providerId, providerKind });
  const resolvedKind = providerKind || seed.providerKind || safeProviderKind(seed.providerId);
  const base = { ...seed, providerId: providerId || seed.providerId, providerKind: resolvedKind };
  if (isRealProviderKind(resolvedKind)) {
    return transitionProxyHandshakeSandbox(base, 'provider.proxy.handshake.requested', {
      reason: 'real_provider_handshake_blocked_by_default'
    });
  }
  const requested = transitionProxyHandshakeSandbox(base, 'provider.proxy.handshake.requested', {
    reason: 'proxy_handshake_dry_run_requested'
  });
  if (!token) return requested;
  if (token.schema !== EPHEMERAL_SESSION_TOKEN_SCHEMA) {
    return transitionProxyHandshakeSandbox(requested, 'provider.proxy.handshake.dry_run_error', { error: 'token_schema_mismatch' });
  }
  const validation = validateEphemeralSessionToken(token);
  if (!validation.ok || !isTokenActive(token)) {
    return transitionProxyHandshakeSandbox(requested, 'provider.proxy.handshake.dry_run_error', { error: `token_invalid:${validation.failures?.join('|') || 'expired'}` });
  }
  return transitionProxyHandshakeSandbox(requested, 'provider.proxy.handshake.token_validated', {
    tokenId: token.tokenId,
    tokenKind: token.tokenKind
  });
}

export function runProxyHandshakeDryRun(prev, { providerId, providerKind, token } = {}) {
  let state = requestProxyHandshakeSandbox(prev, { providerId, providerKind, token });
  if (state.state === 'provider_handshake_blocked' || state.state === 'dry_run_error') return state;
  if (state.state !== 'token_validated') {
    return transitionProxyHandshakeSandbox(state, 'provider.proxy.handshake.dry_run_error', { error: 'token_required_for_dry_run' });
  }
  state = transitionProxyHandshakeSandbox(state, 'provider.proxy.handshake.dry_run_ready', { reason: 'dry_run_validated_locally' });
  return state;
}

export function summarizeProxyHandshakeSandbox(state) {
  if (!state) return 'proxy handshake sandbox 未初始化';
  const token = state.activeTokenId ? `token=${state.activeTokenKind}:${state.activeTokenId}` : 'token=none';
  return `${state.providerId}/${state.providerKind}: ${state.state} · dry_run_only=yes · real_handshake=no · billing=no · ${token} · fallback=${state.fallbackProviderId} · last=${state.lastEvent || 'none'}`;
}

export function getProxyHandshakeSandboxCapability() {
  return {
    proxyHandshakeSandboxAvailable: true,
    canRunDryRun: true,
    canOpenRealProviderHandshake: false,
    opensRealSocket: false,
    dryRunOnly: true,
    realMediaBlocked: true,
    canSendRealAudio: false,
    canSendRealCamera: false,
    canStartBillingSession: false,
    replyAudioFrameNative: true,
    replyTextSubtitleOnly: true,
    replyTextToTts: false,
    fallbackProviderId: 'localdev_mock'
  };
}
