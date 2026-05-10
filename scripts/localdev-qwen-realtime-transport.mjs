import WebSocket from 'ws';

function createSessionId() {
  return `qwen_rt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function isOpen(socket) {
  return socket?.readyState === WebSocket.OPEN;
}

function createRealtimeMessage({ type, sessionId, requestId = null, packet = null, frame = null, interrupt = null }) {
  return {
    schema: 'localdev.qwen.realtime_message.v1',
    type,
    sessionId,
    requestId,
    sentAt: nowIso(),
    packetSchema: packet?.schema || null,
    packetId: packet?.packetId || null,
    frameSchema: frame?.schema || null,
    frameId: frame?.frameId || null,
    interruptSchema: interrupt?.schema || null,
    interruptId: interrupt?.interruptId || null,
    packet,
    frame,
    interrupt,
    guardrails: {
      realtimeSession: true,
      rawAudioStreamFirst: type !== 'input_packet',
      selectedFramesGoToOmniAdapter: type !== 'input_packet',
      replyTextIsNotSpeechSource: true
    }
  };
}

function sendJson(socket, payload) {
  return new Promise((resolve) => {
    if (!isOpen(socket)) {
      resolve({ ok: false, code: 'qwen_ws_not_connected', error: 'WebSocket transport is not connected.' });
      return;
    }
    socket.send(JSON.stringify(payload), (error) => {
      if (error) {
        resolve({ ok: false, code: 'qwen_ws_send_failed', error: error.message });
        return;
      }
      resolve({ ok: true });
    });
  });
}

function normalizeOutputTurnMessage(message) {
  if (message?.schema === 'omni.output_turn.v1') return message;
  if (message?.turn?.schema === 'omni.output_turn.v1') return message.turn;
  if (message?.outputTurn?.schema === 'omni.output_turn.v1') return message.outputTurn;
  return null;
}

function normalizeReplyAudioFrameMessage(message) {
  if (message?.schema === 'omni.reply_audio_frame.v1') return message;
  if (message?.frame?.schema === 'omni.reply_audio_frame.v1') return message.frame;
  if (message?.replyAudioFrame?.schema === 'omni.reply_audio_frame.v1') return message.replyAudioFrame;
  return null;
}

export function createDryRunRealtimeTransport(config = {}) {
  return {
    name: 'dry_run_realtime_transport',

    async connect() {
      if (!config.endpoint) {
        return { ok: false, code: 'qwen_endpoint_not_configured', error: 'LOCALDEV_QWEN_ENDPOINT is not configured.' };
      }
      return { ok: false, code: 'qwen_dry_run', error: 'LOCALDEV_QWEN_DRY_RUN is enabled; realtime model session was not opened.' };
    },

    async sendInputPacket() {
      return { ok: false, code: 'qwen_dry_run', error: 'Dry-run transport cannot send input packets.' };
    },

    async sendMediaFrame() {
      return { ok: false, code: 'qwen_dry_run', error: 'Dry-run transport cannot send media frames.' };
    },

    async sendInterrupt() {
      return { ok: false, code: 'qwen_dry_run', error: 'Dry-run transport cannot send interrupts.' };
    },

    async close(reason = 'manual_close') {
      return { ok: true, reason };
    }
  };
}

export function createUnimplementedRealtimeTransport(config = {}) {
  return {
    name: `${config.transport || 'unknown'}_realtime_transport_unimplemented`,

    async connect() {
      if (!config.endpoint) {
        return { ok: false, code: 'qwen_endpoint_not_configured', error: 'LOCALDEV_QWEN_ENDPOINT is not configured.' };
      }
      return {
        ok: false,
        code: 'qwen_realtime_transport_not_implemented',
        error: `Realtime transport ${config.transport || 'unknown'} is not implemented in this demo client yet.`
      };
    },

    async sendInputPacket() {
      return { ok: false, code: 'qwen_realtime_transport_not_implemented', error: 'Realtime input packet transport is not implemented yet.' };
    },

    async sendMediaFrame() {
      return { ok: false, code: 'qwen_realtime_transport_not_implemented', error: 'Realtime media frame transport is not implemented yet.' };
    },

    async sendInterrupt() {
      return { ok: false, code: 'qwen_realtime_transport_not_implemented', error: 'Realtime interrupt transport is not implemented yet.' };
    },

    async close(reason = 'manual_close') {
      return { ok: true, reason };
    }
  };
}

export function createLoopbackRealtimeTransport() {
  let connected = false;
  let sessionId = null;

  return {
    name: 'loopback_realtime_transport',

    async connect() {
      connected = true;
      sessionId = sessionId || createSessionId();
      return { ok: true, sessionId };
    },

    async sendInputPacket(packet, requestId) {
      if (!connected) return { ok: false, code: 'qwen_loopback_not_connected', error: 'Loopback transport is not connected.' };
      return { ok: true, sessionId, requestId, packetId: packet?.packetId || null };
    },

    async sendMediaFrame(frame, requestId) {
      if (!connected) return { ok: false, code: 'qwen_loopback_not_connected', error: 'Loopback transport is not connected.' };
      return { ok: true, sessionId, requestId, frameId: frame?.frameId || null, frameSchema: frame?.schema || null };
    },

    async sendInterrupt(interrupt) {
      if (!connected) return { ok: false, code: 'qwen_loopback_not_connected', error: 'Loopback transport is not connected.' };
      return { ok: true, sessionId, interruptId: interrupt?.interruptId || null };
    },

    async close(reason = 'manual_close') {
      connected = false;
      return { ok: true, reason, sessionId };
    }
  };
}

export function createWebSocketJsonRealtimeTransport(config = {}) {
  let socket = null;
  let connected = false;
  let sessionId = null;
  const inboundMessages = [];
  const waiters = [];

  function pushInboundMessage(message) {
    inboundMessages.push(message);
    const replyAudioFrame = normalizeReplyAudioFrameMessage(message);
    if (replyAudioFrame && typeof config.onReplyAudioFrame === 'function') {
      config.onReplyAudioFrame(replyAudioFrame);
    }
    for (const waiter of [...waiters]) {
      if (!waiter.predicate(message)) continue;
      clearTimeout(waiter.timer);
      waiters.splice(waiters.indexOf(waiter), 1);
      waiter.resolve({ ok: true, message });
    }
  }

  function waitForMessage(predicate, timeoutMs = config.timeoutMs || 15000) {
    const existing = inboundMessages.find(predicate);
    if (existing) return Promise.resolve({ ok: true, message: existing });
    return new Promise((resolve) => {
      const waiter = {
        predicate,
        resolve,
        timer: setTimeout(() => {
          waiters.splice(waiters.indexOf(waiter), 1);
          resolve({ ok: false, code: 'qwen_ws_output_timeout', error: 'Timed out waiting for realtime provider output.' });
        }, timeoutMs)
      };
      waiters.push(waiter);
    });
  }

  function closeSocket() {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.close();
    }
    socket = null;
    connected = false;
  }

  return {
    name: 'websocket_json_realtime_transport',

    async connect() {
      if (!config.endpoint) {
        return { ok: false, code: 'qwen_endpoint_not_configured', error: 'LOCALDEV_QWEN_ENDPOINT is not configured.' };
      }
      if (!/^wss?:\/\//.test(config.endpoint)) {
        return { ok: false, code: 'qwen_ws_endpoint_invalid', error: `WebSocket transport requires ws:// or wss:// endpoint, got ${config.endpoint}.` };
      }
      if (connected && isOpen(socket)) return { ok: true, sessionId };

      sessionId = sessionId || createSessionId();
      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          closeSocket();
          resolve({ ok: false, code: 'qwen_ws_connect_timeout', error: `Timed out connecting to ${config.endpoint}.` });
        }, config.timeoutMs || 15000);

        socket = new WebSocket(config.endpoint);
        socket.on('message', (raw) => {
          try {
            pushInboundMessage(JSON.parse(raw.toString()));
          } catch (error) {
            pushInboundMessage({ schema: 'invalid_json', error: error.message, raw: raw.toString() });
          }
        });
        socket.once('open', async () => {
          clearTimeout(timeout);
          connected = true;
          const result = await sendJson(socket, createRealtimeMessage({ type: 'session.start', sessionId }));
          if (!result.ok) {
            closeSocket();
            resolve(result);
            return;
          }
          resolve({ ok: true, sessionId });
        });
        socket.once('error', (error) => {
          clearTimeout(timeout);
          closeSocket();
          resolve({ ok: false, code: 'qwen_ws_connect_failed', error: error.message });
        });
        socket.once('close', () => {
          connected = false;
        });
      });
    },

    async sendInputPacket(packet, requestId) {
      if (!connected || !isOpen(socket)) return { ok: false, code: 'qwen_ws_not_connected', error: 'WebSocket transport is not connected.' };
      const result = await sendJson(socket, createRealtimeMessage({ type: 'input_packet', sessionId, requestId, packet }));
      return { ...result, sessionId, requestId, packetId: packet?.packetId || null };
    },

    async sendMediaFrame(frame, requestId) {
      if (!connected || !isOpen(socket)) return { ok: false, code: 'qwen_ws_not_connected', error: 'WebSocket transport is not connected.' };
      const messageType = frame?.schema === 'omni.camera_frame.v1' ? 'camera_frame' : 'audio_frame';
      const result = await sendJson(socket, createRealtimeMessage({ type: messageType, sessionId, requestId, frame }));
      return { ...result, sessionId, requestId, frameId: frame?.frameId || null, frameSchema: frame?.schema || null };
    },

    async sendInterrupt(interrupt) {
      if (!connected || !isOpen(socket)) return { ok: false, code: 'qwen_ws_not_connected', error: 'WebSocket transport is not connected.' };
      const result = await sendJson(socket, createRealtimeMessage({ type: 'interrupt', sessionId, requestId: interrupt?.requestId || null, interrupt }));
      return { ...result, sessionId, interruptId: interrupt?.interruptId || null };
    },

    async close(reason = 'manual_close') {
      if (isOpen(socket)) {
        await sendJson(socket, createRealtimeMessage({ type: 'session.close', sessionId, interrupt: { reason } }));
      }
      closeSocket();
      return { ok: true, reason, sessionId };
    },

    async waitForOutputTurn({ requestId = null, timeoutMs = config.timeoutMs || 15000 } = {}) {
      const result = await waitForMessage((message) => {
        const turn = normalizeOutputTurnMessage(message);
        if (!turn) return false;
        return !requestId || turn.requestId === requestId || message.requestId === requestId;
      }, timeoutMs);
      if (!result.ok) return result;
      return { ok: true, output: normalizeOutputTurnMessage(result.message), raw: result.message, sessionId };
    },

    getReplyAudioFrames({ requestId = null } = {}) {
      return inboundMessages
        .map((message) => normalizeReplyAudioFrameMessage(message))
        .filter((frame) => frame && (!requestId || frame.requestId === requestId));
    },

    getReceivedMessages() {
      return [...inboundMessages];
    }
  };
}

export function createQwenRealtimeTransport(config = {}) {
  if (config.dryRun) return createDryRunRealtimeTransport(config);
  if (config.transport === 'loopback') return createLoopbackRealtimeTransport(config);
  if (config.transport === 'websocket_json' || config.transport === 'ws_json') return createWebSocketJsonRealtimeTransport(config);
  return createUnimplementedRealtimeTransport(config);
}
