#!/usr/bin/env node
import { createServer } from 'node:net';
import WebSocket, { WebSocketServer } from 'ws';
import { createLocalDevOmniBridge } from '../src/runtime/localDevOmniClient.js';
import { createLocalDevOutputEnvelope } from '../src/runtime/localDevProtocol.js';
import { createOmniOutputState, createReplyAudioFrame } from '../src/runtime/omniOutputFrames.js';
import { applyRealtimeOutputDisconnect, applyReplyAudioFrame, createDefaultRealtimeOutputChannel } from '../src/runtime/realtimeOutputChannel.js';
import { createDefaultRealtimeSessionState, transitionRealtimeSessionState } from '../src/runtime/realtimeSessionState.js';

globalThis.WebSocket = WebSocket;
globalThis.window = {
  setTimeout: globalThis.setTimeout,
  clearTimeout: globalThis.clearTimeout
};

const HOST = '127.0.0.1';
const PATH = '/omni/realtime';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function createPacket() {
  return {
    schema: 'omni.input_packet.v1',
    packetId: `recovery_packet_${Date.now().toString(36)}`,
    routing: { adapter: 'LocalDevOmniAdapter', route: 'local_dev_omni' },
    identity: { robotId: 'robot_recovery_001', displayName: 'RecoveryBot' },
    input: {
      text: { reason: 'debug text only; not TTS input' },
      audio: { primary: 'raw_audio_stream' },
      visual: { uploadPlan: 'selected_keyframes' }
    },
    runtimeContext: { expression: 'listening', enabledPlugins: [] },
    guardrails: {
      rawAudioStreamFirst: true,
      replyTextIsSubtitleOnly: true,
      audioFrameDoesNotAutoInterrupt: true,
      replyAudioFrameCannotTriggerInterrupt: true
    }
  };
}

function createTurn(requestId) {
  return {
    schema: 'omni.output_turn.v1',
    turnId: `recovery_turn_${Date.now().toString(36)}`,
    requestId,
    createdAt: new Date().toISOString(),
    adapter: 'LocalDevRecoverySmokeServer',
    route: 'local_dev_omni',
    reply_text: 'Recovery smoke structured output. This is subtitle/debug text only.',
    reply_audio: null,
    expression: { type: 'expression.update', expression: 'thinking', source: 'recovery_smoke' },
    tool_intents: [],
    transcript: { partial_asr: '', usage: 'subtitles_logs_debug_only' },
    notes: ['No real model, cloud API, hardware, or TTS was used.']
  };
}

async function startRecoveryServer({ closeMidTurn = false } = {}) {
  const port = await getFreePort();
  const messages = [];
  const server = new WebSocketServer({ host: HOST, port, path: PATH });
  server.on('connection', (socket) => {
    socket.on('message', (raw) => {
      const message = JSON.parse(raw.toString());
      messages.push(message);
      const requestId = message.requestId || null;
      const packet = message.packet || null;
      const turn = createTurn(requestId);

      if (closeMidTurn) {
        socket.send(JSON.stringify(createOmniOutputState({
          turnId: turn.turnId,
          requestId,
          robotId: packet?.identity?.robotId || null,
          displayName: packet?.identity?.displayName || null,
          state: 'speaking',
          reason: 'Recovery smoke closes during reply_audio_frame stream.'
        })));
        socket.send(JSON.stringify(createReplyAudioFrame({
          turnId: turn.turnId,
          requestId,
          robotId: packet?.identity?.robotId || null,
          displayName: packet?.identity?.displayName || null,
          sequence: 1,
          isFinal: false,
          payloadBase64: Buffer.from(new Float32Array([0.01, -0.01]).buffer).toString('base64'),
          byteLength: 8,
          durationMs: 20
        })));
        socket.close(1011, 'recovery_smoke_mid_turn_close');
        return;
      }

      socket.send('{');
      socket.send(JSON.stringify({
        schema: 'contract.unsupported.v1',
        type: 'unsupported.recovery_smoke',
        requestId
      }));
      socket.send(JSON.stringify(createLocalDevOutputEnvelope({
        requestId,
        packet,
        turn,
        receivedAt: new Date().toISOString()
      })));
    });
  });

  return {
    url: `ws://${HOST}:${port}${PATH}`,
    messages,
    close: () => new Promise((resolve) => server.close(resolve))
  };
}

async function main() {
  let session = createDefaultRealtimeSessionState();
  session = transitionRealtimeSessionState(session, 'INPUT_PACKET_SENT', { requestId: 'req_1' });
  session = transitionRealtimeSessionState(session, 'SOCKET_DISCONNECTED', { recoverable: true, reason: 'mid_turn_disconnect' });
  assert(session.state === 'recovering', `expected recovering after socket disconnect, got ${session.state}`);
  assert(session.playbackActive === false, 'socket disconnect should stop session playbackActive');
  session = transitionRealtimeSessionState(session, 'SOCKET_RECOVERED', { reason: 'reconnected' });
  assert(session.state === 'listening', `expected listening after socket recovery, got ${session.state}`);
  session = transitionRealtimeSessionState(session, 'SEND_FAILED', { reason: 'socket_not_open' });
  assert(session.state === 'recovering', `expected recovering after send failure, got ${session.state}`);

  let output = createDefaultRealtimeOutputChannel();
  output = applyReplyAudioFrame(output, createReplyAudioFrame({
    turnId: 'turn_disconnect',
    requestId: 'req_disconnect',
    sequence: 1,
    isFinal: false,
    payloadBase64: Buffer.from(new Float32Array([0.02]).buffer).toString('base64'),
    byteLength: 4
  }));
  assert(output.queuedAudioFrames.length === 1, 'reply audio should be queued before disconnect');
  output = applyRealtimeOutputDisconnect(output, 'socket_disconnected_mid_turn');
  assert(output.queuedAudioFrames.length === 0, 'disconnect should clear queued reply audio frames');
  assert(output.playbackActive === false, 'disconnect should stop output playbackActive');

  const statuses = [];
  const server = await startRecoveryServer();
  const bridge = createLocalDevOmniBridge((status) => statuses.push(status));
  const first = await bridge.send(createPacket(), server.url, 2000);
  assert(first.ok === true, `valid output after malformed/unsupported messages should recover: ${first.error || 'no error'}`);
  assert(statuses.some((status) => status.status === 'failed' || status.status === 'protocol_error'), 'malformed service JSON should be reported as a protocol diagnostic');
  assert(first.turn?.schema === 'omni.output_turn.v1', 'bridge should still resolve the following valid output turn');
  bridge.close('recovery_smoke_disconnect');
  await delay(100);
  assert(statuses.some((status) => status.status === 'disconnected'), 'bridge should emit disconnected after close');
  const recovered = await bridge.connect(server.url, 2000);
  assert(recovered.ok === true, `bridge should reconnect after disconnect: ${recovered.error || 'no error'}`);
  assert(statuses.some((status) => status.status === 'reconnecting' || status.status === 'recovered'), 'bridge should emit reconnecting/recovered status');
  bridge.close('recovery_smoke_done');
  await delay(50);
  await server.close();

  const midTurnStatuses = [];
  const midTurnServer = await startRecoveryServer({ closeMidTurn: true });
  const midTurnBridge = createLocalDevOmniBridge((status) => midTurnStatuses.push(status));
  const midTurnResult = await midTurnBridge.send(createPacket(), midTurnServer.url, 2000);
  assert(midTurnResult.ok === false, 'mid-turn disconnect should fail the pending input_packet request');
  assert(midTurnStatuses.some((status) => status.status === 'reply_audio_frame'), 'mid-turn server should emit a reply_audio_frame before disconnect');
  assert(midTurnStatuses.some((status) => status.status === 'disconnected' && status.disconnectedDuringPending === true), 'mid-turn disconnect should be marked recoverable and pending');
  midTurnBridge.close('recovery_smoke_done');
  await delay(50);
  await midTurnServer.close();

  const failed = await createLocalDevOmniBridge(() => {}).send(createPacket(), 'ws://127.0.0.1:1/omni/realtime', 250);
  assert(failed.ok === false, 'send while disconnected/unreachable should return ok=false');

  console.log('LocalDev reconnect recovery smoke passed.');
}

main().catch((error) => {
  console.error(`LocalDev reconnect recovery smoke failed: ${error.message}`);
  process.exitCode = 1;
});
