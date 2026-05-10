export const LOCALDEV_PROTOCOL = {
  inputEnvelopeSchema: 'cloudgenie.local_dev.envelope.v1',
  mediaEnvelopeSchema: 'cloudgenie.local_dev.media_envelope.v1',
  controlEnvelopeSchema: 'cloudgenie.local_dev.control_envelope.v1',
  mediaAckSchema: 'cloudgenie.local_dev.media_ack.v1',
  inputPacketType: 'omni.input_packet',
  audioFrameType: 'omni.audio_frame',
  cameraFrameType: 'omni.camera_frame',
  interruptType: 'omni.interrupt'
};

export function isLocalDevWebSocketEndpoint(endpoint) {
  return typeof endpoint === 'string' && /^wss?:\/\//.test(endpoint);
}

export function getMediaFrameType(frame) {
  return frame?.schema === 'omni.camera_frame.v1'
    ? LOCALDEV_PROTOCOL.cameraFrameType
    : LOCALDEV_PROTOCOL.audioFrameType;
}

export function isLocalDevInputEnvelope(message) {
  return message?.schema === LOCALDEV_PROTOCOL.inputEnvelopeSchema
    && message?.type === LOCALDEV_PROTOCOL.inputPacketType
    && message?.packet?.schema === 'omni.input_packet.v1';
}

export function isLocalDevMediaEnvelope(message) {
  return message?.schema === LOCALDEV_PROTOCOL.mediaEnvelopeSchema
    && (message?.type === LOCALDEV_PROTOCOL.audioFrameType || message?.type === LOCALDEV_PROTOCOL.cameraFrameType)
    && (message?.frame?.schema === 'omni.audio_frame.v1' || message?.frame?.schema === 'omni.camera_frame.v1');
}

export function createLocalDevInputEnvelope({ requestId, packet, sentAt }) {
  return {
    schema: LOCALDEV_PROTOCOL.inputEnvelopeSchema,
    type: LOCALDEV_PROTOCOL.inputPacketType,
    requestId,
    sentAt,
    packetSchema: packet?.schema || 'unknown',
    packetId: packet?.packetId || 'unknown',
    robotId: packet?.identity?.robotId || null,
    packet
  };
}

export function createLocalDevMediaEnvelope({ requestId, frame, sentAt }) {
  return {
    schema: LOCALDEV_PROTOCOL.mediaEnvelopeSchema,
    type: getMediaFrameType(frame),
    requestId,
    sentAt,
    frameSchema: frame?.schema || 'unknown',
    frameId: frame?.frameId || 'unknown',
    robotId: frame?.robotId || null,
    frame
  };
}

export function createLocalDevControlEnvelope({ requestId, interrupt, sentAt }) {
  return {
    schema: LOCALDEV_PROTOCOL.controlEnvelopeSchema,
    type: LOCALDEV_PROTOCOL.interruptType,
    requestId,
    sentAt,
    interruptSchema: interrupt?.schema || 'unknown',
    interruptId: interrupt?.interruptId || 'unknown',
    robotId: interrupt?.robotId || null,
    turnId: interrupt?.turnId || null,
    interrupt
  };
}

export function createLocalDevOutputEnvelope({ requestId, turn, packet, receivedAt }) {
  return {
    schema: LOCALDEV_PROTOCOL.inputEnvelopeSchema,
    type: 'omni.output_turn',
    requestId: requestId || null,
    receivedAt,
    receivedPacket: {
      schema: packet?.schema || 'unknown',
      packetId: packet?.packetId || 'unknown',
      robotId: packet?.identity?.robotId || null,
      displayName: packet?.identity?.displayName || null,
      route: packet?.routing?.route || null,
      adapter: packet?.routing?.adapter || null
    },
    turn
  };
}

export function createLocalDevMediaAck({
  requestId,
  frame,
  receivedAt,
  sessionActive = true,
  warning = null
} = {}) {
  return {
    schema: LOCALDEV_PROTOCOL.mediaAckSchema,
    type: 'omni.media_ack',
    requestId: requestId || null,
    receivedAt,
    receivedFrame: {
      schema: frame?.schema || 'unknown',
      frameId: frame?.frameId || 'unknown',
      robotId: frame?.robotId || null,
      displayName: frame?.displayName || null,
      mediaKind: frame?.media?.kind || null,
      codec: frame?.media?.codec || null,
      payloadIncluded: Boolean(frame?.media?.payloadIncluded),
      byteLength: frame?.media?.byteLength || 0
    },
    sessionActive: Boolean(sessionActive),
    warning,
    note: warning || 'LocalDev service recognized the input media frame. audio_frame and camera_frame are input media; they must not automatically trigger interrupt.'
  };
}

export function isLocalDevMediaAck(message) {
  return message?.schema === LOCALDEV_PROTOCOL.mediaAckSchema || message?.type === 'omni.media_ack';
}

export function normalizeLocalDevInputPacket(message) {
  if (isLocalDevInputEnvelope(message)) {
    return { packet: message.packet, requestId: message.requestId || null, envelopeSchema: message.schema || null };
  }
  if (message?.type === LOCALDEV_PROTOCOL.inputPacketType && message?.packet?.schema === 'omni.input_packet.v1') {
    return { packet: message.packet, requestId: message.requestId || null, envelopeSchema: message.schema || null };
  }
  if (message?.schema === 'omni.input_packet.v1') {
    return { packet: message, requestId: message.requestId || null, envelopeSchema: null };
  }
  return null;
}

export function normalizeLocalDevMediaFrame(message) {
  if (isLocalDevMediaEnvelope(message)) {
    return { frame: message.frame, requestId: message.requestId || null, envelopeSchema: message.schema || null, type: message.type || null };
  }
  if (message?.frame?.schema === 'omni.audio_frame.v1' || message?.frame?.schema === 'omni.camera_frame.v1') {
    return { frame: message.frame, requestId: message.requestId || null, envelopeSchema: message.schema || null, type: message.type || null };
  }
  if (message?.schema === 'omni.audio_frame.v1' || message?.schema === 'omni.camera_frame.v1') {
    return { frame: message, requestId: message.requestId || null, envelopeSchema: null, type: getMediaFrameType(message) };
  }
  return null;
}
