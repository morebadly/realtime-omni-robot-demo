#!/usr/bin/env node
import { buildRealtimeReadiness } from '../src/runtime/realtimeReadiness.js';
import { buildRobotConnectionStatusViewModel } from '../src/runtime/connectionStatusViewModel.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const robot = {
  id: 'robot_demo_001',
  name: 'DemoBot 01',
  mode: 'local_dev',
  network: 'Wi-Fi / Local Dev',
  online: true,
  adapter: 'LocalDevOmniAdapter',
  adapterDetail: { endpoint: 'ws://127.0.0.1:8000/omni/realtime' }
};

const connection = { status: 'connected', label: 'Wi-Fi / Local Dev', latencyMs: 18, packetLoss: 0, signal: 100 };
const route = { canStream: true, label: 'LocalDevOmniAdapter', route: 'local_dev_omni' };
const realtimeSession = { active: true, micActive: true, sampleRate: 48000, level: 0.18 };
const realtimeSessionState = { state: 'listening', label: '正在听' };
const localDevPreflight = { status: 'connected', checkedAt: '10:30:16' };
const localDevBridge = { status: 'connected', endpoint: robot.adapterDetail.endpoint, updatedAt: '10:30:18' };
const mediaChannels = {
  audio: { observed: 4, sent: 4 },
  camera: { observed: 1, sent: 1 },
  localDev: { ackCount: 0, audioAckCount: 0, cameraAckCount: 0 }
};
const realtimeOutput = { receivedAudioFrames: 0, playedAudioFrames: 0, playbackActive: false };

const readiness = buildRealtimeReadiness({
  robot,
  connection,
  route,
  realtimeSession,
  realtimeSessionState,
  localDevPreflight,
  localDevBridge,
  mediaChannels,
  realtimeOutput
});

const viewModel = buildRobotConnectionStatusViewModel({
  robot,
  connection,
  route,
  realtimeSession,
  realtimeSessionState,
  localDevPreflight,
  localDevBridge,
  realtimeOutput,
  readiness
});

assert(viewModel.statusLabel === '连接正常', `unexpected status label: ${viewModel.statusLabel}`);
assert(viewModel.modeOptions.length === 5, `unexpected mode option count: ${viewModel.modeOptions.length}`);
assert(viewModel.adapterTestButton.label === '测试 LocalDev Adapter', `unexpected adapter button: ${viewModel.adapterTestButton.label}`);
assert(viewModel.healthRows.some((row) => row.key === 'audio_input' && row.detail.includes('不阻塞实时通话')), 'audio row should explain non-blocking ack');
assert(viewModel.flowAlert?.title === 'Adapter ack 略滞后', `unexpected flow alert: ${viewModel.flowAlert?.title}`);
assert(viewModel.flowAlert.detail.includes('不是逐帧阻塞条件'), 'flow alert should explain non-blocking ack');
assert(viewModel.realtimePolicy.title === '非阻塞媒体发送', `unexpected realtime policy: ${viewModel.realtimePolicy.title}`);

console.log('Connection status view model smoke passed.');
