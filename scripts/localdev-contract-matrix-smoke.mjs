#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import WebSocket from 'ws';
import {
  createLocalDevControlEnvelope,
  createLocalDevInputEnvelope,
  createLocalDevMediaEnvelope
} from '../src/runtime/localDevProtocol.js';
import { createOmniInterrupt } from '../src/runtime/omniOutputFrames.js';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(SCRIPT_DIR, '..');
const MOCK_SCRIPT = resolve(SCRIPT_DIR, 'localdev-omni-mock-server.mjs');
const HOST = '127.0.0.1';
const PATH = '/omni/realtime';
const REQUEST_ID = `matrix_req_${Date.now().toString(36)}`;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function nowIso() {
  return new Date().toISOString();
}

function createId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

function getFreePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.on('error', reject);
    server.listen(0, HOST, () => {
      const address = server.address();
      server.close(() => resolvePort(address.port));
    });
  });
}

async function openWebSocket(url, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      return await new Promise((resolveSocket, reject) => {
        const socket = new WebSocket(url);
        const timer = setTimeout(() => {
          socket.close();
          reject(new Error('connect timeout'));
        }, 500);
        socket.once('open', () => {
          clearTimeout(timer);
          resolveSocket(socket);
        });
        socket.once('error', (error) => {
          clearTimeout(timer);
          reject(error);
        });
      });
    } catch (error) {
      lastError = error;
      await delay(100);
    }
  }
  throw new Error(`Unable to connect to ${url}: ${lastError?.message || 'timeout'}`);
}

function waitFor(messages, label, predicate, timeoutMs = 5000) {
  return new Promise((resolveMatch, reject) => {
    const startedAt = Date.now();
    const timer = setInterval(() => {
      const match = messages.find(predicate);
      if (match) {
        clearInterval(timer);
        resolveMatch(match);
        return;
      }
      if (Date.now() - startedAt > timeoutMs) {
        clearInterval(timer);
        reject(new Error(`Timed out waiting for ${label}`));
      }
    }, 25);
  });
}

function sendJson(socket, payload) {
  socket.send(JSON.stringify(payload));
}

function createPacket() {
  return {
    schema: 'omni.input_packet.v1',
    packetId: createId('matrix_packet'),
    createdAt: nowIso(),
    routing: {
      mode: 'local_dev',
      adapter: 'LocalDevOmniAdapter',
      route: 'local_dev_omni',
      canStream: true,
      cloudMode: false,
      connectionStatus: 'contract_matrix',
      transport: 'websocket'
    },
    identity: {
      robotId: 'robot_matrix_001',
      displayName: 'MatrixBot',
      wakeName: 'MatrixBot',
      role: 'local_dev_robot',
      defaultRole: 'local_dev_robot'
    },
    input: {
      audio: {
        primary: 'raw_audio_stream',
        active: true,
        asrTextUsage: 'subtitles_logs_debug_plugin_keywords_only'
      },
      visual: {
        available: true,
        uploadPlan: 'selected_keyframes'
      },
      factEvents: [],
      text: {
        directUserText: null,
        reason: 'debug text only; primary input remains raw audio and selected camera frames.'
      }
    },
    runtimeContext: {
      expression: 'listening',
      state: 'listening',
      enabledPlugins: [],
      permissions: []
    },
    guardrails: {
      noFrontendEmotionSummary: true,
      rawAudioStreamFirst: true,
      replyTextIsSubtitleOnly: true,
      audioFrameDoesNotAutoInterrupt: true,
      replyAudioFrameCannotTriggerInterrupt: true,
      toolExecutionMustPassPermissionEngine: true,
      userCodeMustReturnActionIntentOnly: true
    }
  };
}

function createAudioFrame() {
  const samples = new Float32Array([0.01, 0.02, -0.01, -0.02]);
  const payload = Buffer.from(samples.buffer).toString('base64');
  return {
    schema: 'omni.audio_frame.v1',
    frameId: createId('matrix_audio'),
    createdAt: nowIso(),
    robotId: 'robot_matrix_001',
    displayName: 'MatrixBot',
    sequence: 1,
    media: {
      kind: 'audio',
      codec: 'pcm_float32',
      sampleRate: 48000,
      channels: 1,
      durationMs: 10,
      sampleCount: samples.length,
      payloadIncluded: true,
      payloadEncoding: 'base64',
      byteLength: samples.byteLength,
      payload
    }
  };
}

function createCameraFrame() {
  const payload = Buffer.from('matrix-camera-frame').toString('base64');
  return {
    schema: 'omni.camera_frame.v1',
    frameId: createId('matrix_camera'),
    createdAt: nowIso(),
    robotId: 'robot_matrix_001',
    displayName: 'MatrixBot',
    sequence: 1,
    media: {
      kind: 'camera',
      codec: 'image/jpeg',
      width: 64,
      height: 64,
      payloadIncluded: true,
      payloadEncoding: 'base64',
      byteLength: Buffer.byteLength(payload, 'base64'),
      payload
    }
  };
}

function formatSummary(messages) {
  const counts = messages.reduce((acc, message) => {
    const key = message.schema || message.type || 'unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  return Object.entries(counts).map(([key, count]) => `${key}=${count}`).join(', ');
}

async function main() {
  const port = await getFreePort();
  const url = `ws://${HOST}:${port}${PATH}`;
  const child = spawn(process.execPath, [MOCK_SCRIPT], {
    cwd: ROOT_DIR,
    env: {
      ...process.env,
      LOCALDEV_OMNI_HOST: HOST,
      LOCALDEV_OMNI_PORT: String(port),
      LOCALDEV_OMNI_PATH: PATH
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const logs = [];
  child.stdout.on('data', (chunk) => logs.push(chunk.toString()));
  child.stderr.on('data', (chunk) => logs.push(chunk.toString()));

  let socket = null;
  const messages = [];
  try {
    socket = await openWebSocket(url);
    socket.on('message', (raw) => {
      try {
        messages.push(JSON.parse(raw.toString()));
      } catch (error) {
        messages.push({ schema: 'invalid_json', error: error.message, raw: raw.toString() });
      }
    });

    socket.send('{');
    await waitFor(messages, 'malformed error state', (message) => (
      message.schema === 'omni.output_state.v1'
      && message.state === 'error'
      && String(message.reason || '').includes('malformed_message')
    ));

    sendJson(socket, { schema: 'matrix.unsupported.v1', type: 'matrix.unsupported', requestId: `${REQUEST_ID}_bad` });
    await waitFor(messages, 'unsupported error state', (message) => (
      message.schema === 'omni.output_state.v1'
      && message.state === 'error'
      && String(message.reason || '').includes('unsupported_schema')
    ));

    const audioFrame = createAudioFrame();
    sendJson(socket, createLocalDevMediaEnvelope({ requestId: `${REQUEST_ID}_audio`, frame: audioFrame, sentAt: nowIso() }));
    await waitFor(messages, 'audio ack', (message) => (
      message.schema === 'cloudgenie.local_dev.media_ack.v1'
      && message.receivedFrame?.schema === 'omni.audio_frame.v1'
      && message.receivedFrame?.payloadIncluded === true
    ));

    const cameraFrame = createCameraFrame();
    sendJson(socket, createLocalDevMediaEnvelope({ requestId: `${REQUEST_ID}_camera`, frame: cameraFrame, sentAt: nowIso() }));
    await waitFor(messages, 'camera ack', (message) => (
      message.schema === 'cloudgenie.local_dev.media_ack.v1'
      && message.receivedFrame?.schema === 'omni.camera_frame.v1'
      && message.receivedFrame?.payloadIncluded === true
    ));

    const packet = createPacket();
    sendJson(socket, createLocalDevInputEnvelope({ requestId: REQUEST_ID, packet, sentAt: nowIso() }));
    const thinking = await waitFor(messages, 'thinking state', (message) => (
      message.schema === 'omni.output_state.v1' && message.state === 'thinking' && message.requestId === REQUEST_ID
    ));
    await waitFor(messages, 'output turn', (message) => (
      message.schema === 'cloudgenie.local_dev.envelope.v1'
      && message.type === 'omni.output_turn'
      && message.requestId === REQUEST_ID
      && message.turn?.schema === 'omni.output_turn.v1'
      && message.turn?.reply_audio === null
    ));
    await waitFor(messages, 'speaking state', (message) => (
      message.schema === 'omni.output_state.v1' && message.state === 'speaking' && message.requestId === REQUEST_ID
    ));
    await waitFor(messages, 'reply audio frame', (message) => (
      message.schema === 'omni.reply_audio_frame.v1'
      && message.requestId === REQUEST_ID
      && message.audio?.kind === 'reply_audio'
      && message.guardrails?.notTtsPipeline === true
    ));

    const interrupt = createOmniInterrupt({
      turnId: thinking.turnId,
      robotId: packet.identity.robotId,
      displayName: packet.identity.displayName,
      requestId: `${REQUEST_ID}_interrupt`,
      reason: 'contract_matrix_manual_interrupt',
      source: 'contract_matrix_smoke'
    });
    sendJson(socket, createLocalDevControlEnvelope({ requestId: `${REQUEST_ID}_interrupt`, interrupt, sentAt: nowIso() }));
    await waitFor(messages, 'interrupted state', (message) => (
      message.schema === 'omni.output_state.v1'
      && message.state === 'interrupted'
      && message.turnId === thinking.turnId
    ));

    console.log(`LocalDev contract matrix smoke passed: ${formatSummary(messages)}`);
  } finally {
    if (socket && socket.readyState === WebSocket.OPEN) socket.close();
    child.kill();
    await delay(100);
    if (child.exitCode === 1) {
      console.error(logs.join('').trim());
    }
  }
}

main().catch((error) => {
  console.error(`LocalDev contract matrix smoke failed: ${error.message}`);
  process.exitCode = 1;
});
