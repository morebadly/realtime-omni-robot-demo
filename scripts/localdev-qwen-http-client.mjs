function numberFromEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function createQwenProviderConfig() {
  return {
    endpoint: process.env.LOCALDEV_QWEN_ENDPOINT || '',
    transport: process.env.LOCALDEV_QWEN_TRANSPORT || 'http_json',
    timeoutMs: numberFromEnv('LOCALDEV_QWEN_TIMEOUT_MS', 15000),
    dryRun: process.env.LOCALDEV_QWEN_DRY_RUN !== '0'
  };
}

export function createQwenProviderRequest({ packet, mediaSnapshot, requestId }) {
  return {
    requestId,
    protocol: 'localdev.qwen.request.v1',
    packet,
    media: {
      audioFrames: mediaSnapshot?.audioFrames || 0,
      cameraFrames: mediaSnapshot?.cameraFrames || 0,
      lastAudioFrame: mediaSnapshot?.lastAudioFrame || null,
      lastCameraFrame: mediaSnapshot?.lastCameraFrame || null
    },
    guardrails: {
      omniFirst: true,
      asrTextIsNotPrimaryInput: true,
      replyTextIsSubtitleOnly: true,
      toolIntentsMustReturnToRuntime: true
    }
  };
}

export function normalizeQwenProviderResult(result = {}, { packet, requestId, config, mediaSnapshot, realtimeStatus } = {}) {
  const providerStatus = result.providerStatus || { ok: true, code: 'ok', error: null };
  const expression = typeof result.expression === 'string'
    ? { type: 'expression.update', expression: result.expression, source: 'local_dev_qwen_provider' }
    : result.expression || { type: 'expression.update', expression: 'thinking', source: 'local_dev_qwen_provider' };

  return {
    schema: 'omni.output_turn.v1',
    turnId: result.turnId || result.turn_id || `qwen_turn_${Date.now().toString(36)}`,
    requestId,
    createdAt: result.createdAt || result.created_at || new Date().toISOString(),
    adapter: result.adapter || 'LocalDevQwenOmniProvider',
    route: result.route || packet?.routing?.route || 'local_dev_omni',
    reply_text: result.reply_text || result.replyText || result.text || '',
    reply_audio: null,
    expression,
    tool_intents: result.tool_intents || result.toolIntents || [],
    transcript: result.transcript || {
      partial_asr: '',
      usage: 'subtitles_logs_debug_only'
    },
    providerResult: {
      ...providerStatus,
      transport: config?.transport || 'unknown',
      endpoint: config?.endpoint || 'not_configured',
      dryRun: Boolean(config?.dryRun),
      realtimeStatus: realtimeStatus || null,
      replyAudioFrameCount: result.reply_audio_frames?.length || result.replyAudioFrames?.length || 0
    },
    providerStatus,
    notes: [
      ...(result.notes || []),
      `Qwen provider normalized result. observed_media audio=${mediaSnapshot?.audioFrames || 0}, camera=${mediaSnapshot?.cameraFrames || 0}.`,
      realtimeStatus ? `Realtime boundary status: connected=${realtimeStatus.connected}, session=${realtimeStatus.sessionId || 'none'}, input=${realtimeStatus.inputPackets || 0}, audio=${realtimeStatus.audioFrames || 0}, camera=${realtimeStatus.cameraFrames || 0}, interrupts=${realtimeStatus.interrupts || 0}.` : 'Realtime boundary status is not available.',
      'Native model audio should be mapped to omni.reply_audio_frame.v1; reply_text remains subtitle/log/debug only.'
    ]
  };
}

export function createQwenProviderErrorTurn({ packet, requestId, config, mediaSnapshot, realtimeStatus, code, error }) {
  return normalizeQwenProviderResult({
    turnId: `qwen_error_${Date.now().toString(36)}`,
    reply_text: `Local Qwen provider error: ${error}`,
    expression: 'error',
    tool_intents: [],
    providerStatus: { ok: false, code, error },
    notes: [
      'Qwen provider returned an error boundary turn.',
      `code=${code}`,
      `endpoint=${config?.endpoint || 'not_configured'}`,
      `transport=${config?.transport || 'unknown'}`,
      `timeoutMs=${config?.timeoutMs || 'unknown'}`,
      `dryRun=${Boolean(config?.dryRun)}`,
      realtimeStatus ? `realtime_connected=${realtimeStatus.connected}; realtime_last_error=${realtimeStatus.lastError || 'none'}` : 'realtime_status=unavailable',
      'The realtime session should move to output_state=error instead of staying in thinking/speaking.'
    ]
  }, { packet, requestId, config, mediaSnapshot, realtimeStatus });
}

export function withTimeout(promise, timeoutMs, message = 'operation timed out') {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export async function callQwenOmniService({ packet, mediaSnapshot, requestId, config = createQwenProviderConfig() }) {
  const request = createQwenProviderRequest({ packet, mediaSnapshot, requestId });

  if (!config.endpoint) {
    return {
      ok: false,
      code: 'qwen_endpoint_not_configured',
      request,
      error: 'LOCALDEV_QWEN_ENDPOINT is not configured.'
    };
  }

  if (config.dryRun) {
    return {
      ok: false,
      code: 'qwen_dry_run',
      request,
      error: 'LOCALDEV_QWEN_DRY_RUN is enabled; no external model request was sent.'
    };
  }

  return {
    ok: false,
    code: 'qwen_transport_not_implemented',
    request,
    error: `Transport ${config.transport} is not implemented in the demo adapter yet.`
  };
}
