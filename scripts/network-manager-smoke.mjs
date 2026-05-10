#!/usr/bin/env node
import {
  NETWORK_QUALITY_PRESETS,
  buildConnectionSnapshot,
  getNetworkProfile
} from '../src/runtime/networkManager.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const localDev = getNetworkProfile('local_dev');
assert(localDev.label === 'Wi-Fi / Local Dev', `unexpected local_dev label: ${localDev.label}`);
assert(localDev.connectionMode === 'local_dev', 'local_dev profile should keep connectionMode');
assert(localDev.requiresNetwork === true, 'local_dev should require network for adapter transport');

const offline = buildConnectionSnapshot('offline_pet', 'stable');
assert(offline.status === 'offline', `offline_pet should be offline, got ${offline.status}`);
assert(offline.online === false, 'offline_pet should not be online');
assert(offline.audioRoute === 'offline_presets_only', `offline audio route mismatch: ${offline.audioRoute}`);
assert(offline.recommendedMode === 'offline_pet', `offline recommended mode mismatch: ${offline.recommendedMode}`);

const wifiPoor = buildConnectionSnapshot('wifi_cloud', 'poor');
assert(wifiPoor.status === 'degraded', `wifi_cloud poor should degrade, got ${wifiPoor.status}`);
assert(wifiPoor.degradeReason === 'latency_or_packet_loss_high', 'wifi poor should explain degraded reason');

const cellular = buildConnectionSnapshot('cellular_cloud', 'stable');
assert(cellular.cloudRoute === 'cloud_omni_realtime', `cellular cloud route mismatch: ${cellular.cloudRoute}`);
assert(cellular.audioRoute === 'audio_first', `cellular audio priority mismatch: ${cellular.audioRoute}`);

const labels = NETWORK_QUALITY_PRESETS.map((preset) => preset.label);
for (const expected of ['稳定', '拥挤', '较差', '断网']) {
  assert(labels.includes(expected), `missing quality label: ${expected}`);
}

console.log('Network manager smoke passed: local_dev, wifi_cloud, cellular_cloud, offline_pet');
