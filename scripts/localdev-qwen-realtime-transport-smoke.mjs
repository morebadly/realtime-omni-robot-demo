#!/usr/bin/env node
import { createServer } from 'node:net';
import { WebSocketServer } from 'ws';
import { createQwenRealtimeClient } from './localdev-qwen-realtime-client.mjs';

const HOST = '127.0.0.1';
const REQUEST_ID = `qwen_rt_smoke_${Date.now().toString(36)}`;

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

function waitFor(messages, label, predicate, timeoutMs = 3000) {
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
    }, 20);
  });
}

function createPacket() {
  return {
    schema: 'omni.input_packet.v1',
    packetId: createId('omni_ws_smoke'),
    createdAt: nowIso(),
    routing: {
      mode: 'local_dev',
      adapter: 'LocalDevOmniAdapter',
      route: 'local_dev_omni',
      transport: 'websocket_json',
      canStream: true
    },
    identity: {
      robotId: 'robot_ws_smoke_001',
      displayName: 'WsSmokeBot'
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
      factEvents: []
    },
    guardrails: {
      noFrontendEmotionSummary: true,
      toolExecutionMustPassPermissionEngine: true
    }
  };
}

function createAudioFrame() {
  return {
    schema: 'omni.audio_frame.v1',
    frameId: createId('aud_ws_smoke'),
    createdAt: nowIso(),
    robotId: 'robot_ws_smoke_001',
    media: {
      kind: 'audio',
      codec: 'pcm_float32',
      payloadIncluded: true,
      payloadEncoding: 'base64',
      byteLength: 4,
      payload: Buffer.from(new Float32Array([0.1]).buffer).toString('base64')
    }
  };
}

function createCameraFrame() {
  return {
    schema: 'omni.camera_frame.v1',
    frameId: createId('cam_ws_smoke'),
    createdAt: nowIso(),
    robotId: 'robot_ws_smoke_001',
    media: {
      kind: 'camera',
      codec: 'image/jpeg',
      payloadIncluded: true,
      payloadEncoding: 'base64',
      byteLength: 6,
      payload: Buffer.from('camera').toString('base64')
    }
  };
}

function createInterrupt() {
  return {
    schema: 'omni.interrupt.v1',
    type: 'omni.interrupt',
    interruptId: createId('interrupt_ws_smoke'),
    requestId: REQUEST_ID,
    robotId: 'robot_ws_smoke_001',
    reason: 'transport_smoke_barge_in',
    createdAt: nowIso()
  };
}

function createOutputTurn(message) {
  return {
    schema: 'localdev.qwen.output_turn.v1',
    type: 'output_turn',
    sessionId: message.sessionId,
    requestId: message.requestId || null,
    turn: {
      schema: 'omni.output_turn.v1',
      turnId: createId('qwen_ws_output'),
      requestId: message.requestId || null,
      createdAt: nowIso(),
      adapter: 'FakeLocalQwenTransportSmoke',
      route: message.packet?.routing?.route || 'local_dev_omni',
      reply_text: 'Transport smoke structured output turn.',
      reply_audio: null,
      expression: { type: 'expression.update', expression: 'thinking', source: 'fake_qwen_transport_smoke' },
      tool_intents: [],
      transcript: { partial_asr: '', usage: 'subtitles_logs_debug_only' },
      providerStatus: { ok: true, code: 'transport_smoke_output_turn', error: null },
      notes: ['No real model inference or fake audio output was performed.']
    }
  };
}

function createReplyAudioFrame(message) {
  const payload = Buffer.from(new Float32Array([0.01, -0.01]).buffer).toString('base64');
  return {
    schema: 'omni.reply_audio_frame.v1',
    type: 'omni.reply_audio_frame',
    frameId: createId('qwen_ws_reply'),
    turnId: createId('qwen_ws_turn'),
    requestId: message.requestId || null,
    robotId: message.packet?.identity?.robotId || null,
    displayName: message.packet?.identity?.displayName || null,
    sequence: 1,
    isFinal: true,
    createdAt: nowIso(),
    source: 'fake_qwen_transport_smoke',
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
      note: 'Native reply audio smoke frame; not generated from reply_text.'
    },
    guardrails: {
      realtimeOutputFirst: true,
      notTtsPipeline: true,
      replyTextIsSubtitleOnly: true
    }
  };
}

function assertSameSession(messages) {
  const sessionIds = [...new Set(messages.map((message) => message.sessionId).filter(Boolean))];
  if (sessionIds.length !== 1) {
    throw new Error(`Expected one realtime sessionId, got ${sessionIds.join(', ') || 'none'}`);
  }
}

function findIndexOrThrow(messages, label, predicate) {
  const index = messages.findIndex(predicate);
  if (index < 0) throw new Error(`Missing ${label}.`);
  return index;
}

async function main() {
  const port = await getFreePort();
  const endpoint = `ws://${HOST}:${port}/qwen/realtime`;
  const messages = [];
  const server = new WebSocketServer({ host: HOST, port, path: '/qwen/realtime' });

  server.on('connection', (socket) => {
    socket.on('message', (raw) => {
      const message = JSON.parse(raw.toString());
      messages.push(message);
      socket.send(JSON.stringify({
        schema: 'localdev.qwen.realtime_ack.v1',
        type: `${message.type}.ack`,
        sessionId: message.sessionId,
        requestId: message.requestId || null,
        receivedAt: nowIso()
      }));
      if (message.type === 'input_packet') {
        socket.send(JSON.stringify(createReplyAudioFrame(message)));
        socket.send(JSON.stringify(createOutputTurn(message)));
      }
    });
  });

  try {
    const client = createQwenRealtimeClient({
      endpoint,
      transport: 'websocket_json',
      timeoutMs: 3000,
      dryRun: false
    });
    const packet = createPacket();
    const audioFrame = createAudioFrame();
    const cameraFrame = createCameraFrame();
    const interrupt = createInterrupt();

    const connect = await client.connect();
    if (!connect.ok) throw new Error(`connect failed: ${connect.error}`);

    const audio = await client.sendMediaFrame(audioFrame, REQUEST_ID);
    if (!audio.ok) throw new Error(`audio send failed: ${audio.error}`);

    const camera = await client.sendMediaFrame(cameraFrame, REQUEST_ID);
    if (!camera.ok) throw new Error(`camera send failed: ${camera.error}`);

    const input = await client.sendInputPacket(packet, REQUEST_ID);
    if (!input.ok) throw new Error(`input send failed: ${input.error}`);

    const output = await client.waitForOutputTurn({ requestId: REQUEST_ID, timeoutMs: 3000 });
    if (!output.ok) throw new Error(`output turn wait failed: ${output.error}`);
    if (output.output?.schema !== 'omni.output_turn.v1') {
      throw new Error('output turn wait returned an invalid output schema.');
    }
    const replyAudioFrames = client.getReplyAudioFrames({ requestId: REQUEST_ID });
    if (replyAudioFrames.length !== 1 || replyAudioFrames[0].schema !== 'omni.reply_audio_frame.v1') {
      throw new Error('reply audio frame was not captured by websocket_json transport.');
    }
    const inbound = client.getReceivedMessages ? client.getReceivedMessages() : [];
    const replyAudioIndex = findIndexOrThrow(inbound, 'inbound reply_audio_frame', (message) => message.schema === 'omni.reply_audio_frame.v1');
    const outputTurnIndex = findIndexOrThrow(inbound, 'inbound output_turn', (message) => message.turn?.schema === 'omni.output_turn.v1');
    if (replyAudioIndex > outputTurnIndex) {
      throw new Error('Expected inbound reply_audio_frame before inbound output_turn.');
    }

    const interrupted = await client.sendInterrupt(interrupt);
    if (!interrupted.ok) throw new Error(`interrupt send failed: ${interrupted.error}`);

    await client.close('transport_smoke_finished');

    await waitFor(messages, 'session.start', (message) => message.type === 'session.start');
    await waitFor(messages, 'audio_frame', (message) => message.type === 'audio_frame' && message.frame?.schema === 'omni.audio_frame.v1');
    await waitFor(messages, 'camera_frame', (message) => message.type === 'camera_frame' && message.frame?.schema === 'omni.camera_frame.v1');
    await waitFor(messages, 'input_packet', (message) => message.type === 'input_packet' && message.packet?.schema === 'omni.input_packet.v1');
    await waitFor(messages, 'interrupt', (message) => message.type === 'interrupt' && message.interrupt?.schema === 'omni.interrupt.v1');
    await waitFor(messages, 'session.close', (message) => message.type === 'session.close');
    assertSameSession(messages);

    console.log(`Qwen websocket_json realtime transport smoke passed: messages=${messages.length} session=${messages[0].sessionId}`);
  } finally {
    server.close();
  }
}

main().catch((error) => {
  console.error(`Qwen websocket_json realtime transport smoke failed: ${error.message}`);
  process.exitCode = 1;
});
