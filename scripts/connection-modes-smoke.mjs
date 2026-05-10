#!/usr/bin/env node
import { CONNECTION_MODE_OPTIONS, getConnectionModeOption } from '../src/runtime/connectionModes.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const expectedModes = ['wifi_cloud', 'cellular_cloud', 'local_dev', 'self_hosted_cloud', 'offline_pet'];
const actualModes = CONNECTION_MODE_OPTIONS.map((option) => option.key);

assert(JSON.stringify(actualModes) === JSON.stringify(expectedModes), `unexpected connection mode order: ${actualModes.join(', ')}`);

for (const key of expectedModes) {
  const option = getConnectionModeOption(key);
  assert(option.key === key, `getConnectionModeOption(${key}) returned ${option.key}`);
  assert(option.label && option.description && option.productScenario, `connection mode ${key} is missing display metadata`);
  assert(option.networkLabel, `connection mode ${key} is missing networkLabel`);
  assert(option.adapterMode === key, `connection mode ${key} should map to adapterMode=${key}`);
  assert(typeof option.requiresNetwork === 'boolean', `connection mode ${key} requiresNetwork must be boolean`);
}

assert(getConnectionModeOption('unknown_mode').key === 'wifi_cloud', 'unknown mode should fall back to wifi_cloud');
assert(getConnectionModeOption('offline_pet').requiresNetwork === false, 'offline_pet should not require network');
assert(getConnectionModeOption('local_dev').adapterMode === 'local_dev', 'local_dev should map to LocalDev adapter mode');
assert(getConnectionModeOption('wifi_cloud').requiresNetwork === true, 'wifi_cloud should require network');

console.log(`Connection modes smoke passed: ${actualModes.join(', ')}`);
