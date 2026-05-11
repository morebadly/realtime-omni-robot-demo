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
    error: new Set()
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
    errorsEmitted: 0
  };

  let activeSession = null;

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
        correlation
      };
      return { ok: true, session: { ...activeSession }, opensRealSocket: false };
    },

    closeSession(reason = 'manual_close') {
      if (!activeSession) return { ok: true, alreadyClosed: true };
      stats.sessionsClosed += 1;
      const closed = activeSession;
      activeSession = null;
      return { ok: true, sessionId: closed.sessionId, reason, closedAt: nowIso() };
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
