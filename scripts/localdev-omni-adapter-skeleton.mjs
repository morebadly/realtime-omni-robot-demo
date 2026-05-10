#!/usr/bin/env node
import { WebSocketServer } from 'ws';
import { createOmniOutputState, createReplyAudioFrame, normalizeInterruptMessage } from '../src/runtime/omniOutputFrames.js';
import {
  createLocalDevMediaAck,
  createLocalDevOutputEnvelope,
  normalizeLocalDevInputPacket,
  normalizeLocalDevMediaFrame
} from '../src/runtime/localDevProtocol.js';
import { createLocalDevOmniProvider, listLocalDevProviderKeys } from './localdev-omni-provider-registry.mjs';

const PORT = Number(process.env.LOCALDEV_OMNI_PORT || 8000);
const PATH = process.env.LOCALDEV_OMNI_PATH || '/omni/realtime';
const HOST = process.env.LOCALDEV_OMNI_HOST || '0.0.0.0';

function now() {
  return new Date().toISOString();
}

function safeParse(raw) {
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch (error) {
    return { ok: false, error };
  }
}

function socketSend(socket, payload) {
  if (socket.readyState !== 1) return false;
  socket.send(JSON.stringify(payload));
  return true;
}

function getSession(socket) {
  if (!socket.__localDevAdapterSession) {
    socket.__localDevAdapterSession = {
      activeTurn: null,
      provider: createLocalDevOmniProvider()
    };
    const provider = socket.__localDevAdapterSession.provider;
    const config = provider.config
      ? ` endpoint=${provider.config.endpoint || 'not_configured'} transport=${provider.config.transport} timeoutMs=${provider.config.timeoutMs} dryRun=${provider.config.dryRun}`
      : '';
    console.log(`[${now()}] provider selected=${provider.selectedKey} name=${provider.name} fallback=${provider.fallbackUsed ? 'yes' : 'no'}${config}`);
  }
  return socket.__localDevAdapterSession;
}

function describeProviderStatus(provider) {
  const config = provider.config
    ? `endpoint=${provider.config.endpoint || 'not_configured'} transport=${provider.config.transport} timeoutMs=${provider.config.timeoutMs} dryRun=${provider.config.dryRun}`
    : 'no provider config';
  const realtime = typeof provider.realtimeClient?.getStatus === 'function'
    ? provider.realtimeClient.getStatus()
    : null;
  const realtimeText = realtime
    ? `realtime connected=${realtime.connected} session=${realtime.sessionId || 'none'} input=${realtime.inputPackets} audio=${realtime.audioFrames} camera=${realtime.cameraFrames} interrupts=${realtime.interrupts} lastError=${realtime.lastError || 'none'}`
    : 'realtime status unavailable';
  return `${provider.name} (${provider.kind}) ${config}; ${realtimeText}`;
}

function cancelActiveTurn(socket, reason = 'new_turn_or_interrupt') {
  const session = getSession(socket);
  const active = session.activeTurn;
  if (!active) return null;
  active.cancelled = true;
  active.timers.forEach((timer) => clearTimeout(timer));
  session.activeTurn = null;
  return { ...active, reason };
}

function withAdapterIdentity(frame, { requestId, robotId, displayName }) {
  return {
    ...frame,
    requestId: frame.requestId || requestId,
    robotId: frame.robotId || robotId,
    displayName: frame.displayName || displayName,
    guardrails: {
      realtimeOutputFirst: true,
      notTtsPipeline: true,
      replyTextIsSubtitleOnly: true,
      ...(frame.guardrails || {})
    }
  };
}

async function streamProviderOutput(socket, packetInfo) {
  const session = getSession(socket);
  const packet = packetInfo.packet;
  const requestId = packetInfo.requestId || null;
  const robotId = packet.identity?.robotId || null;
  const displayName = packet.identity?.displayName || null;

  cancelActiveTurn(socket, 'new_input_packet');
  const activeTurn = {
    turnId: `pending_${Date.now().toString(36)}`,
    requestId,
    robotId,
    displayName,
    timers: [],
    cancelled: false,
    realtimeAudioFrames: 0,
    speakingStarted: false
  };
  session.activeTurn = activeTurn;

  socketSend(socket, createOmniOutputState({
    turnId: activeTurn.turnId,
    requestId,
    robotId,
    displayName,
    state: 'thinking',
    reason: `Adapter skeleton received omni.input_packet.v1 and entered ${describeProviderStatus(session.provider)} thinking.`
  }));

  const unsubscribeReplyAudio = typeof session.provider.onReplyAudioFrame === 'function'
    ? session.provider.onReplyAudioFrame((frame) => {
      if (activeTurn.cancelled || session.activeTurn !== activeTurn) return;
      const outputFrame = withAdapterIdentity(frame, { requestId, robotId, displayName });
      if (!activeTurn.speakingStarted) {
        activeTurn.speakingStarted = true;
        socketSend(socket, createOmniOutputState({
          turnId: outputFrame.turnId || activeTurn.turnId,
          requestId,
          robotId,
          displayName,
          state: 'speaking',
          reason: `Adapter skeleton is forwarding native ${describeProviderStatus(session.provider)} omni.reply_audio_frame.v1 output.`
        }));
      }
      activeTurn.realtimeAudioFrames += 1;
      socketSend(socket, outputFrame);
    })
    : () => {};

  const turn = await session.provider.runInference({ packet, requestId });
  activeTurn.turnId = turn.turnId;
  const providerFailed = turn.providerStatus && turn.providerStatus.ok === false;
  if (providerFailed) {
    unsubscribeReplyAudio();
    session.activeTurn = null;
    socketSend(socket, createOmniOutputState({
      turnId: turn.turnId,
      requestId,
      robotId,
      displayName,
      state: 'error',
      reason: `${session.provider.name} failed: ${turn.providerStatus.code} / ${turn.providerStatus.error}; ${describeProviderStatus(session.provider)}`
    }));
    socketSend(socket, createLocalDevOutputEnvelope({
      requestId,
      packet,
      turn,
      receivedAt: now()
    }));
    return;
  }

  socketSend(socket, createLocalDevOutputEnvelope({
    requestId,
    packet,
    turn,
    receivedAt: now()
  }));

  const audioPlan = session.provider.createReplyAudioPlan({ turn, packet, requestId });
  if (!audioPlan.length) {
    unsubscribeReplyAudio();
    session.activeTurn = null;
    socketSend(socket, createOmniOutputState({
      turnId: turn.turnId,
      requestId,
      robotId,
      displayName,
      state: 'finished',
      reason: activeTurn.realtimeAudioFrames
        ? `${describeProviderStatus(session.provider)} native reply_audio_frame output finished.`
        : `${describeProviderStatus(session.provider)} returned no reply_audio_frame plan; output turn finished without audio.`
    }));
    return;
  }
  if (!activeTurn.speakingStarted) {
    activeTurn.speakingStarted = true;
    socketSend(socket, createOmniOutputState({
      turnId: turn.turnId,
      requestId,
      robotId,
      displayName,
      state: 'speaking',
      reason: `Adapter skeleton is streaming ${describeProviderStatus(session.provider)} omni.reply_audio_frame.v1 output.`
    }));
  }
  for (const item of audioPlan) {
    const timer = setTimeout(() => {
      if (activeTurn.cancelled || session.activeTurn?.turnId !== turn.turnId) return;
      const frame = createReplyAudioFrame({
        turnId: turn.turnId,
        requestId,
        robotId,
        displayName,
        sequence: item.sequence,
        isFinal: item.isFinal,
        payloadBase64: item.payloadBase64,
        byteLength: item.byteLength,
        sampleRate: item.sampleRate,
        channels: item.channels,
        durationMs: item.durationMs,
        source: 'local_dev_adapter_skeleton'
      });
      socketSend(socket, frame);
      if (frame.isFinal) {
        unsubscribeReplyAudio();
        session.activeTurn = null;
        socketSend(socket, createOmniOutputState({
          turnId: turn.turnId,
          requestId,
          robotId,
          displayName,
          state: 'finished',
          reason: 'Adapter skeleton placeholder reply_audio_frame stream finished.'
        }));
      }
    }, item.delayMs);
    activeTurn.timers.push(timer);
  }
}

async function handleMediaFrame(socket, frameInfo) {
  const session = getSession(socket);
  const frame = frameInfo.frame;
  await session.provider.observeMediaFrame(frame, frameInfo.requestId);
  socketSend(socket, createLocalDevMediaAck({ requestId: frameInfo.requestId, frame, receivedAt: now() }));
  console.log(`[${now()}] media kind=${frame.media?.kind || 'unknown'} schema=${frame.schema} frame=${frame.frameId} bytes=${frame.media?.byteLength || 0}`);
}

async function handleInterrupt(socket, interruptInfo) {
  const interrupted = cancelActiveTurn(socket, interruptInfo?.interrupt?.reason || 'user_barge_in');
  const interrupt = interruptInfo?.interrupt || {};
  if (typeof getSession(socket).provider.sendInterrupt === 'function') {
    await getSession(socket).provider.sendInterrupt(interrupt);
  }
  socketSend(socket, createOmniOutputState({
    turnId: interrupted?.turnId || interrupt.turnId || null,
    requestId: interruptInfo?.requestId || interrupt.requestId || interrupted?.requestId || null,
    robotId: interrupted?.robotId || interrupt.robotId || null,
    displayName: interrupted?.displayName || interrupt.displayName || null,
    state: 'interrupted',
    reason: interrupted
      ? `Adapter skeleton interrupted active output: ${interrupt.reason || 'user_barge_in'}`
      : 'Adapter skeleton received interrupt but no output turn was active.'
  }));
}

const server = new WebSocketServer({ host: HOST, port: PORT, path: PATH });

server.on('connection', (socket, request) => {
  console.log(`[${now()}] LocalDev Adapter Skeleton connected: ${request.socket.remoteAddress}`);
  getSession(socket);

  socket.on('message', (raw) => {
    const parsed = safeParse(raw.toString());
    if (!parsed.ok) {
      socketSend(socket, createOmniOutputState({ state: 'error', reason: `Invalid JSON: ${parsed.error.message}` }));
      return;
    }

    const interruptInfo = normalizeInterruptMessage(parsed.value);
    if (interruptInfo?.interrupt) {
      handleInterrupt(socket, interruptInfo).catch((error) => {
        socketSend(socket, createOmniOutputState({ state: 'error', reason: `Interrupt handling failed: ${error?.message || String(error)}` }));
      });
      return;
    }

    const mediaInfo = normalizeLocalDevMediaFrame(parsed.value);
    if (mediaInfo?.frame) {
      handleMediaFrame(socket, mediaInfo).catch((error) => {
        socketSend(socket, createOmniOutputState({ state: 'error', reason: `Media frame handling failed: ${error?.message || String(error)}` }));
      });
      return;
    }

    const packetInfo = normalizeLocalDevInputPacket(parsed.value);
    if (packetInfo?.packet) {
      console.log(`[${now()}] input_packet packet=${packetInfo.packet.packetId || 'unknown'} robot=${packetInfo.packet.identity?.robotId || 'unknown'} request=${packetInfo.requestId || 'none'}`);
      streamProviderOutput(socket, packetInfo).catch((error) => {
        const turnId = `provider_throw_${Date.now().toString(36)}`;
        socketSend(socket, createOmniOutputState({
          turnId,
          requestId: packetInfo.requestId || null,
          robotId: packetInfo.packet?.identity?.robotId || null,
          displayName: packetInfo.packet?.identity?.displayName || null,
          state: 'error',
          reason: `Adapter skeleton provider failed: ${error?.message || String(error)}`
        }));
        socketSend(socket, createLocalDevOutputEnvelope({
          requestId: packetInfo.requestId || null,
          packet: packetInfo.packet,
          receivedAt: now(),
          turn: {
            schema: 'omni.output_turn.v1',
            turnId,
            requestId: packetInfo.requestId || null,
            createdAt: now(),
            adapter: 'LocalDevOmniAdapterSkeleton',
            route: packetInfo.packet?.routing?.route || 'local_dev_omni',
            reply_text: `Adapter provider exception: ${error?.message || String(error)}`,
            reply_audio: null,
            expression: { type: 'expression.update', expression: 'error', source: 'local_dev_adapter_skeleton' },
            tool_intents: [],
            transcript: { partial_asr: '', usage: 'subtitles_logs_debug_only' },
            providerStatus: { ok: false, code: 'provider_exception', error: error?.message || String(error) },
            notes: ['Provider exception was normalized into output_state=error and omni.output_turn.v1.']
          }
        }));
      });
      return;
    }

    socketSend(socket, createOmniOutputState({
      state: 'error',
      reason: 'Unsupported LocalDev message. Expected input_packet, media_frame, or interrupt envelope.'
    }));
  });

  socket.on('close', () => {
    cancelActiveTurn(socket, 'socket_closed');
    console.log(`[${now()}] LocalDev Adapter Skeleton disconnected`);
  });
});

server.on('listening', () => {
  console.log(`LocalDev Adapter Skeleton listening on ws://${HOST}:${PORT}${PATH}`);
  console.log('This is a contract-compatible placeholder, not real Qwen-Omni inference.');
  console.log(`Provider selection: LOCALDEV_OMNI_PROVIDER=${process.env.LOCALDEV_OMNI_PROVIDER || 'placeholder'}; available=${listLocalDevProviderKeys().join(', ')}`);
});

server.on('error', (error) => {
  console.error(`[${now()}] LocalDev Adapter Skeleton error:`, error);
  process.exitCode = 1;
});
