#!/usr/bin/env node
import { WebSocketServer } from 'ws';

const HOST = process.env.LOCALDEV_QWEN_SERVICE_HOST || '127.0.0.1';
const PORT = Number(process.env.LOCALDEV_QWEN_SERVICE_PORT || 8010);
const PATH = process.env.LOCALDEV_QWEN_SERVICE_PATH || '/qwen/realtime';

function nowIso() {
  return new Date().toISOString();
}

function createId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function safeParse(raw) {
  try {
    return { ok: true, value: JSON.parse(raw.toString()) };
  } catch (error) {
    return { ok: false, error };
  }
}

function sendJson(socket, payload) {
  if (socket.readyState !== 1) return false;
  socket.send(JSON.stringify(payload));
  return true;
}

function createAck(message) {
  return {
    schema: 'localdev.qwen.realtime_ack.v1',
    type: `${message.type || 'unknown'}.ack`,
    sessionId: message.sessionId || null,
    requestId: message.requestId || null,
    receivedAt: nowIso()
  };
}

function createReplyAudioFrame(message) {
  const samples = new Float32Array([0.02, 0.01, -0.01, -0.02]);
  const payload = Buffer.from(samples.buffer).toString('base64');
  return {
    schema: 'omni.reply_audio_frame.v1',
    type: 'omni.reply_audio_frame',
    frameId: createId('qwen_template_reply_aud'),
    turnId: createId('qwen_template_turn_audio'),
    requestId: message.requestId || null,
    robotId: message.packet?.identity?.robotId || null,
    displayName: message.packet?.identity?.displayName || null,
    sequence: 1,
    isFinal: true,
    createdAt: nowIso(),
    source: 'localdev_qwen_service_template',
    audio: {
      kind: 'reply_audio',
      codec: 'pcm_float32',
      sampleRate: 24000,
      channels: 1,
      durationMs: 20,
      payloadEncoding: 'base64',
      payloadIncluded: true,
      byteLength: samples.byteLength,
      payload,
      note: 'Template native reply audio frame. Replace this with real model audio; do not synthesize from reply_text.'
    },
    guardrails: {
      realtimeOutputFirst: true,
      notTtsPipeline: true,
      replyTextIsSubtitleOnly: true
    }
  };
}

function createOutputTurn(message) {
  return {
    schema: 'localdev.qwen.output_turn.v1',
    type: 'output_turn',
    sessionId: message.sessionId || null,
    requestId: message.requestId || null,
    turn: {
      schema: 'omni.output_turn.v1',
      turnId: createId('qwen_template_turn'),
      requestId: message.requestId || null,
      createdAt: nowIso(),
      adapter: 'LocalDevQwenServiceTemplate',
      route: message.packet?.routing?.route || 'local_dev_omni',
      reply_text: 'LocalDev Qwen service template returned a structured output turn. Replace this with real model subtitles/debug text.',
      reply_audio: null,
      expression: { type: 'expression.update', expression: 'thinking', source: 'localdev_qwen_service_template' },
      tool_intents: [],
      transcript: { partial_asr: '', usage: 'subtitles_logs_debug_only' },
      providerStatus: { ok: true, code: 'template_output_turn', error: null },
      notes: [
        'Template service only; no real Qwen inference was performed.',
        'Native audio must come from model output frames, not from reply_text.',
        `Observed packet=${message.packet?.packetId || 'unknown'} session=${message.sessionId || 'unknown'}.`
      ]
    }
  };
}

function handleMessage(socket, message) {
  sendJson(socket, createAck(message));
  if (message.type === 'input_packet') {
    sendJson(socket, createReplyAudioFrame(message));
    sendJson(socket, createOutputTurn(message));
  }
}

const server = new WebSocketServer({ host: HOST, port: PORT, path: PATH });

server.on('connection', (socket, request) => {
  console.log(`[${nowIso()}] Qwen service template connected: ${request.socket.remoteAddress}`);
  socket.on('message', (raw) => {
    const parsed = safeParse(raw);
    if (!parsed.ok) {
      sendJson(socket, {
        schema: 'localdev.qwen.error.v1',
        type: 'error',
        error: `Invalid JSON: ${parsed.error.message}`,
        receivedAt: nowIso()
      });
      return;
    }
    const message = parsed.value;
    console.log(`[${nowIso()}] ${message.type || 'unknown'} session=${message.sessionId || 'none'} request=${message.requestId || 'none'}`);
    handleMessage(socket, message);
  });
  socket.on('close', () => {
    console.log(`[${nowIso()}] Qwen service template disconnected`);
  });
});

server.on('listening', () => {
  console.log(`LocalDev Qwen service template listening on ws://${HOST}:${PORT}${PATH}`);
  console.log('This is a contract template only. Replace handlers with real Qwen-Omni compatible realtime inference later.');
});

server.on('error', (error) => {
  console.error(`[${nowIso()}] Qwen service template error:`, error);
  process.exitCode = 1;
});
