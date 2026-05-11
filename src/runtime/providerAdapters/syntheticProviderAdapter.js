// providerAdapters/syntheticProviderAdapter.js
//
// v1.3.5 Synthetic-only Provider Adapter stub.
//
// This stub implements the Provider Adapter Contract surface without ever
// opening a real socket, uploading real media, or starting billing. It is
// used for contract testing and Runtime/UI exercise only. Any real
// microphone PCM or real camera JPEG frame is explicitly rejected; only
// frames marked `{ synthetic: true }` are accepted.

import { BUILTIN_PROVIDER_CAPABILITIES } from '../providerCapabilities.js';
import {
  createDefaultSocketSandboxState,
  transitionSocketSandbox,
  requestSocketSandbox,
  getSocketSandboxCapability,
  validateSocketSandboxToken,
  PROVIDER_SOCKET_SANDBOX_ACCEPTED_TOKEN_KINDS
} from '../providerSocketSandbox.js';

function nowMs() { return Date.now(); }
function nowIso() { return new Date().toISOString(); }

function randomId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function isSyntheticFrame(frame) {
  if (!frame || typeof frame !== 'object') return false;
  if (frame.synthetic === true) return true;
  if (frame.media && frame.media.synthetic === true) return true;
  if (frame.source && String(frame.source).startsWith('synthetic')) return true;
  return false;
}

function frameCarriesRealMediaPayload(frame) {
  if (!frame || typeof frame !== 'object') return false;
  const media = frame.media;
  if (!media) return false;
  return Boolean(media.payloadIncluded === true && (media.byteLength || 0) > 0);
}

export function createSyntheticProviderAdapter(options = {}) {
  const capability = BUILTIN_PROVIDER_CAPABILITIES.synthetic_test;
  const providerId = options.providerId || capability.providerId;
  const providerKind = capability.providerKind;

  const listeners = {
    outputState: new Set(),
    outputTurn: new Set(),
    replyAudioFrame: new Set(),
    error: new Set(),
    socketLifecycle: new Set(),
    ready: new Set(),
    fallback: new Set()
  };

  const stats = {
    sessionsOpened: 0,
    sessionsClosed: 0,
    inputPacketsAccepted: 0,
    inputPacketsRejected: 0,
    audioFramesAccepted: 0,
    audioFramesRejected: 0,
    cameraFramesAccepted: 0,
    cameraFramesRejected: 0,
    interruptsAccepted: 0,
    syntheticOutputStatesEmitted: 0,
    syntheticReplyAudioFramesEmitted: 0,
    syntheticOutputTurnsEmitted: 0,
    socketRequested: 0,
    socketOpened: 0,
    socketReady: 0,
    socketError: 0,
    socketClosed: 0,
    socketFallback: 0,
    errorsEmitted: 0
  };

  let activeSession = null;
  let socketSandbox = createDefaultSocketSandboxState({ providerId, providerKind });
  let acceptedToken = null;

  function broadcastSocketLifecycle(event, detail) {
    for (const cb of listeners.socketLifecycle) {
      try { cb({ event, detail, socketSandbox: { ...socketSandbox } }); } catch { /* ignore listener error */ }
    }
  }

  function emitError(reason, detail = null) {
    stats.errorsEmitted += 1;
    for (const cb of listeners.error) {
      try { cb({ schema: 'omni.provider_adapter_error.v1', reason, detail, at: nowMs() }); } catch { /* ignore listener error */ }
    }
  }

  function ensureSession() {
    if (!activeSession) {
      emitError('no_active_session', 'synthetic adapter requires createSession() before send*.');
      return null;
    }
    return activeSession;
  }

  function reject(kind, reason, frame) {
    if (kind === 'audio') stats.audioFramesRejected += 1;
    else if (kind === 'camera') stats.cameraFramesRejected += 1;
    else if (kind === 'input_packet') stats.inputPacketsRejected += 1;
    emitError(reason, { kind, frameId: frame?.frameId || frame?.packetId || null });
    return { ok: false, reason, sentToProvider: false };
  }

  return {
    schema: 'omni.provider_adapter.v1',
    providerId,
    providerKind,
    capabilities: { ...capability },
    canOpenRealtimeSocket: false,
    canSendRealAudio: false,
    canSendRealCamera: false,
    canStartBillingSession: false,
    replyTextToTts: false,
    fallbackProviderId: 'localdev_mock',
    safetyMode: 'synthetic_only',

    createSession({ correlation = null, robotId = null, displayName = null } = {}) {
      stats.sessionsOpened += 1;
      activeSession = {
        sessionId: correlation?.sessionId || randomId('synthetic_session'),
        robotId: robotId || correlation?.robotId || null,
        displayName: displayName || correlation?.displayName || null,
        openedAt: nowIso(),
        correlation,
        opensRealSocket: false,
        syntheticOnly: true
      };
      return { ok: true, session: { ...activeSession }, opensRealSocket: false, syntheticOnly: true };
    },

    closeSession(reason = 'manual_close') {
      if (!activeSession) return { ok: true, alreadyClosed: true };
      stats.sessionsClosed += 1;
      const closed = activeSession;
      activeSession = null;
      return { ok: true, sessionId: closed.sessionId, reason, closedAt: nowIso(), opensRealSocket: false, syntheticOnly: true };
    },

    // v1.3.6 explicit synthetic socket lifecycle. None of these open a real
    // provider socket. They drive the synthetic state machine only.
    createSyntheticSession({ correlation = null, robotId = null, displayName = null } = {}) {
      const result = this.createSession({ correlation, robotId, displayName });
      socketSandbox = requestSocketSandbox(socketSandbox, { providerId, providerKind });
      stats.socketRequested += 1;
      broadcastSocketLifecycle('provider.socket.requested', { providerId, providerKind, reason: 'synthetic_only_socket_sandbox_requested' });
      return { ...result, socketSandbox: { ...socketSandbox } };
    },

    openSyntheticSocket() {
      socketSandbox = transitionSocketSandbox(socketSandbox, 'provider.socket.synthetic_opening', { reason: 'synthetic_open_requested' });
      socketSandbox = transitionSocketSandbox(socketSandbox, 'provider.socket.synthetic_opened', { reason: 'synthetic_open_acknowledged' });
      stats.socketOpened += 1;
      broadcastSocketLifecycle('provider.socket.synthetic_opened', { providerId, providerKind, reason: 'synthetic_open_acknowledged' });
      return { ok: true, opensRealSocket: false, syntheticOnly: true, socketSandbox: { ...socketSandbox } };
    },

    // v1.3.7: token-gated synthetic open path. Accepts an ephemeral session
    // token descriptor produced by the proxy policy and only proceeds if the
    // token kind is `synthetic_only` and the token is currently valid.
    // Real providers remain blocked even with a synthetic token.
    acceptEphemeralToken(token) {
      const validation = validateSocketSandboxToken(socketSandbox, token);
      if (!validation.ok) {
        socketSandbox = {
          ...socketSandbox,
          tokenRejectedCount: socketSandbox.tokenRejectedCount + 1,
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
        emitError('ephemeral_token_rejected', { reason: validation.reason });
        return { ok: false, reason: validation.reason, opensRealSocket: false, syntheticOnly: true, socketSandbox: { ...socketSandbox } };
      }
      acceptedToken = token;
      socketSandbox = {
        ...socketSandbox,
        tokenAcceptedCount: socketSandbox.tokenAcceptedCount + 1,
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
      return { ok: true, opensRealSocket: false, syntheticOnly: true, tokenKind: token.tokenKind, tokenId: token.tokenId, socketSandbox: { ...socketSandbox } };
    },

    openSyntheticSocketWithToken(token) {
      const accepted = this.acceptEphemeralToken(token);
      if (!accepted.ok) return accepted;
      return this.openSyntheticSocket();
    },

    getActiveEphemeralToken() {
      return acceptedToken ? { ...acceptedToken } : null;
    },

    getAcceptedTokenKinds() {
      return [...PROVIDER_SOCKET_SANDBOX_ACCEPTED_TOKEN_KINDS];
    },

    closeSyntheticSocket(reason = 'synthetic_close_requested') {
      socketSandbox = transitionSocketSandbox(socketSandbox, 'provider.socket.synthetic_closed', { reason });
      stats.socketClosed += 1;
      acceptedToken = null;
      socketSandbox = { ...socketSandbox, activeTokenId: null, activeTokenKind: null };
      broadcastSocketLifecycle('provider.socket.synthetic_closed', { providerId, providerKind, reason });
      return { ok: true, opensRealSocket: false, syntheticOnly: true, socketSandbox: { ...socketSandbox } };
    },

    emitSyntheticReady(detail = {}) {
      socketSandbox = transitionSocketSandbox(socketSandbox, 'provider.socket.synthetic_ready', { reason: detail.reason || 'synthetic_ready' });
      stats.socketReady += 1;
      for (const cb of listeners.ready) {
        try { cb({ event: 'provider.socket.synthetic_ready', detail, socketSandbox: { ...socketSandbox } }); } catch { /* ignore listener error */ }
      }
      broadcastSocketLifecycle('provider.socket.synthetic_ready', { providerId, providerKind, ...detail });
      return { ok: true, opensRealSocket: false, syntheticOnly: true, socketSandbox: { ...socketSandbox } };
    },

    emitSyntheticError(error) {
      const reason = typeof error === 'string' ? error : (error?.message || 'synthetic_error');
      socketSandbox = transitionSocketSandbox(socketSandbox, 'provider.socket.synthetic_error', { error: reason, reason });
      stats.socketError += 1;
      for (const cb of listeners.error) {
        try { cb({ schema: 'omni.provider_adapter_error.v1', reason, kind: 'synthetic_socket_error', at: nowMs() }); } catch { /* ignore listener error */ }
      }
      broadcastSocketLifecycle('provider.socket.synthetic_error', { providerId, providerKind, reason });
      return { ok: true, opensRealSocket: false, syntheticOnly: true, socketSandbox: { ...socketSandbox } };
    },

    emitSyntheticFallback(reason = 'fallback_to_localdev_mock') {
      socketSandbox = transitionSocketSandbox(socketSandbox, 'provider.socket.fallback', { reason });
      stats.socketFallback += 1;
      for (const cb of listeners.fallback) {
        try { cb({ event: 'provider.socket.fallback', reason, fallbackProviderId: 'localdev_mock', socketSandbox: { ...socketSandbox } }); } catch { /* ignore listener error */ }
      }
      broadcastSocketLifecycle('provider.socket.fallback', { providerId, providerKind, reason, fallbackProviderId: 'localdev_mock' });
      return { ok: true, opensRealSocket: false, syntheticOnly: true, fallbackProviderId: 'localdev_mock', socketSandbox: { ...socketSandbox } };
    },

    getSocketSandboxState() {
      return { ...socketSandbox };
    },

    getSocketSandboxCapability() {
      return getSocketSandboxCapability();
    },

    sendInputPacket(packet) {
      if (!ensureSession()) return { ok: false, reason: 'no_active_session', sentToProvider: false };
      if (!packet || packet.schema !== 'omni.input_packet.v1') {
        return reject('input_packet', 'schema_must_be_omni_input_packet_v1', packet);
      }
      stats.inputPacketsAccepted += 1;
      return { ok: true, accepted: 'synthetic_only', sentToProvider: false, packetId: packet.packetId || null };
    },

    sendAudioFrame(frame) {
      if (!ensureSession()) return { ok: false, reason: 'no_active_session', sentToProvider: false };
      if (!frame || frame.schema !== 'omni.audio_frame.v1') {
        return reject('audio', 'schema_must_be_omni_audio_frame_v1', frame);
      }
      if (!isSyntheticFrame(frame)) {
        return reject('audio', 'real_audio_blocked_synthetic_only', frame);
      }
      if (frameCarriesRealMediaPayload(frame) && !isSyntheticFrame(frame)) {
        return reject('audio', 'real_audio_payload_blocked', frame);
      }
      stats.audioFramesAccepted += 1;
      return { ok: true, accepted: 'synthetic_only', sentToProvider: false, frameId: frame.frameId || null };
    },

    sendCameraFrame(frame) {
      if (!ensureSession()) return { ok: false, reason: 'no_active_session', sentToProvider: false };
      if (!frame || frame.schema !== 'omni.camera_frame.v1') {
        return reject('camera', 'schema_must_be_omni_camera_frame_v1', frame);
      }
      if (!isSyntheticFrame(frame)) {
        return reject('camera', 'real_camera_blocked_synthetic_only', frame);
      }
      if (frameCarriesRealMediaPayload(frame) && !isSyntheticFrame(frame)) {
        return reject('camera', 'real_camera_payload_blocked', frame);
      }
      stats.cameraFramesAccepted += 1;
      return { ok: true, accepted: 'synthetic_only', sentToProvider: false, frameId: frame.frameId || null };
    },

    sendInterrupt(interrupt) {
      if (!ensureSession()) return { ok: false, reason: 'no_active_session', sentToProvider: false };
      if (!interrupt || interrupt.schema !== 'omni.interrupt.v1') {
        emitError('interrupt_schema_invalid', interrupt);
        return { ok: false, reason: 'interrupt_schema_invalid', sentToProvider: false };
      }
      stats.interruptsAccepted += 1;
      return { ok: true, accepted: 'synthetic_only', sentToProvider: false, interruptId: interrupt.interruptId || null };
    },

    onOutputState(listener) {
      if (typeof listener !== 'function') return () => {};
      listeners.outputState.add(listener);
      return () => listeners.outputState.delete(listener);
    },
    onOutputTurn(listener) {
      if (typeof listener !== 'function') return () => {};
      listeners.outputTurn.add(listener);
      return () => listeners.outputTurn.delete(listener);
    },
    onReplyAudioFrame(listener) {
      if (typeof listener !== 'function') return () => {};
      listeners.replyAudioFrame.add(listener);
      return () => listeners.replyAudioFrame.delete(listener);
    },
    onError(listener) {
      if (typeof listener !== 'function') return () => {};
      listeners.error.add(listener);
      return () => listeners.error.delete(listener);
    },
    onSocketLifecycle(listener) {
      if (typeof listener !== 'function') return () => {};
      listeners.socketLifecycle.add(listener);
      return () => listeners.socketLifecycle.delete(listener);
    },
    onReady(listener) {
      if (typeof listener !== 'function') return () => {};
      listeners.ready.add(listener);
      return () => listeners.ready.delete(listener);
    },
    onFallback(listener) {
      if (typeof listener !== 'function') return () => {};
      listeners.fallback.add(listener);
      return () => listeners.fallback.delete(listener);
    },

    // Synthetic-only emitters: tests can drive deterministic state/turn/reply
    // audio frames without any provider traffic. None of these signal real
    // playback or real model output.
    emitSyntheticOutputState(message) {
      if (!message || message.schema !== 'omni.output_state.v1') return { ok: false, reason: 'schema_must_be_omni_output_state_v1' };
      stats.syntheticOutputStatesEmitted += 1;
      for (const cb of listeners.outputState) {
        try { cb(message); } catch { /* ignore listener error */ }
      }
      return { ok: true };
    },
    emitSyntheticReplyAudioFrame(frame) {
      if (!frame || frame.schema !== 'omni.reply_audio_frame.v1') return { ok: false, reason: 'schema_must_be_omni_reply_audio_frame_v1' };
      stats.syntheticReplyAudioFramesEmitted += 1;
      for (const cb of listeners.replyAudioFrame) {
        try { cb(frame); } catch { /* ignore listener error */ }
      }
      return { ok: true };
    },
    emitSyntheticOutputTurn(turn) {
      if (!turn || turn.schema !== 'omni.output_turn.v1') return { ok: false, reason: 'schema_must_be_omni_output_turn_v1' };
      stats.syntheticOutputTurnsEmitted += 1;
      for (const cb of listeners.outputTurn) {
        try { cb(turn); } catch { /* ignore listener error */ }
      }
      return { ok: true };
    },

    getStats() { return { ...stats }; },
    getActiveSession() { return activeSession ? { ...activeSession } : null; }
  };
}
