#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const DEFAULT_SCRIPTS = [
  'test:version-doctor',
  'test:media-channel-ack',
  'test:realtime-readiness',
  'test:connection-modes',
  'test:network-manager',
  'test:connection-status-view-model',
  'test:connection-manager-view-model',
  'test:localdev-preflight',
  'test:localdev-qwen-config',
  'test:localdev-reconnect-recovery',
  'test:localdev-contract-matrix',
  'test:provider-config-gate',
  'test:provider-health-check',
  'test:provider-handshake',
  'test:provider-audio-gate',
  'test:provider-camera-gate',
  'test:provider-adapter-contract',
  'test:provider-socket-sandbox',
  'test:provider-proxy-contract',
  'test:provider-proxy-server',
  'test:provider-specific-handshake-adapter',
  'test:provider-real-handshake-preflight',
  'test:provider-real-handshake-probe-plan',
  'test:realtime-mux-backpressure',
  'test:dashscope-omni-config',
  'test:localdev-provider-registry',
  'test:realtime-output-queue',
  'test:localdev-qwen-transport',
  'test:localdev-adapter-contract'
];

const requested = process.argv.slice(2);
const scripts = requested.length ? requested : DEFAULT_SCRIPTS;
const npmCli = process.env.npm_execpath;

function runNpmScript(script) {
  if (npmCli) {
    return spawnSync(process.execPath, [npmCli, 'run', '-s', script], { stdio: 'inherit' });
  }
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  return spawnSync(npmCmd, ['run', '-s', script], { stdio: 'inherit' });
}

const startedAt = Date.now();
console.log(`Running smoke suite (${scripts.length} checks)...`);

for (const script of scripts) {
  console.log(`\n=== ${script} ===`);
  const result = runNpmScript(script);

  if (result.error) {
    console.error(`\nSmoke suite failed to start ${script}: ${result.error.message}`);
    process.exit(1);
  }

  if (result.status !== 0) {
    console.error(`\nSmoke suite failed at ${script}.`);
    process.exit(result.status ?? 1);
  }
}

const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
console.log(`\nSmoke suite passed in ${elapsed}s.`);
