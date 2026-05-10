#!/usr/bin/env node
import WebSocket from 'ws';
import { createLocalDevServiceTargets } from './localdev-qwen-config.mjs';

const DEFAULT_TARGETS = createLocalDevServiceTargets();

function getTargets() {
  const arg = process.argv[2] || 'all';
  if (arg === 'adapter') return { adapter: DEFAULT_TARGETS.adapter };
  if (arg === 'qwen') return { qwen: DEFAULT_TARGETS.qwen };
  if (/^wss?:\/\//.test(arg)) return { custom: arg };
  return DEFAULT_TARGETS;
}

function checkWebSocket(name, endpoint, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const socket = new WebSocket(endpoint);
    const startedAt = Date.now();
    const timer = setTimeout(() => {
      socket.close();
      resolve({ name, endpoint, ok: false, latencyMs: Date.now() - startedAt, error: 'connect_timeout' });
    }, timeoutMs);

    socket.once('open', () => {
      clearTimeout(timer);
      socket.close();
      resolve({ name, endpoint, ok: true, latencyMs: Date.now() - startedAt, error: null });
    });
    socket.once('error', (error) => {
      clearTimeout(timer);
      resolve({ name, endpoint, ok: false, latencyMs: Date.now() - startedAt, error: error.message });
    });
  });
}

async function main() {
  const entries = Object.entries(getTargets());
  const results = await Promise.all(entries.map(([name, endpoint]) => checkWebSocket(name, endpoint)));
  for (const result of results) {
    const status = result.ok ? 'ok' : 'fail';
    const detail = result.ok ? `${result.latencyMs}ms` : result.error;
    console.log(`${status}\t${result.name}\t${result.endpoint}\t${detail}`);
  }
  if (results.some((result) => !result.ok)) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`health check failed: ${error.message}`);
  process.exitCode = 1;
});
