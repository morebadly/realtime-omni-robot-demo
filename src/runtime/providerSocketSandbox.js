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

export const PROVIDER_SOCKET_SANDBOX_PROTOCOL = 'omni.provider_socket_sandbox.v1';

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
      apiKeyMustNotEnterFrontend: true
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
  return `${state.providerId}/${state.providerKind}: ${state.state} · real=no · synthetic_only=yes · billing=no · fallback=${state.fallbackProviderId} · last=${state.lastEvent || 'none'}`;
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
    fallbackProviderId: 'localdev_mock'
  };
}
