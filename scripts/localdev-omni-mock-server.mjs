#!/usr/bin/env node
import { WebSocketServer } from 'ws';
import { simulateOmniTurn } from '../src/runtime/omniTurnSimulator.js';
import { createOmniOutputState, createReplyAudioFrame, normalizeInterruptMessage } from '../src/runtime/omniOutputFrames.js';

const PORT = Number(process.env.LOCALDEV_OMNI_PORT || 8000);
const PATH = process.env.LOCALDEV_OMNI_PATH || '/omni/realtime';
const HOST = process.env.LOCALDEV_OMNI_HOST || '0.0.0.0';

function now() { return new Date().toISOString(); }
function safeParse(raw) { try { return { ok: true, value: JSON.parse(raw) }; } catch (error) { return { ok: false, error }; } }

function normalizePacket(message) {
  if (message?.packet?.schema === 'omni.input_packet.v1') return { packet: message.packet, requestId: message.requestId || null, envelopeSchema: message.schema || null };
  if (message?.type === 'omni.input_packet' && message?.packet) return { packet: message.packet, requestId: message.requestId || null, envelopeSchema: message.schema || null };
  if (message?.schema === 'omni.input_packet.v1') return { packet: message, requestId: message.requestId || null, envelopeSchema: null };
  return null;
}

function normalizeMediaFrame(message) {
  if (message?.frame?.schema === 'omni.audio_frame.v1' || message?.frame?.schema === 'omni.camera_frame.v1') return { frame: message.frame, requestId: message.requestId || null, envelopeSchema: message.schema || null, type: message.type || null };
  if (message?.schema === 'omni.audio_frame.v1' || message?.schema === 'omni.camera_frame.v1') return { frame: message, requestId: message.requestId || null, envelopeSchema: null, type: message.schema === 'omni.audio_frame.v1' ? 'omni.audio_frame' : 'omni.camera_frame' };
  return null;
}

function socketSend(socket, payload) {
  if (socket.readyState !== 1) return false;
  socket.send(JSON.stringify(payload));
  return true;
}

function makePcmFloat32Base64({ sampleRate = 24000, durationMs = 120, frequency = 440, phase = 0, gain = 0.08 } = {}) {
  const sampleCount = Math.max(1, Math.round(sampleRate * durationMs / 1000));
  const samples = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i += 1) {
    const t = (i + phase) / sampleRate;
    const fadeIn = Math.min(1, i / Math.max(1, sampleCount * 0.18));
    const fadeOut = Math.min(1, (sampleCount - i) / Math.max(1, sampleCount * 0.22));
    samples[i] = Math.sin(2 * Math.PI * frequency * t) * gain * Math.min(fadeIn, fadeOut);
  }
  const payload = Buffer.from(samples.buffer).toString('base64');
  return { payload, byteLength: samples.byteLength, sampleCount };
}

function getActiveOutputs(socket) {
  if (!socket.__activeRealtimeOutputs) socket.__activeRealtimeOutputs = new Map();
  return socket.__activeRealtimeOutputs;
}

function cancelRealtimeOutput(socket, interruptInfo) {
  const active = getActiveOutputs(socket);
  const interrupt = interruptInfo?.interrupt || {};
  const targetTurnId = interrupt.turnId || null;
  let canceled = 0;

  for (const [turnId, stream] of active.entries()) {
    if (targetTurnId && turnId !== targetTurnId) continue;
    stream.cancelled = true;
    for (const timer of stream.timers) clearTimeout(timer);
    active.delete(turnId);
    canceled += 1;
    socketSend(socket, createOmniOutputState({
      turnId,
      requestId: stream.requestId || interruptInfo?.requestId || null,
      robotId: stream.robotId || interrupt.robotId || null,
      displayName: stream.displayName || interrupt.displayName || null,
      state: 'interrupted',
      reason: `用户插话模拟已停止当前输出流：${interrupt.reason || 'user_barge_in'}`,
      source: 'local_dev_mock_server'
    }));
    console.log(`[${now()}] realtime_output.interrupted turn=${turnId} reason=${interrupt.reason || 'user_barge_in'} cancelled_frames=${stream.remainingFrames || 0}`);
  }

  if (!canceled) {
    socketSend(socket, createOmniOutputState({
      turnId: targetTurnId,
      requestId: interruptInfo?.requestId || null,
      robotId: interrupt.robotId || null,
      displayName: interrupt.displayName || null,
      state: 'interrupted',
      reason: '收到 omni.interrupt.v1，但没有正在推送的输出流；保持安全空操作。',
      source: 'local_dev_mock_server'
    }));
    console.log(`[${now()}] realtime_output.interrupt.noop target=${targetTurnId || 'current_output'} reason=${interrupt.reason || 'user_barge_in'}`);
  }

  return { canceled };
}

function streamMockRealtimeOutput(socket, response, packetInfo) {
  const packet = packetInfo.packet;
  const requestId = packetInfo.requestId || null;
  const robotId = packet.identity?.robotId || null;
  const displayName = packet.identity?.displayName || null;
  const turnId = response.turnId;
  const active = getActiveOutputs(socket);

  // Only one mock output speaks at a time in v1.1.2. A new input turn cancels any previous mock stream.
  for (const [oldTurnId, stream] of active.entries()) {
    stream.cancelled = true;
    for (const timer of stream.timers) clearTimeout(timer);
    active.delete(oldTurnId);
  }

  const stream = {
    turnId,
    requestId,
    robotId,
    displayName,
    cancelled: false,
    timers: [],
    remainingFrames: 6
  };
  active.set(turnId, stream);

  socketSend(socket, createOmniOutputState({
    turnId,
    requestId,
    robotId,
    displayName,
    state: 'thinking',
    reason: 'LocalDev Mock 已收到 omni.input_packet.v1，开始模拟 Realtime Omni 输出流。'
  }));
  socketSend(socket, createOutputEnvelope(response, packetInfo));
  socketSend(socket, createOmniOutputState({
    turnId,
    requestId,
    robotId,
    displayName,
    state: 'speaking',
    reason: '开始通过 omni.reply_audio_frame.v1 流式返回 Mock 输出音频帧；audio_frame 不会自动打断输出。'
  }));

  const frameCount = 6;
  const sampleRate = 24000;
  const durationMs = 110;
  for (let index = 0; index < frameCount; index += 1) {
    const delay = 80 + index * 115;
    const timer = setTimeout(() => {
      if (stream.cancelled || !active.has(turnId)) return;
      const tone = makePcmFloat32Base64({
        sampleRate,
        durationMs,
        frequency: 360 + index * 35,
        phase: index * sampleRate * durationMs / 1000
      });
      const frame = createReplyAudioFrame({
        turnId,
        requestId,
        robotId,
        displayName,
        sequence: index + 1,
        isFinal: index === frameCount - 1,
        payloadBase64: tone.payload,
        byteLength: tone.byteLength,
        sampleRate,
        channels: 1,
        durationMs
      });
      stream.remainingFrames = frameCount - index - 1;
      console.log(`[${now()}] reply_audio_frame turn=${turnId} seq=${frame.sequence}/${frameCount} robot=${robotId || 'unknown'} bytes=${frame.audio.byteLength} final=${frame.isFinal}`);
      socketSend(socket, frame);
      if (frame.isFinal && !stream.cancelled) {
        active.delete(turnId);
        socketSend(socket, createOmniOutputState({
          turnId,
          requestId,
          robotId,
          displayName,
          state: 'finished',
          reason: 'Mock reply_audio_frame 流已结束；reply_text 仅作为字幕/日志。'
        }));
      }
    }, delay);
    stream.timers.push(timer);
  }
}

function createOutputEnvelope(turn, packetInfo) {
  return { schema: 'cloudgenie.local_dev.envelope.v1', type: 'omni.output_turn', requestId: packetInfo?.requestId || null, receivedAt: now(), receivedPacket: { schema: packetInfo?.packet?.schema || 'unknown', packetId: packetInfo?.packet?.packetId || 'unknown', robotId: packetInfo?.packet?.identity?.robotId || null, displayName: packetInfo?.packet?.identity?.displayName || null, route: packetInfo?.packet?.routing?.route || null, adapter: packetInfo?.packet?.routing?.adapter || null }, turn };
}

function createMediaAck(frameInfo) {
  const frame = frameInfo?.frame;
  return { schema: 'cloudgenie.local_dev.media_ack.v1', type: 'omni.media_ack', requestId: frameInfo?.requestId || null, receivedAt: now(), receivedFrame: { schema: frame?.schema || 'unknown', frameId: frame?.frameId || 'unknown', robotId: frame?.robotId || null, displayName: frame?.displayName || null, mediaKind: frame?.media?.kind || null, codec: frame?.media?.codec || null, payloadIncluded: Boolean(frame?.media?.payloadIncluded), byteLength: frame?.media?.byteLength || 0 }, note: 'LocalDev Mock 已识别媒体帧。audio_frame / camera_frame 只作为输入媒体，不会自动触发 interrupt；用户插话必须由 omni.interrupt.v1 表达。' };
}

function createErrorTurn(replyText, expression = 'error', notes = []) {
  return { schema: 'omni.output_turn.v1', turnId: `mock_error_${Date.now().toString(36)}`, createdAt: now(), adapter: 'LocalDevOmniAdapterMock', route: 'local_dev_omni', reply_text: replyText, reply_audio: null, expression: { type: 'expression.update', expression, source: 'local_dev_mock_server' }, tool_intents: [], transcript: { partial_asr: '', usage: '字幕 / 日志 / 调试 / 插件关键词辅助' }, notes };
}

const server = new WebSocketServer({ host: HOST, port: PORT, path: PATH });

server.on('connection', (socket, request) => {
  const remote = request.socket.remoteAddress;
  console.log(`[${now()}] LocalDev mock connected: ${remote}`);
  socket.on('message', (raw) => {
    const parsed = safeParse(raw.toString());
    if (!parsed.ok) {
      const turn = createErrorTurn(`LocalDev Mock 收到了无法解析的 JSON：${parsed.error.message}`, 'error', ['Mock server error response.']);
      socket.send(JSON.stringify(createOutputEnvelope(turn, { requestId: null, packet: null })));
      return;
    }

    const interruptInfo = normalizeInterruptMessage(parsed.value);
    if (interruptInfo?.interrupt) {
      console.log(`[${now()}] interrupt schema=${interruptInfo.interrupt.schema} turn=${interruptInfo.interrupt.turnId || 'current'} robot=${interruptInfo.interrupt.robotId || 'unknown'} reason=${interruptInfo.interrupt.reason || 'user_barge_in'} source=${interruptInfo.interrupt.source || 'unknown'}`);
      cancelRealtimeOutput(socket, interruptInfo);
      return;
    }

    const frameInfo = normalizeMediaFrame(parsed.value);
    if (frameInfo?.frame) {
      const frame = frameInfo.frame;
      const media = frame.media || {};
      const payloadFlag = media.payloadIncluded ? 'yes' : 'no';
      const detailInfo = media.kind === 'audio'
        ? ` samples=${media.sampleCount || 0} duration=${media.durationMs || 0}ms`
        : ` ${media.width || 0}x${media.height || 0} selector=${media.selectorPolicy || 'unknown'}`;
      console.log(`[${now()}] media_frame schema=${frame.schema || 'unknown'} frame_id=${frame.frameId || 'unknown'} robot=${frame.robotId || 'unknown'} display_name=${frame.displayName || 'unknown'} kind=${media.kind || 'unknown'} codec=${media.codec || 'unknown'} payload=${payloadFlag} bytes=${media.byteLength || 0}${detailInfo} request=${frameInfo.requestId || 'none'}`);
      socket.send(JSON.stringify(createMediaAck(frameInfo)));
      return;
    }
    const packetInfo = normalizePacket(parsed.value);
    if (!packetInfo?.packet) {
      const turn = createErrorTurn('LocalDev Mock 没有收到 omni.input_packet.v1，请检查 Web 端发送协议。', 'thinking', ['Expected envelope schema cloudgenie.local_dev.envelope.v1 with type=omni.input_packet and packet.schema=omni.input_packet.v1.']);
      console.log(`[${now()}] packet_schema=unknown packet_id=unknown robot=unknown expression=${turn.expression.expression} intents=0`);
      socket.send(JSON.stringify(createOutputEnvelope(turn, packetInfo)));
      return;
    }
    const packet = packetInfo.packet;
    const turn = simulateOmniTurn(packet);
    const response = { ...turn, adapter: 'LocalDevOmniAdapterMock', route: packet.routing?.route || 'local_dev_omni', reply_audio: null, notes: ['来自 scripts/localdev-omni-mock-server.mjs 的本地 Mock Realtime Omni 输出。', '这个服务只验证 Web ↔ LocalDev Adapter 的双向实时通讯，不是真实 Qwen2.5-Omni，也不是 reply_text → TTS。', 'v1.1.2 支持 omni.interrupt.v1 手动模拟用户插话：audio_frame 不会自动打断输出，避免 Omni 自己打断自己。', 'v1.1.1 会在同一个 WebSocket session 中返回 omni.output_state.v1 与 omni.reply_audio_frame.v1；reply_text 只作为字幕/日志/调试。', 'v1.1.0 输入能力仍保留：omni.audio_frame.v1 可携带真实 PCM Float32 payload，omni.camera_frame.v1 可携带真实 JPEG payload。', ...(turn.notes || [])] };
    console.log(`[${now()}] packet_schema=${packet.schema || 'unknown'} packet_id=${packet.packetId || 'unknown'} robot=${packet.identity?.robotId || 'unknown'} display_name=${packet.identity?.displayName || 'unknown'} expression=${response.expression?.expression} intents=${response.tool_intents?.length || 0} request=${packetInfo.requestId || 'none'} realtime_output=streaming`);
    streamMockRealtimeOutput(socket, response, packetInfo);
  });
  socket.on('close', () => {
    for (const stream of getActiveOutputs(socket).values()) {
      stream.cancelled = true;
      for (const timer of stream.timers) clearTimeout(timer);
    }
    getActiveOutputs(socket).clear();
    console.log(`[${now()}] LocalDev mock disconnected: ${remote}`);
  });
});

server.on('listening', () => {
  console.log(`LocalDev Omni Mock Server listening on ws://${HOST}:${PORT}${PATH}`);
  console.log('Run the Vite app separately with: npm run dev');
  console.log('v1.1.2 accepts input media frames, streams mock reply_audio_frame output, and supports manual omni.interrupt.v1 barge-in control.');
});
server.on('error', (error) => { console.error(`[${now()}] LocalDev Omni Mock Server error:`, error); process.exitCode = 1; });
