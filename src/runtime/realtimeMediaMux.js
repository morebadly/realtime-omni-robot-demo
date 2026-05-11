// realtimeMediaMux.js
//
// v1.3.4 Realtime Mux / Backpressure / Session Correlation Guard.
//
// This module is a pure Runtime helper. It does not own a transport, does not
// open real provider sockets, does not upload media, and does not start
// realtime billing. It computes a send/drop/coalesce decision for outbound
// realtime envelopes so that:
//
// - `omni.interrupt.v1` is the highest priority and never blocked by media.
// - `omni.audio_frame.v1` is protected: even under backpressure it is sent
//   best-effort and is not held behind a media_ack queue.
// - `omni.camera_frame.v1` drops old frames and keeps the latest keyframe
//   under elevated WebSocket bufferedAmount.
// - `omni.input_packet.v1` can be coalesced/replaced as a low-frequency
//   context update.
// - `media_ack` remains diagnostics only and never becomes a per-frame gate.
//
// The mux is consumed by `useRuntimeCore` (browser side) and verified by
// `scripts/realtime-mux-backpressure-smoke.mjs` (Node side).

import { priorityForSchema, REALTIME_PRIORITY, REALTIME_PRIORITY_ORDER } from './realtimeSessionCorrelation.js';

export const REALTIME_MUX_PROTOCOL = 'omni.realtime_mux.v1';

export const DEFAULT_MUX_THRESHOLDS = {
  warnBytes: 256 * 1024,
  highBytes: 1024 * 1024,
  overflowBytes: 4 * 1024 * 1024
};

export const MUX_DECISIONS = ['send', 'drop_old', 'coalesce', 'defer'];

export function classifyBufferedAmount(amount = 0, thresholds = DEFAULT_MUX_THRESHOLDS) {
  const value = Number(amount) || 0;
  if (value >= (thresholds.overflowBytes || DEFAULT_MUX_THRESHOLDS.overflowBytes)) return 'overflow';
  if (value >= (thresholds.highBytes || DEFAULT_MUX_THRESHOLDS.highBytes)) return 'high';
  if (value >= (thresholds.warnBytes || DEFAULT_MUX_THRESHOLDS.warnBytes)) return 'elevated';
  return 'normal';
}

export function priorityForFrame(frame) {
  if (!frame) return REALTIME_PRIORITY.LOW;
  if (frame.priority && REALTIME_PRIORITY_ORDER.includes(frame.priority)) return frame.priority;
  return priorityForSchema(frame.schema);
}

export function decideMuxAction({ priority, bufferedLevel, kind = null } = {}) {
  const level = bufferedLevel || 'normal';
  if (priority === REALTIME_PRIORITY.HIGHEST) {
    return { action: 'send', reason: 'interrupt_bypass_priority' };
  }
  if (priority === REALTIME_PRIORITY.HIGH) {
    return { action: 'send', reason: 'session_control_bypass_priority' };
  }
  if (priority === REALTIME_PRIORITY.REALTIME) {
    if (level === 'overflow') {
      return { action: 'send', reason: 'audio_best_effort_under_overflow' };
    }
    return { action: 'send', reason: 'audio_protected' };
  }
  if (priority === REALTIME_PRIORITY.MEDIUM) {
    if (level === 'normal') return { action: 'send', reason: 'camera_normal' };
    if (level === 'elevated') return { action: 'drop_old', reason: 'camera_drop_old_on_elevated_buffer' };
    if (level === 'high') return { action: 'drop_old', reason: 'camera_drop_old_on_high_buffer' };
    return { action: 'drop_old', reason: 'camera_drop_old_on_overflow' };
  }
  if (priority === REALTIME_PRIORITY.LOW) {
    if (level === 'normal') return { action: 'send', reason: 'context_normal' };
    return { action: 'coalesce', reason: 'context_coalesce_on_backpressure' };
  }
  return { action: 'send', reason: 'default_send' };
}

function emptyCounts() {
  return { highest: 0, high: 0, realtime: 0, medium: 0, low: 0 };
}

export function createDefaultMuxState() {
  return {
    protocol: REALTIME_MUX_PROTOCOL,
    bufferedAmount: 0,
    bufferedLevel: 'normal',
    thresholds: { ...DEFAULT_MUX_THRESHOLDS },
    lastDecision: null,
    lastEnqueueAt: null,
    counts: {
      enqueued: emptyCounts(),
      sent: emptyCounts(),
      dropped: emptyCounts(),
      coalesced: emptyCounts(),
      deferred: emptyCounts()
    },
    dropReasons: [],
    coalescedPending: {
      camera: null,
      input_packet: null
    },
    guardrails: {
      mediaAckIsDiagnosticsOnly: true,
      interruptHighestPriority: true,
      audioHigherThanCamera: true,
      cameraKeepLatestOnBackpressure: true,
      inputPacketCanCoalesce: true,
      replyTextNotTts: true,
      localdevMockFallbackRequired: true,
      noRealAudioUpload: true,
      noRealCameraUpload: true,
      noRealtimeBilling: true,
      noRealProviderSocket: true
    }
  };
}

function bumpCount(counts, bucket, priority) {
  const slot = counts[bucket] || emptyCounts();
  return {
    ...counts,
    [bucket]: { ...slot, [priority]: (slot[priority] || 0) + 1 }
  };
}

export function applyMuxDecision(state, event = {}) {
  const base = state || createDefaultMuxState();
  const priority = event.priority || REALTIME_PRIORITY.LOW;
  const decision = event.decision || 'send';
  const bufferedAmount = Number(event.bufferedAmount || 0);
  const bufferedLevel = classifyBufferedAmount(bufferedAmount, base.thresholds);
  const enqueuedCounts = bumpCount(base.counts, 'enqueued', priority);
  const bucket = decision === 'drop_old'
    ? 'dropped'
    : decision === 'coalesce'
      ? 'coalesced'
      : decision === 'defer'
        ? 'deferred'
        : 'sent';
  const counts = bumpCount(enqueuedCounts, bucket, priority);
  const dropReasons = (decision === 'drop_old' || decision === 'coalesce' || decision === 'defer')
    ? [{
        schema: event.schema || null,
        frameId: event.frameId || null,
        decision,
        priority,
        reason: event.reason || decision,
        at: Date.now()
      }, ...(base.dropReasons || [])].slice(0, 12)
    : base.dropReasons;

  const coalescedPending = { ...(base.coalescedPending || { camera: null, input_packet: null }) };
  if (decision === 'coalesce' && event.schema === 'omni.input_packet.v1') {
    coalescedPending.input_packet = { frameId: event.frameId, at: Date.now(), reason: event.reason };
  }
  if (decision === 'drop_old' && event.schema === 'omni.camera_frame.v1') {
    coalescedPending.camera = { frameId: event.frameId, at: Date.now(), reason: event.reason };
  }
  if (decision === 'send' && event.schema === 'omni.input_packet.v1') {
    coalescedPending.input_packet = null;
  }
  if (decision === 'send' && event.schema === 'omni.camera_frame.v1') {
    coalescedPending.camera = null;
  }

  return {
    ...base,
    bufferedAmount,
    bufferedLevel,
    counts,
    dropReasons,
    coalescedPending,
    lastDecision: {
      priority,
      decision,
      reason: event.reason || decision,
      schema: event.schema || null,
      frameId: event.frameId || null,
      bufferedLevel,
      bufferedAmount,
      at: Date.now()
    },
    lastEnqueueAt: Date.now()
  };
}

export function getMuxCapability(state) {
  const base = state || createDefaultMuxState();
  return {
    audioProtected: true,
    cameraKeepsLatest: true,
    interruptHighestPriority: true,
    inputPacketCoalesces: true,
    mediaAckDiagnosticsOnly: true,
    bufferedLevel: base.bufferedLevel || 'normal',
    canSendRealAudio: false,
    canSendRealCamera: false,
    canStartRealtime: false,
    canStartBillingSession: false,
    canOpenRealProviderSocket: false,
    replyTextToTts: false,
    fallbackProviderId: 'localdev_mock'
  };
}

export function summarizeMuxState(state) {
  const base = state || createDefaultMuxState();
  const counts = base.counts || {};
  const sent = counts.sent || emptyCounts();
  const dropped = counts.dropped || emptyCounts();
  const coalesced = counts.coalesced || emptyCounts();
  const totalSent = Object.values(sent).reduce((acc, value) => acc + value, 0);
  const totalDropped = Object.values(dropped).reduce((acc, value) => acc + value, 0);
  const totalCoalesced = Object.values(coalesced).reduce((acc, value) => acc + value, 0);
  return `${base.bufferedLevel || 'normal'} · sent ${totalSent} · dropped ${totalDropped} · coalesced ${totalCoalesced} · buffered ${base.bufferedAmount || 0}B`;
}

export function describeMuxDecision(decision) {
  if (!decision) return '尚未做出 mux 决策';
  return `${decision.priority || 'unknown'} · ${decision.decision || 'unknown'} · ${decision.reason || '-'} · ${decision.schema || 'unknown'}`;
}
