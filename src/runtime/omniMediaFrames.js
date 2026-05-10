function createFrameId(prefix) {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}_${rand}`;
}

function nowIso() {
  return new Date().toISOString();
}

function getDataUrlBase64(dataUrl = '') {
  const value = String(dataUrl || '');
  const commaIndex = value.indexOf(',');
  return commaIndex >= 0 ? value.slice(commaIndex + 1) : value;
}

function approxDataUrlBytes(dataUrl = '') {
  const base64 = getDataUrlBase64(dataUrl);
  return Math.round(base64.length * 0.75);
}

export function createDefaultMediaChannels() {
  return {
    protocol: 'omni.media_channel.v1',
    policy: 'audio_payload_and_camera_payload_ready',
    audio: { observed: 0, sent: 0, lastFrame: null, lastSentAt: null },
    camera: { observed: 0, sent: 0, lastFrame: null, lastSentAt: null },
    localDev: {
      lastAck: null,
      lastError: null,
      lastFrameId: null,
      lastFrameSchema: null,
      ackCount: 0,
      audioAckCount: 0,
      cameraAckCount: 0,
      ackBySchema: {}
    }
  };
}

export function createAudioFrame({
  robot,
  session,
  route,
  level,
  sequence = 0,
  payloadBase64 = null,
  byteLength = 0,
  sampleCount = 0,
  durationMs = 250,
  codec = 'pcm_float32',
  channels = 1
}) {
  const sampleRate = session?.sampleRate || 48000;
  const hasPayload = Boolean(payloadBase64 && byteLength > 0);
  return {
    schema: 'omni.audio_frame.v1',
    frameId: createFrameId('aud'),
    createdAt: nowIso(),
    robotId: robot?.robotId || null,
    displayName: robot?.name || null,
    route: route?.route || session?.route || 'not_connected',
    sequence,
    media: {
      kind: 'audio',
      codec: hasPayload ? codec : 'pcm_float32_placeholder',
      sampleRate,
      channels,
      durationMs,
      sampleCount,
      level: Number(level || session?.level || 0),
      payloadIncluded: hasPayload,
      payloadEncoding: hasPayload ? 'base64' : null,
      byteLength: hasPayload ? byteLength : 0,
      payload: hasPayload ? payloadBase64 : null,
      note: hasPayload
        ? 'Browser microphone PCM Float32 chunk is included. ASR text remains only for subtitles, logs, debugging, and plugin keyword assistance.'
        : 'No real audio payload is included. The browser audio processor may be unavailable or the microphone has not started.'
    },
    guardrails: { asrTextIsNotPrimaryInput: true, rawAudioStreamFirst: true }
  };
}

export function createCameraFrame({ robot, frame, framePolicy, sequence = 0, includePayload = true }) {
  const payloadBase64 = frame?.dataUrl ? getDataUrlBase64(frame.dataUrl) : null;
  const byteLength = approxDataUrlBytes(frame?.dataUrl);
  const hasPayload = Boolean(includePayload && payloadBase64 && byteLength > 0);
  return {
    schema: 'omni.camera_frame.v1',
    frameId: createFrameId('cam'),
    createdAt: nowIso(),
    robotId: robot?.robotId || null,
    displayName: robot?.name || null,
    route: robot?.adapterDetail?.name || robot?.adapter || 'unknown_adapter',
    sequence,
    media: {
      kind: 'camera',
      codec: 'image/jpeg',
      width: frame?.width || framePolicy?.captureWidth || null,
      height: frame?.height || null,
      capturedAt: frame?.capturedAt || null,
      selectorPolicy: framePolicy?.key || frame?.policy || null,
      uploadPlan: framePolicy?.upload || null,
      jpegQuality: framePolicy?.jpegQuality || null,
      payloadIncluded: hasPayload,
      payloadEncoding: hasPayload ? 'base64' : null,
      byteLength: hasPayload ? byteLength : 0,
      payload: hasPayload ? payloadBase64 : null,
      dataUrlPreview: frame?.dataUrl ? frame.dataUrl.slice(0, 96) : null,
      note: hasPayload
        ? 'Browser camera JPEG payload is included. Keyframes are selected by FramePolicy/FrameSelector and are not frontend emotion summaries.'
        : 'No JPEG payload is included. The camera may not have started, a keyframe may not exist yet, or strategy may choose metadata only.'
    },
    guardrails: { noFrontendEmotionSummary: true, selectedFramesGoToOmniAdapter: true }
  };
}

export function updateMediaChannelStats(prev, frame, status = 'observed') {
  const current = prev || createDefaultMediaChannels();
  const key = frame?.schema === 'omni.camera_frame.v1' ? 'camera' : 'audio';
  return {
    ...current,
    [key]: {
      ...current[key],
      observed: current[key].observed + 1,
      sent: status === 'sent' ? current[key].sent + 1 : current[key].sent,
      lastFrame: frame,
      lastSentAt: status === 'sent' ? new Date().toLocaleTimeString('zh-CN', { hour12: false }) : current[key].lastSentAt
    }
  };
}

export function applyMediaAck(prev, ack) {
  const current = prev || createDefaultMediaChannels();
  const schema = ack?.receivedFrame?.schema || ack?.schema || 'unknown';
  const isAudio = schema === 'omni.audio_frame.v1';
  const isCamera = schema === 'omni.camera_frame.v1';
  const ackBySchema = current.localDev?.ackBySchema || {};
  return {
    ...current,
    localDev: {
      ...current.localDev,
      lastAck: ack,
      lastError: null,
      lastFrameId: ack?.receivedFrame?.frameId || ack?.frameId || current.localDev.lastFrameId,
      lastFrameSchema: schema || current.localDev.lastFrameSchema,
      ackCount: (current.localDev.ackCount || 0) + 1,
      audioAckCount: (current.localDev.audioAckCount || 0) + (isAudio ? 1 : 0),
      cameraAckCount: (current.localDev.cameraAckCount || 0) + (isCamera ? 1 : 0),
      ackBySchema: {
        ...ackBySchema,
        [schema]: (ackBySchema[schema] || 0) + 1
      }
    }
  };
}

export function applyMediaError(prev, error) {
  const current = prev || createDefaultMediaChannels();
  return { ...current, localDev: { ...current.localDev, lastError: error } };
}

export function summarizeMediaChannels(channels) {
  if (!channels) return '媒体通道尚未初始化';
  const audio = channels.audio || {};
  const camera = channels.camera || {};
  const ack = channels.localDev?.ackCount || 0;
  const audioAck = channels.localDev?.audioAckCount || 0;
  const cameraAck = channels.localDev?.cameraAckCount || 0;
  return `audio ${audio.sent || 0}/${audio.observed || 0}/ack ${audioAck} · camera ${camera.sent || 0}/${camera.observed || 0}/ack ${cameraAck} · totalAck ${ack}`;
}
