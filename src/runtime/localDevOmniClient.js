import { createOmniInterrupt, normalizeOutputStateMessage, normalizeReplyAudioFrameMessage } from './omniOutputFrames.js';
import { createLocalDevControlEnvelope, createLocalDevInputEnvelope, createLocalDevMediaEnvelope, isLocalDevMediaAck, isLocalDevWebSocketEndpoint } from './localDevProtocol.js';
function createRequestId() {
  const rand = Math.random().toString(36).slice(2, 8);
  return `localdev_req_${Date.now().toString(36)}_${rand}`;
}

function nowIso() {
  return new Date().toISOString();
}

function getBrowserWebSocket() {
  if (typeof WebSocket === 'undefined') return null;
  return WebSocket;
}

function isSocketOpen(socket) {
  return socket && socket.readyState === WebSocket.OPEN;
}

function isSocketConnecting(socket) {
  return socket && socket.readyState === WebSocket.CONNECTING;
}

function normalizeOutputEnvelope(message) {
  if (message?.schema === 'cloudgenie.local_dev.envelope.v1' && message?.turn) {
    return {
      requestId: message.requestId || null,
      turn: message.turn,
      envelope: message
    };
  }
  if (message?.type === 'omni.output_turn' && message?.turn) {
    return {
      requestId: message.requestId || null,
      turn: message.turn,
      envelope: message
    };
  }
  return {
    requestId: message?.requestId || null,
    turn: message,
    envelope: message
  };
}

function normalizeMediaAck(message) {
  if (isLocalDevMediaAck(message)) {
    return { requestId: message.requestId || null, ack: message, receivedFrame: message.receivedFrame || null };
  }
  return null;
}

export function normalizeLocalDevOutputTurn(message, packet) {
  const now = nowIso();
  const output = normalizeOutputEnvelope(message);
  const data = output.turn?.schema === 'omni.output_turn.v1'
    ? output.turn
    : output.turn?.type === 'omni.output_turn'
      ? output.turn.turn
      : output.turn;

  return {
    turnId: data?.turnId || data?.turn_id || `local_turn_${Date.now().toString(36)}`,
    requestId: output.requestId,
    schema: 'omni.output_turn.v1',
    createdAt: data?.createdAt || data?.created_at || now,
    adapter: data?.adapter || packet?.routing?.adapter || 'LocalDevOmniAdapter',
    route: data?.route || packet?.routing?.route || 'local_dev_omni',
    reply_text: data?.reply_text || data?.replyText || data?.text || '',
    reply_audio: data?.reply_audio || data?.replyAudio || null,
    expression: data?.expression || {
      type: 'expression.update',
      expression: 'thinking',
      source: 'local_dev_omni_adapter'
    },
    tool_intents: data?.tool_intents || data?.toolIntents || [],
    transcript: data?.transcript || {
      partial_asr: '',
      usage: '字幕 / 日志 / 调试 / 插件关键词辅助'
    },
    notes: data?.notes || ['来自 LocalDevOmniAdapter WebSocket 的输出。'],
    transport: {
      requestId: output.requestId,
      envelopeSchema: output.envelope?.schema || null,
      receivedAt: now
    }
  };
}

export function createLocalDevOmniBridge(onStatus = () => {}) {
  let socket = null;
  let activeEndpoint = null;
  let connectPromise = null;
  let hadSuccessfulConnection = false;
  let lastDisconnectReason = null;
  const pending = new Map();

  function emit(patch) {
    onStatus({
      updatedAt: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
      ...patch
    });
  }

  function failPending(error) {
    for (const [requestId, item] of pending.entries()) {
      window.clearTimeout(item.timer);
      item.resolve({
        ok: false,
        endpoint: activeEndpoint,
        requestId,
        error
      });
    }
    pending.clear();
  }

  function createSendFailure(endpoint, action, error) {
    const message = error || `LocalDev WebSocket is not open; cannot send ${action}.`;
    emit({
      status: 'send_failed',
      endpoint,
      detail: `LocalDev send failed: ${action}`,
      action,
      error: message
    });
    return { ok: false, endpoint, error: message };
  }

  function safeSendJson(payload, endpoint, action) {
    if (!isSocketOpen(socket)) {
      return createSendFailure(endpoint, action, `LocalDev WebSocket is not open; cannot send ${action}.`);
    }
    try {
      socket.send(JSON.stringify(payload));
      return { ok: true };
    } catch (error) {
      return createSendFailure(endpoint, action, `LocalDev WebSocket send failed for ${action}: ${error?.message || String(error)}`);
    }
  }

  function close(reason = 'manual_close') {
    if (socket) {
      try {
        socket.close(1000, reason);
      } catch {
        // ignore close errors in demo bridge
      }
    }
    socket = null;
    connectPromise = null;
    lastDisconnectReason = reason;
    failPending(`LocalDev Adapter 连接已关闭：${reason}`);
    emit({
      status: 'disconnected',
      endpoint: activeEndpoint || '未配置',
      detail: `LocalDev WebSocket 已断开：${reason}`,
      error: null
    });
  }

  function connect(endpoint, timeoutMs = 5000) {
    const WebSocketImpl = getBrowserWebSocket();
    if (!WebSocketImpl) {
      return Promise.resolve({ ok: false, error: '当前环境不支持 WebSocket，无法连接 LocalDevOmniAdapter。', endpoint });
    }
    if (!isLocalDevWebSocketEndpoint(endpoint)) {
      return Promise.resolve({ ok: false, error: `LocalDevOmniAdapter endpoint 必须是 ws/wss 地址：${endpoint || '未配置'}`, endpoint });
    }

    if (socket && activeEndpoint === endpoint && socket.readyState === WebSocketImpl.OPEN) {
      emit({
        status: 'connected',
        endpoint,
        detail: '复用已保持的 LocalDev WebSocket 会话。',
        error: null
      });
      return Promise.resolve({ ok: true, endpoint, reused: true });
    }

    if (socket && activeEndpoint === endpoint && socket.readyState === WebSocketImpl.CONNECTING && connectPromise) {
      return connectPromise;
    }

    if (socket && activeEndpoint !== endpoint) {
      close('endpoint_changed');
    }

    activeEndpoint = endpoint;
    socket = new WebSocketImpl(endpoint);
    const recovering = hadSuccessfulConnection || Boolean(lastDisconnectReason);
    emit({
      status: 'connecting',
      endpoint,
      detail: '正在连接 LocalDev WebSocket，会话会保持到手动断开或切换机器人/endpoint。',
      error: null
    });
    if (recovering) {
      emit({
        status: 'reconnecting',
        endpoint,
        detail: 'Reconnecting LocalDev WebSocket after disconnect; old turns are not replayed automatically.',
        error: null
      });
    }

    connectPromise = new Promise((resolve) => {
      const timer = window.setTimeout(() => {
        if (isSocketOpen(socket)) return;
        const error = `LocalDevOmniAdapter 连接超时：${endpoint}`;
        emit({ status: 'failed', endpoint, detail: '连接超时。', error });
        try { socket?.close(); } catch {}
        resolve({ ok: false, endpoint, error });
      }, timeoutMs);

      socket.onopen = () => {
        window.clearTimeout(timer);
        const recovered = hadSuccessfulConnection || Boolean(lastDisconnectReason);
        hadSuccessfulConnection = true;
        lastDisconnectReason = null;
        emit({
          status: recovered ? 'recovered' : 'connected',
          endpoint,
          detail: 'LocalDev WebSocket 已连接并保持会话。',
          error: null
        });
        resolve({ ok: true, endpoint, reused: false });
      };

      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event?.data ?? event);
          const mediaAck = normalizeMediaAck(message);
          if (mediaAck) {
            emit({
              status: 'media_ack', endpoint, requestId: mediaAck.requestId,
              lastMediaFrameId: mediaAck.receivedFrame?.frameId,
              lastMediaFrameSchema: mediaAck.receivedFrame?.schema,
              mediaAck,
              detail: `已收到 LocalDev 媒体帧确认：${mediaAck.receivedFrame?.schema || 'unknown'} / ${mediaAck.receivedFrame?.frameId || 'unknown'}`,
              error: null
            });
            return;
          }

          const outputState = normalizeOutputStateMessage(message);
          if (outputState) {
            emit({
              status: 'output_state',
              endpoint,
              requestId: outputState.requestId,
              outputState: outputState.state,
              lastTurnId: outputState.state?.turnId,
              detail: `已收到 LocalDev 输出状态：${outputState.state?.state || 'unknown'} / ${outputState.state?.turnId || 'no_turn'}`,
              error: null
            });
            return;
          }

          const replyAudioFrame = normalizeReplyAudioFrameMessage(message);
          if (replyAudioFrame) {
            emit({
              status: 'reply_audio_frame',
              endpoint,
              requestId: replyAudioFrame.requestId,
              replyAudioFrame: replyAudioFrame.frame,
              lastTurnId: replyAudioFrame.frame?.turnId,
              lastReplyAudioFrameId: replyAudioFrame.frame?.frameId,
              detail: `已收到 LocalDev 输出音频帧：seq=${replyAudioFrame.frame?.sequence ?? 'unknown'} / ${replyAudioFrame.frame?.frameId || 'unknown'}`,
              error: null
            });
            return;
          }

          const looksLikeOutputTurn = (message?.schema === 'cloudgenie.local_dev.envelope.v1' && message?.type === 'omni.output_turn' && message?.turn)
            || (message?.type === 'omni.output_turn' && message?.turn)
            || message?.schema === 'omni.output_turn.v1';
          if (!looksLikeOutputTurn) {
            emit({
              status: 'protocol_warning',
              endpoint,
              requestId: message?.requestId || null,
              detail: `Unsupported LocalDev server message ignored: ${message?.schema || message?.type || 'unknown'}`,
              error: null
            });
            return;
          }

          const output = normalizeOutputEnvelope(message);
          const requestId = output.requestId;
          const pendingItem = requestId ? pending.get(requestId) : pending.values().next().value;
          if (!pendingItem) {
            emit({
              status: 'received',
              endpoint,
              requestId,
              detail: `收到未匹配到 pending 请求的 LocalDev 输出：${requestId || 'no_request_id'}`,
              error: null
            });
            return;
          }
          window.clearTimeout(pendingItem.timer);
          pending.delete(pendingItem.requestId);
          const turn = normalizeLocalDevOutputTurn(message, pendingItem.packet);
          emit({
            status: 'received',
            endpoint,
            requestId: pendingItem.requestId,
            lastPacketId: pendingItem.packet?.packetId,
            lastTurnId: turn.turnId,
            detail: `已收到 LocalDev 输出回合：${turn.turnId}`,
            error: null
          });
          pendingItem.resolve({
            ok: true,
            endpoint,
            requestId: pendingItem.requestId,
            reused: pendingItem.reused,
            turn
          });
        } catch (error) {
          const message = `LocalDevOmniAdapter 返回了无法解析的消息：${error?.message || String(error)}`;
          emit({ status: 'failed', endpoint, detail: '返回解析失败。', error: message });
          // Keep the socket open after malformed service JSON so the next valid message can recover.
        }
      };

      socket.onerror = () => {
        window.clearTimeout(timer);
        const error = `无法连接 LocalDevOmniAdapter：${endpoint}`;
        emit({ status: 'failed', endpoint, detail: 'WebSocket error。', error });
        resolve({ ok: false, endpoint, error });
      };

      socket.onclose = () => {
        window.clearTimeout(timer);
        const wasPending = pending.size > 0;
        lastDisconnectReason = wasPending ? 'pending_output_disconnected' : 'socket_closed';
        if (wasPending) failPending(`LocalDevOmniAdapter 在返回输出前关闭连接：${endpoint}`);
        emit({
          status: 'disconnected',
          endpoint,
          disconnectedDuringPending: wasPending,
          recoverable: true,
          detail: wasPending ? '连接在返回输出前断开。' : 'LocalDev WebSocket 已断开。',
          error: wasPending ? `LocalDevOmniAdapter 在返回输出前关闭连接：${endpoint}` : null
        });
        connectPromise = null;
        socket = null;
      };
    });

    return connectPromise;
  }

  async function send(packet, endpoint, timeoutMs = 5000) {
    const connected = await connect(endpoint, timeoutMs);
    if (!connected.ok) return connected;
    if (!isSocketOpen(socket)) {
      return {
        ok: false,
        endpoint,
        error: `LocalDev WebSocket 当前不是 open 状态，无法发送：${endpoint}`
      };
    }

    const requestId = createRequestId();
    const envelope = createLocalDevInputEnvelope({
      requestId,
      sentAt: nowIso(),
      packet
    });

    emit({
      status: 'sending',
      endpoint,
      requestId,
      lastPacketId: packet?.packetId,
      detail: `正在发送 ${packet?.schema || 'unknown'} / ${packet?.packetId || 'unknown'}。`,
      error: null
    });

    return new Promise((resolve) => {
      const timer = window.setTimeout(() => {
        pending.delete(requestId);
        const error = `LocalDevOmniAdapter 等待输出超时：${endpoint}`;
        emit({ status: 'failed', endpoint, requestId, detail: '等待输出超时。', error });
        resolve({ ok: false, endpoint, requestId, error });
      }, timeoutMs);

      pending.set(requestId, { requestId, packet, timer, resolve, reused: connected.reused });
      const sent = safeSendJson(envelope, endpoint, 'omni.input_packet');
      if (!sent.ok) {
        window.clearTimeout(timer);
        pending.delete(requestId);
        resolve({ ...sent, requestId });
      }
    });
  }

  async function sendMediaFrame(frame, endpoint, timeoutMs = 5000) {
    const connected = await connect(endpoint, timeoutMs);
    if (!connected.ok) return connected;
    if (!isSocketOpen(socket)) {
      return { ok: false, endpoint, error: `LocalDev WebSocket 当前不是 open 状态，无法发送媒体帧：${endpoint}` };
    }
    const requestId = createRequestId();
    const envelope = createLocalDevMediaEnvelope({ requestId, sentAt: nowIso(), frame });
    emit({ status: 'media_sending', endpoint, requestId, lastMediaFrameId: frame?.frameId, lastMediaFrameSchema: frame?.schema, detail: `正在发送媒体帧 ${frame?.schema || 'unknown'} / ${frame?.frameId || 'unknown'}。`, error: null });
    const sent = safeSendJson(envelope, endpoint, frame?.schema || 'media_frame');
    if (!sent.ok) return { ...sent, requestId, frameId: frame?.frameId, frameSchema: frame?.schema };
    return { ok: true, endpoint, requestId, frameId: frame?.frameId, frameSchema: frame?.schema, reused: connected.reused };
  }


  async function sendInterrupt(seed = {}, endpoint, timeoutMs = 5000) {
    const connected = await connect(endpoint, timeoutMs);
    if (!connected.ok) return connected;
    if (!isSocketOpen(socket)) {
      return { ok: false, endpoint, error: `LocalDev WebSocket 当前不是 open 状态，无法发送 interrupt：${endpoint}` };
    }
    const requestId = createRequestId();
    const interrupt = createOmniInterrupt({
      ...seed,
      requestId,
      source: seed.source || 'client_runtime',
      reason: seed.reason || 'user_barge_in'
    });
    const envelope = createLocalDevControlEnvelope({
      requestId,
      sentAt: nowIso(),
      interrupt
    });
    emit({
      status: 'interrupt_sending',
      endpoint,
      requestId,
      lastInterruptId: interrupt.interruptId,
      lastTurnId: interrupt.turnId || seed.turnId || null,
      detail: `正在发送 omni.interrupt.v1：${interrupt.reason}。`,
      error: null
    });
    const sent = safeSendJson(envelope, endpoint, 'omni.interrupt');
    if (!sent.ok) return { ...sent, requestId, interrupt };
    emit({
      status: 'interrupt_sent',
      endpoint,
      requestId,
      lastInterruptId: interrupt.interruptId,
      lastTurnId: interrupt.turnId || seed.turnId || null,
      detail: '已发送 omni.interrupt.v1；等待服务端返回 output_state=interrupted。',
      error: null
    });
    return { ok: true, endpoint, requestId, interrupt, reused: connected.reused };
  }

  return {
    connect,
    send,
    sendMediaFrame,
    sendInterrupt,
    close,
    getStatus() {
      return {
        endpoint: activeEndpoint,
        socketState: socket?.readyState ?? null,
        connected: isSocketOpen(socket),
        connecting: isSocketConnecting(socket),
        pending: pending.size,
        lastDisconnectReason
      };
    }
  };
}

export function sendPacketToLocalDevOmni(packet, endpoint, timeoutMs = 5000) {
  const bridge = createLocalDevOmniBridge();
  return bridge.send(packet, endpoint, timeoutMs);
}
