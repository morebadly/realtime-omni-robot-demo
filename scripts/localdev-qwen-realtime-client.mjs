import { createQwenRealtimeTransport } from './localdev-qwen-realtime-transport.mjs';

export function createQwenRealtimeClient(config = {}) {
  const transport = createQwenRealtimeTransport(config);
  const state = {
    transport: transport.name,
    connected: false,
    sessionId: null,
    inputPackets: 0,
    audioFrames: 0,
    cameraFrames: 0,
    interrupts: 0,
    lastError: null
  };

  function snapshot() {
    return { ...state };
  }

  async function connect() {
    const result = await transport.connect();
    state.connected = Boolean(result.ok);
    state.sessionId = result.sessionId || state.sessionId;
    state.lastError = result.ok ? null : result.error;
    return { ...result, state: snapshot() };
  }

  async function ensureSession() {
    if (state.connected) return { ok: true, state: snapshot() };
    return connect();
  }

  async function sendInputPacket(packet, requestId) {
    const ready = await ensureSession();
    state.inputPackets += 1;
    if (!ready.ok) return { ...ready, requestId };
    const result = await transport.sendInputPacket(packet, requestId);
    state.lastError = result.ok ? null : result.error;
    return { ...result, requestId, packetId: packet?.packetId || result.packetId || null, state: snapshot() };
  }

  async function sendMediaFrame(frame, requestId) {
    const ready = await ensureSession();
    if (frame?.schema === 'omni.camera_frame.v1') state.cameraFrames += 1;
    else state.audioFrames += 1;
    if (!ready.ok) return { ...ready, requestId, frameId: frame?.frameId || null };
    const result = await transport.sendMediaFrame(frame, requestId);
    state.lastError = result.ok ? null : result.error;
    return { ...result, requestId, frameId: frame?.frameId || result.frameId || null, frameSchema: frame?.schema || result.frameSchema || null, state: snapshot() };
  }

  async function sendInterrupt(interrupt) {
    const ready = await ensureSession();
    state.interrupts += 1;
    if (!ready.ok) return { ...ready, interruptId: interrupt?.interruptId || null };
    const result = await transport.sendInterrupt(interrupt);
    state.lastError = result.ok ? null : result.error;
    return { ...result, interruptId: interrupt?.interruptId || result.interruptId || null, state: snapshot() };
  }

  async function close(reason = 'manual_close') {
    const result = await transport.close(reason);
    state.connected = false;
    state.sessionId = null;
    state.lastError = result.ok ? null : result.error;
    return { ...result, reason, state: snapshot() };
  }

  return {
    connect,
    ensureSession,
    sendInputPacket,
    sendMediaFrame,
    sendInterrupt,
    close,
    getStatus: snapshot
  };
}
