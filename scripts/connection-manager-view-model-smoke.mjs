#!/usr/bin/env node
import { buildConnectionSnapshot } from '../src/runtime/networkManager.js';
import { getFramePolicy } from '../src/runtime/framePolicy.js';
import { buildConnectionManagerViewModel } from '../src/runtime/connectionManagerViewModel.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const wifi = buildConnectionSnapshot('wifi_cloud', 'stable');
const wifiPolicy = getFramePolicy({
  mode: 'wifi_cloud',
  state: 'listening',
  cameraDemand: 'normal',
  connection: wifi
});
const wifiView = buildConnectionManagerViewModel({ connection: wifi, framePolicy: wifiPolicy, quality: 'stable' });

assert(wifiView.subtitle.includes('Runtime 管理'), `unexpected subtitle: ${wifiView.subtitle}`);
assert(wifiView.metrics.length === 4, `unexpected metric count: ${wifiView.metrics.length}`);
assert(wifiView.qualityOptions.some((item) => item.key === 'stable' && item.active), 'stable quality should be active');
assert(wifiView.framePolicy.label === '说话/聆听：2-5fps 关键帧', `unexpected frame policy: ${wifiView.framePolicy.label}`);

const cellular = buildConnectionSnapshot('cellular_cloud', 'poor');
const cellularPolicy = getFramePolicy({
  mode: 'cellular_cloud',
  state: 'idle',
  cameraDemand: 'normal',
  connection: cellular
});
const cellularView = buildConnectionManagerViewModel({ connection: cellular, framePolicy: cellularPolicy, quality: 'poor' });

assert(cellularView.status === 'degraded', `poor cellular should be degraded, got ${cellularView.status}`);
assert(cellularView.framePolicy.label.includes('蜂窝'), `cellular policy should mention 蜂窝, got ${cellularView.framePolicy.label}`);
assert(cellularView.framePolicy.rationale.includes('实时音频优先'), 'cellular policy should preserve audio-first wording');

console.log('Connection manager view model smoke passed.');
