function createSessionId() {
  return `qwen_rt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
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

export function createQwenRealtimeTransport(config = {}) {
  if (config.dryRun) return createDryRunRealtimeTransport(config);
  if (config.transport === 'loopback') return createLoopbackRealtimeTransport(config);
  return createUnimplementedRealtimeTransport(config);
}
