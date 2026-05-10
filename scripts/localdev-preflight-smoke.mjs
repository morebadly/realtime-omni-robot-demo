#!/usr/bin/env node
import {
  createLocalDevPreflightState,
  describeLocalDevPreflight,
  markLocalDevPreflightChecking,
  markLocalDevPreflightConnected,
  markLocalDevPreflightFailed,
  markLocalDevPreflightSkipped,
  shouldRunLocalDevFirstCheck
} from '../src/runtime/localDevPreflight.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const robotId = 'robot_demo_001';
const endpoint = 'ws://127.0.0.1:8000/omni/realtime';

const initial = createLocalDevPreflightState(robotId, endpoint);
assert(initial.status === 'pending', `unexpected initial status: ${initial.status}`);
assert(initial.checked === false, 'initial preflight should not be checked');
assert(initial.healthCommand === 'npm run health:localdev', `unexpected health command: ${initial.healthCommand}`);
assert(shouldRunLocalDevFirstCheck(initial, { robotId, endpoint }) === true, 'initial state should require first check');

const checking = markLocalDevPreflightChecking(robotId, endpoint);
assert(checking.status === 'checking', `unexpected checking status: ${checking.status}`);
assert(describeLocalDevPreflight(checking).includes('握手测试'), 'checking detail should explain handshake only');

const connected = markLocalDevPreflightConnected(robotId, endpoint, { reused: false });
assert(connected.status === 'connected', `unexpected connected status: ${connected.status}`);
assert(connected.checked === true, 'connected preflight should be checked');
assert(shouldRunLocalDevFirstCheck(connected, { robotId, endpoint }) === false, 'connected state should not repeat first check');
assert(shouldRunLocalDevFirstCheck(connected, { robotId, endpoint: 'ws://127.0.0.1:8001/omni/realtime' }) === true, 'endpoint change should require first check');

const failed = markLocalDevPreflightFailed(robotId, endpoint, 'connect_timeout');
assert(failed.status === 'failed', `unexpected failed status: ${failed.status}`);
assert(describeLocalDevPreflight(failed) === 'connect_timeout', 'failed description should surface error');

const skipped = markLocalDevPreflightSkipped(robotId, endpoint, 'wifi_cloud');
assert(skipped.status === 'skipped', `unexpected skipped status: ${skipped.status}`);
assert(skipped.detail.includes('wifi_cloud'), 'skipped detail should include current mode');

console.log('LocalDev preflight smoke passed.');
