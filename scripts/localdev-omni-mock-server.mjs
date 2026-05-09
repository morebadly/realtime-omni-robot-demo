#!/usr/bin/env node
import { WebSocketServer } from 'ws';
import { simulateOmniTurn } from '../src/runtime/omniTurnSimulator.js';

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

function createOutputEnvelope(turn, packetInfo) {
  return { schema: 'cloudgenie.local_dev.envelope.v1', type: 'omni.output_turn', requestId: packetInfo?.requestId || null, receivedAt: now(), receivedPacket: { schema: packetInfo?.packet?.schema || 'unknown', packetId: packetInfo?.packet?.packetId || 'unknown', robotId: packetInfo?.packet?.identity?.robotId || null, displayName: packetInfo?.packet?.identity?.displayName || null, route: packetInfo?.packet?.routing?.route || null, adapter: packetInfo?.packet?.routing?.adapter || null }, turn };
}

function createMediaAck(frameInfo) {
  const frame = frameInfo?.frame;
  return { schema: 'cloudgenie.local_dev.media_ack.v1', type: 'omni.media_ack', requestId: frameInfo?.requestId || null, receivedAt: now(), receivedFrame: { schema: frame?.schema || 'unknown', frameId: frame?.frameId || 'unknown', robotId: frame?.robotId || null, displayName: frame?.displayName || null, mediaKind: frame?.media?.kind || null, codec: frame?.media?.codec || null, payloadIncluded: Boolean(frame?.media?.payloadIncluded), byteLength: frame?.media?.byteLength || 0 }, note: 'LocalDev Mock 已识别媒体帧。v1.1.0 可验证音频 PCM payload 与摄像头 JPEG payload 是否真实送达，但仍不执行真实 Qwen2.5-Omni 推理。' };
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
    const response = { ...turn, adapter: 'LocalDevOmniAdapterMock', route: packet.routing?.route || 'local_dev_omni', notes: ['来自 scripts/localdev-omni-mock-server.mjs 的本地 Mock 输出。', '这个服务只验证 Web → LocalDev Adapter → Web 链路，不是真实 Qwen2.5-Omni。', 'v1.1.0 同时识别 omni.audio_frame.v1 / omni.camera_frame.v1；audio_frame 可携带真实 PCM Float32 payload，camera_frame 可携带真实 JPEG payload。', ...(turn.notes || [])] };
    console.log(`[${now()}] packet_schema=${packet.schema || 'unknown'} packet_id=${packet.packetId || 'unknown'} robot=${packet.identity?.robotId || 'unknown'} display_name=${packet.identity?.displayName || 'unknown'} expression=${response.expression?.expression} intents=${response.tool_intents?.length || 0} request=${packetInfo.requestId || 'none'}`);
    socket.send(JSON.stringify(createOutputEnvelope(response, packetInfo)));
  });
  socket.on('close', () => console.log(`[${now()}] LocalDev mock disconnected: ${remote}`));
});

server.on('listening', () => {
  console.log(`LocalDev Omni Mock Server listening on ws://${HOST}:${PORT}${PATH}`);
  console.log('Run the Vite app separately with: npm run dev');
  console.log('v1.1.0 accepts omni.audio_frame.v1 with real PCM Float32 payload and omni.camera_frame.v1 with real JPEG payload.');
});
server.on('error', (error) => { console.error(`[${now()}] LocalDev Omni Mock Server error:`, error); process.exitCode = 1; });
