#!/usr/bin/env node
import { buildRealtimeReadiness } from '../src/runtime/realtimeReadiness.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const baseRobot = {
  mode: 'local_dev',
  online: true,
  adapter: 'LocalDevOmniAdapter',
  adapterDetail: { endpoint: 'ws://127.0.0.1:8000/omni/realtime' },
  network: 'Wi-Fi / Local Dev'
};

const baseRoute = {
  canStream: true,
  label: 'LocalDevOmniAdapter',
  route: 'local_dev_omni',
  detail: 'Raw audio stream enters LocalDev Adapter.'
};

const baseConnection = { status: 'connected', label: 'Local Dev', latencyMs: 12 };

function build(overrides = {}) {
  return buildRealtimeReadiness({
    robot: baseRobot,
    connection: baseConnection,
    route: baseRoute,
    realtimeSession: { active: false, micActive: false },
    realtimeSessionState: { state: 'idle', label: 'idle' },
    localDevPreflight: { status: 'pending' },
    localDevBridge: { status: 'idle', endpoint: baseRobot.adapterDetail.endpoint },
    mediaChannels: {
      audio: { observed: 0, sent: 0 },
      camera: { observed: 0, sent: 0 },
      localDev: { ackCount: 0, audioAckCount: 0, cameraAckCount: 0 }
    },
    realtimeOutput: { receivedAudioFrames: 0, playedAudioFrames: 0 },
    ...overrides
  });
}

const blocked = build();
assert(blocked.checklist.tone === 'danger', `expected blocked checklist, got ${blocked.checklist.tone}`);
assert(blocked.nextAction.kind === 'test_adapter', `expected test_adapter action, got ${blocked.nextAction.kind}`);
assert(blocked.nextAction.title === '先测试 LocalDev Adapter', `unexpected blocked title: ${blocked.nextAction.title}`);

const readyForMic = build({
  localDevPreflight: { status: 'connected' },
  localDevBridge: { status: 'connected', endpoint: baseRobot.adapterDetail.endpoint }
});
assert(readyForMic.checklist.tone === 'warning', `expected warning checklist, got ${readyForMic.checklist.tone}`);
assert(readyForMic.nextAction.kind === 'open_audio_panel', `expected open_audio_panel action, got ${readyForMic.nextAction.kind}`);
assert(readyForMic.nextAction.title === '开启实时音频', `unexpected ready title: ${readyForMic.nextAction.title}`);

const ackLagging = build({
  localDevPreflight: { status: 'connected' },
  localDevBridge: { status: 'connected', endpoint: baseRobot.adapterDetail.endpoint },
  realtimeSession: { active: true, micActive: true },
  mediaChannels: {
    audio: { observed: 3, sent: 3 },
    camera: { observed: 1, sent: 1 },
    localDev: { ackCount: 0, audioAckCount: 0, cameraAckCount: 0 }
  }
});
assert(ackLagging.media.hasSentButNoAck === true, 'expected hasSentButNoAck=true');
assert(ackLagging.nextAction.kind === 'ack_lagging', `expected ack_lagging action, got ${ackLagging.nextAction.kind}`);
assert(!/等待/.test(ackLagging.nextAction.title), 'ack lagging title should not imply blocking wait');
assert(ackLagging.nextAction.detail.includes('不会阻塞实时通话'), 'ack lagging detail should state non-blocking behavior');

console.log('Realtime readiness smoke passed.');
