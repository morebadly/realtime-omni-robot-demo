#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import WebSocket, { WebSocketServer } from 'ws';
import {
  createLocalDevControlEnvelope,
  createLocalDevInputEnvelope,
  createLocalDevMediaEnvelope
} from '../src/runtime/localDevProtocol.js';
import { createOmniInterrupt } from '../src/runtime/omniOutputFrames.js';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(SCRIPT_DIR, '..');
const ADAPTER_SCRIPT = resolve(SCRIPT_DIR, 'localdev-omni-adapter-skeleton.mjs');
const QWEN_TEMPLATE_SCRIPT = resolve(SCRIPT_DIR, 'localdev-qwen-service-template.mjs');
const PATH = process.env.LOCALDEV_OMNI_PATH || '/omni/realtime';
const HOST = '127.0.0.1';
const PROVIDER = process.env.LOCALDEV_CONTRACT_PROVIDER || 'placeholder';
const SCENARIO = process.env.LOCALDEV_CONTRACT_SCENARIO || 'placeholder_audio';
const REQUEST_ID = `contract_req_${Date.now().toString(36)}`;

if (process.env.LOCALDEV_RUNTIME_CALL === '1') {
  console.error('Refusing to run contract smoke from runtime context. This script starts temporary child processes and is test-only.');
  process.exit(1);
}

function nowIso() {
  return new Date().toISOString();
}

function createId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
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

async function startFakeQwenRealtimeServer() {
  const port = await getFreePort();
  const messages = [];
  const server = new WebSocketServer({ host: HOST, port, path: '/qwen/realtime' });

  function createFakeOutputTurn(message) {
    return {
      schema: 'localdev.qwen.output_turn.v1',
      type: 'output_turn',
      sessionId: message.sessionId,
      requestId: message.requestId || null,
      turn: {
        schema: 'omni.output_turn.v1',
        turnId: createId('qwen_ws_turn'),
        requestId: message.requestId || null,
        createdAt: nowIso(),
        adapter: 'FakeLocalQwenWebSocketService',
        route: message.packet?.routing?.route || 'local_dev_omni',
        reply_text: 'Fake local Qwen websocket service returned a structured output turn for contract testing.',
        reply_audio: null,
        expression: { type: 'expression.update', expression: 'thinking', source: 'fake_local_qwen_websocket_service' },
        tool_intents: [],
        transcript: { partial_asr: '', usage: 'subtitles_logs_debug_only' },
        providerStatus: { ok: true, code: 'fake_qwen_ws_output_turn', error: null },
        notes: [
          'Contract smoke output only.',
          'No real Qwen inference was performed.',
          'No fake reply audio was emitted.'
        ]
      }
    };
  }

  function createFakeReplyAudioFrame(message) {
    const payload = Buffer.from(new Float32Array([0.02, 0.01, -0.01, -0.02]).buffer).toString('base64');
    return {
      schema: 'omni.reply_audio_frame.v1',
      type: 'omni.reply_audio_frame',
      frameId: createId('fake_qwen_reply_aud'),
      turnId: createId('fake_qwen_turn_audio'),
      requestId: message.requestId || null,
      robotId: message.packet?.identity?.robotId || null,
      displayName: message.packet?.identity?.displayName || null,
      sequence: 1,
      isFinal: true,
      createdAt: nowIso(),
      source: 'fake_local_qwen_websocket_service',
      audio: {
        kind: 'reply_audio',
        codec: 'pcm_float32',
        sampleRate: 24000,
        channels: 1,
        durationMs: 20,
        payloadEncoding: 'base64',
        payloadIncluded: true,
        byteLength: Buffer.byteLength(payload, 'base64'),
        payload,
        note: 'Fake native model audio for contract testing; not generated from reply_text.'
      },
      guardrails: {
        realtimeOutputFirst: true,
        notTtsPipeline: true,
        replyTextIsSubtitleOnly: true
      }
    };
  }

  server.on('connection', (qwenSocket) => {
    qwenSocket.on('message', (raw) => {
      const message = JSON.parse(raw.toString());
      messages.push(message);
      qwenSocket.send(JSON.stringify({
        schema: 'localdev.qwen.realtime_ack.v1',
        type: `${message.type}.ack`,
        sessionId: message.sessionId,
        requestId: message.requestId || null,
        receivedAt: nowIso()
      }));
      if (message.type === 'input_packet') {
        qwenSocket.send(JSON.stringify(createFakeReplyAudioFrame(message)));
        qwenSocket.send(JSON.stringify(createFakeOutputTurn(message)));
      }
    });
  });
  return {
    endpoint: `ws://${HOST}:${port}/qwen/realtime`,
    messages,
    close: () => new Promise((resolveClose) => server.close(resolveClose))
  };
}

async function startQwenTemplateService() {
  const port = await getFreePort();
  const path = '/qwen/realtime';
  const logs = [];
  const child = spawn(process.execPath, [QWEN_TEMPLATE_SCRIPT], {
    cwd: ROOT_DIR,
    env: {
      ...process.env,
      LOCALDEV_QWEN_SERVICE_HOST: HOST,
      LOCALDEV_QWEN_SERVICE_PORT: String(port),
      LOCALDEV_QWEN_SERVICE_PATH: path
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.stdout.on('data', (chunk) => logs.push(chunk.toString()));
  child.stderr.on('data', (chunk) => logs.push(chunk.toString()));

  const endpoint = `ws://${HOST}:${port}${path}`;
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Qwen template service exited early: ${logs.join('').trim()}`);
    }
    try {
      const probe = await openWebSocket(endpoint, 300);
      probe.close();
      return {
        endpoint,
        messages: null,
        close: async () => {
          if (child.exitCode === null) child.kill();
          await delay(100);
        }
      };
    } catch {
      await delay(100);
    }
  }
  if (child.exitCode === null) child.kill();
  throw new Error(`Timed out starting Qwen template service: ${logs.join('').trim()}`);
}

function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
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

function sendJson(socket, payload) {
  socket.send(JSON.stringify(payload));
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

function createContractPacket() {
  return {
    packetId: createId('omni_contract'),
    schema: 'omni.input_packet.v1',
    createdAt: nowIso(),
    routing: {
      mode: 'local_dev',
      adapter: 'LocalDevOmniAdapter',
      adapterEndpoint: `ws://${HOST}:0${PATH}`,
      adapterModel: 'contract-smoke-placeholder',
      route: 'local_dev_omni',
      canStream: true,
      cloudMode: false,
      connectionStatus: 'contract_test',
      transport: 'websocket'
    },
    identity: {
      robotId: 'robot_contract_001',
      displayName: 'ContractBot',
      wakeName: 'ContractBot',
      role: 'local_dev_robot',
      defaultRole: 'local_dev_robot',
      voiceStyle: 'clear',
      ownerCalling: 'developer',
      personalityPrompt: ''
    },
    input: {
      audio: {
        primary: 'raw_audio_stream',
        active: true,
        route: 'local_dev_omni',
        sampleRate: 48000,
        level: 0.24,
        asrTextUsage: 'subtitles_logs_debug_plugin_keywords_only',
        mediaChannel: {
          schema: 'omni.audio_frame.v1',
          observedFrames: 1,
          sentFrames: 1,
          lastFrameId: null,
          payloadPolicy: 'audio_payload_and_camera_payload_ready'
        }
      },
      visual: {
        available: true,
        uploadPlan: 'selected_keyframes',
        countInBuffer: 1,
        mediaChannel: {
          schema: 'omni.camera_frame.v1',
          observedFrames: 1,
          sentFrames: 1,
          lastFrameId: null,
          payloadPolicy: 'audio_payload_and_camera_payload_ready'
        }
      },
      factEvents: [
        {
          id: createId('event'),
          type: 'voice.intent',
          label: 'contract smoke intent',
          intent: 'contract_smoke_realtime_turn',
          timestamp: nowIso()
        }
      ],
      text: {
        directUserText: null,
        reason: 'ASR/text is debug-only; primary input remains raw audio and selected camera frames.'
      }
    },
    runtimeContext: {
      expression: 'listening',
      state: 'listening',
      motion: 'idle',
      permissions: [{ key: 'voice.input', status: 'allow', group: 'voice' }],
      enabledPlugins: []
    },
    guardrails: {
      noFrontendEmotionSummary: true,
      touchAndNfcAreFactEventsOnly: true,
      toolExecutionMustPassPermissionEngine: true,
      userCodeMustReturnActionIntentOnly: true
    }
  };
}

function createAudioFrame() {
  const samples = new Float32Array(480);
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = Math.sin(index / 12) * 0.05;
  }
  const payload = Buffer.from(samples.buffer).toString('base64');
  return {
    schema: 'omni.audio_frame.v1',
    frameId: createId('aud_contract'),
    createdAt: nowIso(),
    robotId: 'robot_contract_001',
    displayName: 'ContractBot',
    route: 'local_dev_omni',
    sequence: 1,
    media: {
      kind: 'audio',
      codec: 'pcm_float32',
      sampleRate: 48000,
      channels: 1,
      durationMs: 10,
      sampleCount: samples.length,
      level: 0.24,
      payloadIncluded: true,
      payloadEncoding: 'base64',
      byteLength: samples.byteLength,
      payload
    },
    guardrails: { asrTextIsNotPrimaryInput: true, rawAudioStreamFirst: true }
  };
}

function createCameraFrame() {
  const payload = Buffer.from('contract-camera-keyframe').toString('base64');
  return {
    schema: 'omni.camera_frame.v1',
    frameId: createId('cam_contract'),
    createdAt: nowIso(),
    robotId: 'robot_contract_001',
    displayName: 'ContractBot',
    route: 'local_dev_omni',
    sequence: 1,
    media: {
      kind: 'camera',
      codec: 'image/jpeg',
      width: 64,
      height: 64,
      capturedAt: nowIso(),
      selectorPolicy: 'contract_smoke_keyframe',
      uploadPlan: 'selected_keyframes',
      jpegQuality: 0.72,
      payloadIncluded: true,
      payloadEncoding: 'base64',
      byteLength: Buffer.byteLength(payload, 'base64'),
      payload
    },
    guardrails: { noFrontendEmotionSummary: true, selectedFramesGoToOmniAdapter: true }
  };
}

function formatSummary(messages) {
  const counts = messages.reduce((acc, message) => {
    const key = message.schema || message.type || 'unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  return Object.entries(counts)
    .map(([key, count]) => `${key}=${count}`)
    .join(', ');
}

function findIndexOrThrow(messages, label, predicate) {
  const index = messages.findIndex(predicate);
  if (index < 0) throw new Error(`Missing ${label}.`);
  return index;
}

async function assertPlaceholderAudioScenario({ socket, messages, packet }) {
  const thinking = await waitFor(messages, 'output_state thinking', (message) => (
    message.schema === 'omni.output_state.v1' && message.state === 'thinking'
  ));
  await waitFor(messages, 'omni.output_turn envelope', (message) => (
    message.schema === 'cloudgenie.local_dev.envelope.v1'
    && message.type === 'omni.output_turn'
    && message.turn?.schema === 'omni.output_turn.v1'
  ));
  await waitFor(messages, 'output_state speaking', (message) => (
    message.schema === 'omni.output_state.v1' && message.state === 'speaking'
  ));
  await waitFor(messages, 'native reply_audio_frame', (message) => (
    message.schema === 'omni.reply_audio_frame.v1'
    && message.audio?.kind === 'reply_audio'
    && message.guardrails?.notTtsPipeline === true
  ));

  const interrupt = createOmniInterrupt({
    turnId: thinking.turnId,
    robotId: packet.identity.robotId,
    displayName: packet.identity.displayName,
    requestId: REQUEST_ID,
    reason: 'contract_smoke_barge_in'
  });
  sendJson(socket, createLocalDevControlEnvelope({ requestId: REQUEST_ID, interrupt, sentAt: nowIso() }));
  await waitFor(messages, 'output_state interrupted', (message) => (
    message.schema === 'omni.output_state.v1' && message.state === 'interrupted'
  ));

  const errorState = messages.find((message) => message.schema === 'omni.output_state.v1' && message.state === 'error');
  if (errorState) {
    throw new Error(`Adapter returned error state: ${errorState.reason || 'unknown error'}`);
  }
}

async function assertAdapterErrorPaths(url) {
  const socket = await openWebSocket(url);
  const messages = [];
  socket.on('message', (raw) => {
    try {
      messages.push(JSON.parse(raw.toString()));
    } catch (error) {
      messages.push({ schema: 'invalid_json', error: error.message, raw: raw.toString() });
    }
  });

  socket.send('{');
  await waitFor(messages, 'malformed message error', (message) => (
    message.schema === 'omni.output_state.v1'
    && message.state === 'error'
    && String(message.reason || '').includes('malformed_message')
  ));

  sendJson(socket, { schema: 'contract.unsupported.v1', type: 'unsupported.contract_smoke' });
  await waitFor(messages, 'unsupported schema error', (message) => (
    message.schema === 'omni.output_state.v1'
    && message.state === 'error'
    && String(message.reason || '').includes('unsupported_schema')
  ));

  const audioFrame = createAudioFrame();
  sendJson(socket, createLocalDevMediaEnvelope({ requestId: `${REQUEST_ID}_pre`, frame: audioFrame, sentAt: nowIso() }));
  await waitFor(messages, 'media frame without active session ack', (message) => (
    message.schema === 'cloudgenie.local_dev.media_ack.v1'
    && message.receivedFrame?.schema === 'omni.audio_frame.v1'
    && message.sessionActive === false
    && String(message.warning || message.note || '').includes('media_frame_without_active')
  ));

  const interrupt = createOmniInterrupt({
    turnId: 'turn_not_active_contract',
    robotId: 'robot_contract_001',
    displayName: 'ContractBot',
    requestId: `${REQUEST_ID}_noop`,
    reason: 'contract_smoke_no_active_turn'
  });
  sendJson(socket, createLocalDevControlEnvelope({ requestId: `${REQUEST_ID}_noop`, interrupt, sentAt: nowIso() }));
  await waitFor(messages, 'interrupt with no active turn', (message) => (
    message.schema === 'omni.output_state.v1'
    && message.state === 'interrupted'
    && String(message.reason || '').includes('no output turn was active')
  ));

  socket.close();
  await delay(100);
  const reconnect = await openWebSocket(url, 1000);
  reconnect.close();
}

async function assertQwenLoopbackScenario({ socket, messages, packet }) {
  const errorState = await waitFor(messages, 'qwen output_state error', (message) => (
    message.schema === 'omni.output_state.v1'
    && message.state === 'error'
    && String(message.reason || '').includes('qwen_transport_not_implemented')
  ));
  const outputTurn = await waitFor(messages, 'qwen error output_turn envelope', (message) => (
    message.schema === 'cloudgenie.local_dev.envelope.v1'
    && message.type === 'omni.output_turn'
    && message.turn?.schema === 'omni.output_turn.v1'
    && message.turn?.providerStatus?.ok === false
  ));
  const realtimeStatus = outputTurn.turn?.providerResult?.realtimeStatus;
  if (!realtimeStatus?.connected || !realtimeStatus.sessionId) {
    throw new Error('Qwen loopback did not open a realtime session.');
  }
  if (realtimeStatus.inputPackets < 1 || realtimeStatus.audioFrames < 1 || realtimeStatus.cameraFrames < 1) {
    throw new Error(`Qwen loopback missed realtime inputs: ${JSON.stringify(realtimeStatus)}`);
  }

  const interrupt = createOmniInterrupt({
    turnId: errorState.turnId,
    robotId: packet.identity.robotId,
    displayName: packet.identity.displayName,
    requestId: REQUEST_ID,
    reason: 'contract_smoke_barge_in_after_error'
  });
  sendJson(socket, createLocalDevControlEnvelope({ requestId: REQUEST_ID, interrupt, sentAt: nowIso() }));
  await waitFor(messages, 'qwen interrupt forwarded', (message) => (
    message.schema === 'omni.output_state.v1'
    && message.state === 'interrupted'
    && String(message.reason || '').includes('no output turn was active')
  ));
}

async function assertQwenWebsocketScenario({ socket, messages, packet, qwenMessages }) {
  const thinking = await waitFor(messages, 'qwen websocket output_state thinking', (message) => (
    message.schema === 'omni.output_state.v1'
    && message.state === 'thinking'
  ));
  const outputTurn = await waitFor(messages, 'qwen websocket output_turn envelope', (message) => (
    message.schema === 'cloudgenie.local_dev.envelope.v1'
    && message.type === 'omni.output_turn'
    && message.turn?.schema === 'omni.output_turn.v1'
    && message.turn?.providerStatus?.ok !== false
  ));
  const realtimeStatus = outputTurn.turn?.providerResult?.realtimeStatus;
  if (!realtimeStatus?.connected || !realtimeStatus.sessionId) {
    throw new Error('Qwen websocket transport did not open a realtime session.');
  }
  if (realtimeStatus.inputPackets < 1 || realtimeStatus.audioFrames < 1 || realtimeStatus.cameraFrames < 1) {
    throw new Error(`Qwen websocket transport missed realtime inputs: ${JSON.stringify(realtimeStatus)}`);
  }

  if (Array.isArray(qwenMessages)) {
    await waitFor(qwenMessages, 'fake qwen session.start', (message) => message.type === 'session.start');
    await waitFor(qwenMessages, 'fake qwen audio_frame', (message) => message.type === 'audio_frame' && message.frame?.schema === 'omni.audio_frame.v1');
    await waitFor(qwenMessages, 'fake qwen camera_frame', (message) => message.type === 'camera_frame' && message.frame?.schema === 'omni.camera_frame.v1');
    await waitFor(qwenMessages, 'fake qwen input_packet', (message) => message.type === 'input_packet' && message.packet?.schema === 'omni.input_packet.v1');

    const sessionIds = [...new Set(qwenMessages.map((message) => message.sessionId).filter(Boolean))];
    if (sessionIds.length !== 1) {
      throw new Error(`Expected fake Qwen service to see one sessionId, got ${sessionIds.join(', ') || 'none'}`);
    }
  }
  await waitFor(messages, 'qwen websocket output_state speaking', (message) => (
    message.schema === 'omni.output_state.v1' && message.state === 'speaking'
  ));
  await waitFor(messages, 'qwen websocket native reply_audio_frame', (message) => (
    message.schema === 'omni.reply_audio_frame.v1'
    && message.audio?.kind === 'reply_audio'
    && message.guardrails?.notTtsPipeline === true
  ));
  await waitFor(messages, 'qwen websocket output_state finished', (message) => (
    message.schema === 'omni.output_state.v1' && message.state === 'finished'
  ));
  const errorState = messages.find((message) => message.schema === 'omni.output_state.v1' && message.state === 'error');
  if (errorState) {
    throw new Error(`Qwen websocket scenario returned unexpected error state: ${errorState.reason || 'unknown error'}`);
  }
  const replyAudioIndex = findIndexOrThrow(messages, 'qwen websocket native reply_audio_frame', (message) => message.schema === 'omni.reply_audio_frame.v1');
  const outputTurnIndex = findIndexOrThrow(messages, 'qwen websocket output_turn envelope', (message) => (
    message.schema === 'cloudgenie.local_dev.envelope.v1' && message.type === 'omni.output_turn'
  ));
  if (replyAudioIndex > outputTurnIndex) {
    throw new Error('Expected native reply_audio_frame to be forwarded before the structured output_turn envelope.');
  }

  const interrupt = createOmniInterrupt({
    turnId: thinking.turnId || outputTurn.turn?.turnId,
    robotId: packet.identity.robotId,
    displayName: packet.identity.displayName,
    requestId: REQUEST_ID,
    reason: 'contract_smoke_barge_in_after_error'
  });
  sendJson(socket, createLocalDevControlEnvelope({ requestId: REQUEST_ID, interrupt, sentAt: nowIso() }));
  await waitFor(messages, 'qwen websocket interrupt output_state', (message) => (
    message.schema === 'omni.output_state.v1'
    && message.state === 'interrupted'
    && String(message.reason || '').includes('no output turn was active')
  ));
  if (Array.isArray(qwenMessages)) {
    await waitFor(qwenMessages, 'fake qwen interrupt', (message) => message.type === 'interrupt' && message.interrupt?.schema === 'omni.interrupt.v1');
  }
}

async function main() {
  const port = Number(process.env.LOCALDEV_CONTRACT_TEST_PORT || await getFreePort());
  const url = `ws://${HOST}:${port}${PATH}`;
  const qwenService = SCENARIO === 'qwen_websocket'
    ? await startFakeQwenRealtimeServer()
    : SCENARIO === 'qwen_template_service'
      ? await startQwenTemplateService()
      : null;
  const child = spawn(process.execPath, [ADAPTER_SCRIPT], {
    cwd: ROOT_DIR,
    env: {
      ...process.env,
      LOCALDEV_OMNI_HOST: HOST,
      LOCALDEV_OMNI_PORT: String(port),
      LOCALDEV_OMNI_PATH: PATH,
      LOCALDEV_OMNI_PROVIDER: PROVIDER,
      ...(qwenService ? {
        LOCALDEV_QWEN_DRY_RUN: '0',
        LOCALDEV_QWEN_TRANSPORT: 'websocket_json',
        LOCALDEV_QWEN_ENDPOINT: qwenService.endpoint
      } : {})
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  const logs = [];
  child.stdout.on('data', (chunk) => logs.push(chunk.toString()));
  child.stderr.on('data', (chunk) => logs.push(chunk.toString()));

  let socket = null;
  const messages = [];
  try {
    await assertAdapterErrorPaths(url);
    socket = await openWebSocket(url);
    socket.on('message', (raw) => {
      try {
        messages.push(JSON.parse(raw.toString()));
      } catch (error) {
        messages.push({ schema: 'invalid_json', error: error.message, raw: raw.toString() });
      }
    });

    const audioFrame = createAudioFrame();
    const cameraFrame = createCameraFrame();
    const packet = createContractPacket();

    sendJson(socket, createLocalDevMediaEnvelope({ requestId: REQUEST_ID, frame: audioFrame, sentAt: nowIso() }));
    await waitFor(messages, 'audio media_ack', (message) => (
      message.schema === 'cloudgenie.local_dev.media_ack.v1'
      && message.receivedFrame?.schema === 'omni.audio_frame.v1'
    ));

    sendJson(socket, createLocalDevMediaEnvelope({ requestId: REQUEST_ID, frame: cameraFrame, sentAt: nowIso() }));
    await waitFor(messages, 'camera media_ack', (message) => (
      message.schema === 'cloudgenie.local_dev.media_ack.v1'
      && message.receivedFrame?.schema === 'omni.camera_frame.v1'
    ));

    sendJson(socket, createLocalDevInputEnvelope({ requestId: REQUEST_ID, packet, sentAt: nowIso() }));
    if (SCENARIO === 'qwen_loopback') {
      await assertQwenLoopbackScenario({ socket, messages, packet });
    } else if (SCENARIO === 'qwen_websocket' || SCENARIO === 'qwen_template_service') {
      await assertQwenWebsocketScenario({ socket, messages, packet, qwenMessages: qwenService.messages });
    } else {
      await assertPlaceholderAudioScenario({ socket, messages, packet });
    }

    const qwenSummary = Array.isArray(qwenService?.messages) ? ` qwen_messages=${qwenService.messages.length}` : '';
    console.log(`LocalDev adapter contract smoke passed (${SCENARIO}/${PROVIDER}): ${formatSummary(messages)}${qwenSummary}`);
  } finally {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.close();
    }
    child.kill();
    if (qwenService) await qwenService.close();
    await delay(100);
    if (child.exitCode === 1) {
      console.error(logs.join('').trim());
    }
  }
}

main().catch((error) => {
  console.error(`LocalDev adapter contract smoke failed: ${error.message}`);
  process.exitCode = 1;
});
