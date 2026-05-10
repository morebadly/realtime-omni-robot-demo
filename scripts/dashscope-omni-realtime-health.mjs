#!/usr/bin/env node
import WebSocket from 'ws';
import {
  createDashScopeOmniRealtimeConfig,
  formatDashScopeOmniRealtimeChecklist,
  validateDashScopeOmniRealtimeConfig
} from './dashscope-omni-realtime-config.mjs';

const config = createDashScopeOmniRealtimeConfig();
const checklist = formatDashScopeOmniRealtimeChecklist(config);
const validation = validateDashScopeOmniRealtimeConfig(config);

if (!validation.okForCloudRealtime) {
  console.error('DashScope Qwen-Omni realtime config is not ready:');
  for (const issue of validation.issues) {
    console.error(`- ${issue.code}: ${issue.message}`);
  }
  console.error('Current checklist:');
  console.error(JSON.stringify({ ...checklist, hasApiKey: Boolean(config.apiKey) }, null, 2));
  process.exitCode = 1;
} else {
  const timeoutMs = Number(process.env.DASHSCOPE_OMNI_CONNECT_TIMEOUT_MS || 8000);
  const startedAt = Date.now();
  const socket = new WebSocket(config.url, {
    headers: {
      Authorization: `Bearer ${config.apiKey}`
    }
  });

  const timer = setTimeout(() => {
    try { socket.close(); } catch {}
    console.error(`DashScope Qwen-Omni realtime health timeout after ${timeoutMs}ms: ${config.url}`);
    process.exitCode = 1;
  }, timeoutMs);

  socket.once('open', () => {
    clearTimeout(timer);
    console.log(`ok\tdashscope_qwen_omni\t${config.model}\t${config.url}\t${Date.now() - startedAt}ms`);
    socket.close(1000, 'health_check_done');
  });

  socket.once('error', (error) => {
    clearTimeout(timer);
    console.error(`fail\tdashscope_qwen_omni\t${config.model}\t${config.url}\t${error.message}`);
    process.exitCode = 1;
  });
}
