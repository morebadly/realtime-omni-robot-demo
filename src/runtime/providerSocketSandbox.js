// providerSocketSandbox.js
//
// v1.3.6 Real Socket Sandbox / Synthetic-only Provider Session.
//
// This module is a pure state machine for "how a real provider socket would
// be opened safely later". It does NOT open a real WebSocket. It does NOT
// upload real microphone PCM or real camera JPEG. It does NOT start
// realtime billing. It does NOT instantiate any provider client.
//
// All results are hard-locked:
//   opensRealSocket   = false
//   sentToProvider    = false
//   uploaded          = false
//   persisted         = false
//   billingStarted    = false
//   syntheticOnly     = true   (when in any synthetic state)
//
// Realtime call semantics in this project remain:
//   user audio / camera / context -> Provider -> omni.output_state.v1
//                                            -> omni.reply_audio_frame.v1
//                                            -> omni.output_turn.v1
// `reply_audio_frame` is the realtime voice output. `reply_text` is subtitles
// / log / debug / Visible Context only. `reply_text` is NEVER a TTS input.

import { getProviderCapability } from './providerCapabilities.js';
import {
  isTokenActive,
  validateEphemeralSessionToken,
  EPHEMERAL_SESSION_TOKEN_SCHEMA
} from './providerEphemeralSession.js';

export const PROVIDER_SOCKET_SANDBOX_PROTOCOL = 'omni.provider_socket_sandbox.v1';

export const PROVIDER_SOCKET_SANDBOX_ACCEPTED_TOKEN_KINDS = ['synthetic_only'];

export const PROVIDER_SOCKET_SANDBOX_STATES = [
  'idle',
  'requested',
  'blocked',
  'synthetic_opening',
  'synthetic_open',
  'synthetic_ready',
  'synthetic_error',
  'synthetic_closed',
  'fallback_to_localdev_mock'
];

export const PROVIDER_SOCKET_SANDBOX_EVENTS = [
  'provider.socket.requested',
  'provider.socket.blocked',
  'provider.socket.synthetic_opening',
  'provider.socket.synthetic_opened',
  'provider.socket.synthetic_ready',
  'provider.socket.synthetic_error',
  'provider.socket.synthetic_closed',
  'provider.socket.fallback'
];

const MAX_HISTORY = 16;

function now() {
  return Date.now();
}

function nowIso() {
  return new Date().toISOString();
}

function safeProviderKind(providerId) {
  const cap = getProviderCapability(providerId);
  return cap?.providerKind || 'unknown';
}

function lockSafetyFields() {
  return {
    opensRealSocket: false,
    sentToProvider: false,
    uploaded: false,
    persisted: false,
    billingStarted: false,
    syntheticOnly: true,
    realMediaBlocked: true,
    replyAudioFrameNative: true,
    replyTextSubtitleOnly: true,
    replyTextToTts: false
  };
}

export function createDefaultSocketSandboxState({ providerId = 'localdev_mock', providerKind = null } = {}) {
  return {
    protocol: PROVIDER_SOCKET_SANDBOX_PROTOCOL,
    providerId,
    providerKind: providerKind || safeProviderKind(providerId),
    state: 'idle',
    previousState: null,
    socketMode: 'idle',
    lastEvent: null,
    lastReason: null,
    lastTransitionAt: null,
    requestedCount: 0,
    blockedCount: 0,
    openedCount: 0,
    readyCount: 0,
    errorCount: 0,
    closedCount: 0,
    fallbackCount: 0,
    history: [],
    fallbackProviderId: 'localdev_mock',
    // v1.3.7: token-gating fields.
    requiresEphemeralToken: true,
    acceptedTokenKinds: [...PROVIDER_SOCKET_SANDBOX_ACCEPTED_TOKEN_KINDS],
    activeTokenId: null,
    activeTokenKind: null,
    tokenAcceptedCount: 0,
    tokenRejectedCount: 0,
    lastTokenDecision: null,
    safety: lockSafetyFields(),
    guardrails: {
      realProviderSocketBlockedByDefault: true,
      noRealAudioUpload: true,
      noRealCameraUpload: true,
      noRealtimeBilling: true,
      replyAudioFrameIsRealtimeVoiceOutput: true,
      replyTextNotTtsInput: true,
      asrLlmTtsRegressionForbidden: true,
      localdevMockFallbackRequired: true,
      apiKeyMustNotEnterFrontend: true,
      ephemeralTokenRequired: true,
      ephemeralTokenSyntheticOnly: true
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
    syntheticOnly: true,
    opensRealSocket: false
  };
  return [item, ...(prev?.history || [])].slice(0, MAX_HISTORY);
}

function isRealProviderKind(kind) {
  return kind === 'real_cloud' || kind === 'self_hosted';
}

export function transitionSocketSandbox(prev, event, detail = {}) {
  const base = prev || createDefaultSocketSandboxState();
  const providerKind = base.providerKind || safeProviderKind(base.providerId);
  const reason = detail.reason || event;

  // Real provider IDs cannot leave 'blocked' regardless of which event we
  // receive. The sandbox is synthetic-only by design in v1.3.6.
  if (event === 'provider.socket.requested') {
    if (isRealProviderKind(providerKind)) {
      const nextState = 'blocked';
      return {
        ...base,
        previousState: base.state,
        state: nextState,
        socketMode: 'blocked',
        lastEvent: 'provider.socket.blocked',
        lastReason: 'real_provider_socket_blocked_by_default',
        lastTransitionAt: nowIso(),
        requestedCount: base.requestedCount + 1,
        blockedCount: base.blockedCount + 1,
        history: appendHistory(base, 'provider.socket.blocked', nextState, { reason: 'real_provider_socket_blocked_by_default' }),
        safety: lockSafetyFields()
      };
    }
    // synthetic / localdev_mock / offline_pet_engine can transition to opening
    const nextState = 'requested';
    return {
      ...base,
      previousState: base.state,
      state: nextState,
      socketMode: 'synthetic_only',
      lastEvent: event,
      lastReason: reason,
      lastTransitionAt: nowIso(),
      requestedCount: base.requestedCount + 1,
      history: appendHistory(base, event, nextState, detail),
      safety: lockSafetyFields()
    };
  }

  if (event === 'provider.socket.blocked') {
    const nextState = 'blocked';
    return {
      ...base,
      previousState: base.state,
      state: nextState,
      socketMode: 'blocked',
      lastEvent: event,
      lastReason: reason,
      lastTransitionAt: nowIso(),
      blockedCount: base.blockedCount + 1,
      history: appendHistory(base, event, nextState, detail),
      safety: lockSafetyFields()
    };
  }

  if (event === 'provider.socket.synthetic_opening') {
    if (isRealProviderKind(providerKind)) {
      // Real provider cannot open a synthetic socket pretending to be real.
      return transitionSocketSandbox(base, 'provider.socket.blocked', { reason: 'real_provider_socket_blocked_by_default' });
    }
    const nextState = 'synthetic_opening';
    return {
      ...base,
      previousState: base.state,
      state: nextState,
      socketMode: 'synthetic_only',
      lastEvent: event,
      lastReason: reason,
      lastTransitionAt: nowIso(),
      history: appendHistory(base, event, nextState, detail),
      safety: lockSafetyFields()
    };
  }

  if (event === 'provider.socket.synthetic_opened') {
    if (isRealProviderKind(providerKind)) {
      return transitionSocketSandbox(base, 'provider.socket.blocked', { reason: 'real_provider_socket_blocked_by_default' });
    }
    const nextState = 'synthetic_open';
    return {
      ...base,
      previousState: base.state,
      state: nextState,
      socketMode: 'synthetic_only',
      lastEvent: event,
      lastReason: reason,
      lastTransitionAt: nowIso(),
      openedCount: base.openedCount + 1,
      history: appendHistory(base, event, nextState, detail),
      safety: lockSafetyFields()
    };
  }

  if (event === 'provider.socket.synthetic_ready') {
    if (isRealProviderKind(providerKind)) {
      return transitionSocketSandbox(base, 'provider.socket.blocked', { reason: 'real_provider_socket_blocked_by_default' });
    }
    const nextState = 'synthetic_ready';
    return {
      ...base,
      previousState: base.state,
      state: nextState,
      socketMode: 'synthetic_only',
      lastEvent: event,
      lastReason: reason,
      lastTransitionAt: nowIso(),
      readyCount: base.readyCount + 1,
      history: appendHistory(base, event, nextState, detail),
      safety: lockSafetyFields()
    };
  }

  if (event === 'provider.socket.synthetic_error') {
    const nextState = 'synthetic_error';
    return {
      ...base,
      previousState: base.state,
      state: nextState,
      socketMode: 'synthetic_only',
      lastEvent: event,
      lastReason: detail.error || reason,
      lastTransitionAt: nowIso(),
      errorCount: base.errorCount + 1,
      history: appendHistory(base, event, nextState, detail),
      safety: lockSafetyFields()
    };
  }

  if (event === 'provider.socket.synthetic_closed') {
    const nextState = 'synthetic_closed';
    return {
      ...base,
      previousState: base.state,
      state: nextState,
      socketMode: 'closed',
      lastEvent: event,
      lastReason: reason,
      lastTransitionAt: nowIso(),
      closedCount: base.closedCount + 1,
      history: appendHistory(base, event, nextState, detail),
      safety: lockSafetyFields()
    };
  }

  if (event === 'provider.socket.fallback') {
    const nextState = 'fallback_to_localdev_mock';
    return {
      ...base,
      previousState: base.state,
      state: nextState,
      socketMode: 'localdev_mock_fallback',
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

export function requestSocketSandbox(prev, { providerId, providerKind } = {}) {
  const seed = prev || createDefaultSocketSandboxState({ providerId, providerKind });
  const resolvedKind = providerKind || seed.providerKind || safeProviderKind(seed.providerId);
  if (isRealProviderKind(resolvedKind)) {
    return transitionSocketSandbox({ ...seed, providerId: providerId || seed.providerId, providerKind: resolvedKind }, 'provider.socket.requested', {
      reason: 'real_provider_socket_blocked_by_default'
    });
  }
  return transitionSocketSandbox({ ...seed, providerId: providerId || seed.providerId, providerKind: resolvedKind }, 'provider.socket.requested', {
    reason: 'synthetic_only_socket_sandbox_requested'
  });
}

export function runSyntheticSocketSession(prev, { providerId, providerKind } = {}) {
  // Helper used by tests/UI to drive a full safe synthetic lifecycle in one
  // call. It never opens a real socket.
  let state = requestSocketSandbox(prev, { providerId, providerKind });
  if (state.state === 'blocked') return state;
  state = transitionSocketSandbox(state, 'provider.socket.synthetic_opening', { reason: 'synthetic_open_requested' });
  state = transitionSocketSandbox(state, 'provider.socket.synthetic_opened', { reason: 'synthetic_open_acknowledged' });
  state = transitionSocketSandbox(state, 'provider.socket.synthetic_ready', { reason: 'synthetic_ready' });
  state = transitionSocketSandbox(state, 'provider.socket.synthetic_closed', { reason: 'synthetic_close_requested' });
  return state;
}

export function summarizeSocketSandbox(state) {
  if (!state) return 'socket sandbox 未初始化';
  const token = state.activeTokenId ? `token=${state.activeTokenKind}:${state.activeTokenId}` : 'token=none';
  return `${state.providerId}/${state.providerKind}: ${state.state} · real=no · synthetic_only=yes · billing=no · ${token} · fallback=${state.fallbackProviderId} · last=${state.lastEvent || 'none'}`;
}

export function getSocketSandboxCapability() {
  return {
    socketSandboxAvailable: true,
    canOpenSyntheticSocket: true,
    canOpenRealtimeSocket: false,
    opensRealSocket: false,
    syntheticOnly: true,
    realMediaBlocked: true,
    canSendRealAudio: false,
    canSendRealCamera: false,
    canStartBillingSession: false,
    replyAudioFrameNative: true,
    replyTextSubtitleOnly: true,
    replyTextToTts: false,
    fallbackProviderId: 'localdev_mock',
    requiresEphemeralToken: true,
    acceptedTokenKinds: [...PROVIDER_SOCKET_SANDBOX_ACCEPTED_TOKEN_KINDS]
  };
}

function tokenMatchesProvider(token, providerId) {
  if (!token) return false;
  if (!token.providerId) return true;
  return token.providerId === providerId;
}

function acceptedTokenKind(token) {
  if (!token) return false;
  return PROVIDER_SOCKET_SANDBOX_ACCEPTED_TOKEN_KINDS.includes(token.tokenKind);
}

// v1.3.7: validate an ephemeral token against the socket sandbox without
// performing any side effect. Returns { ok, reason }.
export function validateSocketSandboxToken(state, token, nowMs = Date.now()) {
  const base = state || createDefaultSocketSandboxState();
  if (isRealProviderKind(base.providerKind)) {
    return { ok: false, reason: 'real_provider_socket_blocked_by_default' };
  }
  if (!token) {
    return { ok: false, reason: 'ephemeral_token_required' };
  }
  if (token.schema !== EPHEMERAL_SESSION_TOKEN_SCHEMA) {
    return { ok: false, reason: 'token_schema_mismatch' };
  }
  if (!acceptedTokenKind(token)) {
    return { ok: false, reason: `token_kind_not_accepted:${token.tokenKind || 'unknown'}` };
  }
  if (!tokenMatchesProvider(token, base.providerId)) {
    return { ok: false, reason: 'token_provider_mismatch' };
  }
  const result = validateEphemeralSessionToken(token, nowMs);
  if (!result.ok) {
    return { ok: false, reason: `token_invalid:${result.failures.join('|')}` };
  }
  if (!isTokenActive(token, nowMs)) {
    return { ok: false, reason: 'token_expired' };
  }
  return { ok: true, reason: 'token_accepted' };
}

// v1.3.7: drive a full safe synthetic lifecycle, but only if a valid
// ephemeral synthetic_only token descriptor is provided. Real providers
// remain blocked even with a token.
export function runSyntheticSocketSessionWithToken(prev, token, { providerId, providerKind } = {}) {
  const seed = prev || createDefaultSocketSandboxState({ providerId, providerKind });
  const resolvedProviderId = providerId || seed.providerId;
  const resolvedKind = providerKind || seed.providerKind || safeProviderKind(resolvedProviderId);
  const base = {
    ...seed,
    providerId: resolvedProviderId,
    providerKind: resolvedKind,
    requiresEphemeralToken: true,
    acceptedTokenKinds: [...PROVIDER_SOCKET_SANDBOX_ACCEPTED_TOKEN_KINDS]
  };

  if (isRealProviderKind(resolvedKind)) {
    const blocked = transitionSocketSandbox(base, 'provider.socket.requested', {
      reason: 'real_provider_socket_blocked_by_default'
    });
    return {
      ...blocked,
      tokenRejectedCount: blocked.tokenRejectedCount + 1,
      lastTokenDecision: {
        accepted: false,
        reason: 'real_provider_socket_blocked_by_default',
        tokenKind: token?.tokenKind || null,
        tokenId: token?.tokenId || null,
        at: nowIso()
      },
      activeTokenId: null,
      activeTokenKind: null
    };
  }

  const validation = validateSocketSandboxToken(base, token);
  if (!validation.ok) {
    const requested = transitionSocketSandbox(base, 'provider.socket.requested', {
      reason: validation.reason
    });
    return {
      ...requested,
      tokenRejectedCount: requested.tokenRejectedCount + 1,
      activeTokenId: null,
      activeTokenKind: null,
      lastTokenDecision: {
        accepted: false,
        reason: validation.reason,
        tokenKind: token?.tokenKind || null,
        tokenId: token?.tokenId || null,
        at: nowIso()
      }
    };
  }

  const accepted = {
    ...base,
    tokenAcceptedCount: base.tokenAcceptedCount + 1,
    activeTokenId: token.tokenId,
    activeTokenKind: token.tokenKind,
    lastTokenDecision: {
      accepted: true,
      reason: 'token_accepted',
      tokenKind: token.tokenKind,
      tokenId: token.tokenId,
      at: nowIso()
    }
  };

  let state = transitionSocketSandbox(accepted, 'provider.socket.requested', {
    reason: 'synthetic_only_socket_sandbox_requested_with_token'
  });
  if (state.state === 'blocked') return state;
  state = transitionSocketSandbox(state, 'provider.socket.synthetic_opening', { reason: 'synthetic_open_requested_with_token' });
  state = transitionSocketSandbox(state, 'provider.socket.synthetic_opened', { reason: 'synthetic_open_acknowledged_with_token' });
  state = transitionSocketSandbox(state, 'provider.socket.synthetic_ready', { reason: 'synthetic_ready_with_token' });
  state = transitionSocketSandbox(state, 'provider.socket.synthetic_closed', { reason: 'synthetic_close_requested_with_token' });
  return {
    ...state,
    activeTokenId: token.tokenId,
    activeTokenKind: token.tokenKind,
    lastTokenDecision: {
      accepted: true,
      reason: 'token_accepted_lifecycle_completed',
      tokenKind: token.tokenKind,
      tokenId: token.tokenId,
      at: nowIso()
    }
  };
}
