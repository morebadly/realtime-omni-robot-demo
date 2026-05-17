// providerSpecificHandshakeAdapters.js
//
// v1.4.0 Provider-specific Handshake Adapter Dry-run.
//
// Pure metadata and validation only. This module does not read provider
// secrets, does not call provider endpoints, does not import WebSocket
// transports, does not upload media, does not start billing, and does not
// connect reply_text to TTS.

export const PROVIDER_SPECIFIC_HANDSHAKE_ADAPTER_SCHEMA = 'omni.provider_specific_handshake_adapter.v1';

export const PROVIDER_SPECIFIC_HANDSHAKE_ADAPTER_IDS = [
  'bigmodel_glm_realtime_candidate',
  'dashscope_qwen_omni_candidate'
];

function lockSafety() {
  return {
    opensRealSocket: false,
    sentToProvider: false,
    uploaded: false,
    persisted: false,
    billingStarted: false,
    canOpenRealtimeSocket: false,
    canSendRealAudio: false,
    canSendRealCamera: false,
    canStartBillingSession: false,
    replyTextToTts: false,
    replyAudioFrameNativeRequired: true,
    dryRunOnly: true,
    realHandshakePreflightSupported: true,
    manualOptInRequired: true,
    browserRuntimeAllowed: false
  };
}

const BASE_ADAPTER_FIELDS = {
  schema: PROVIDER_SPECIFIC_HANDSHAKE_ADAPTER_SCHEMA,
  providerKind: 'real_cloud_candidate',
  endpointKind: 'websocket_realtime',
  authBoundary: 'server_side_proxy_required',
  browserDirectSocketAllowed: false,
  requiresServerSideSecret: true,
  canOpenRealtimeSocket: false,
  canSendRealAudio: false,
  canSendRealCamera: false,
  canStartBillingSession: false,
  replyTextToTts: false,
  replyAudioFrameNativeRequired: true,
  candidateOnly: true,
  dryRunOnly: true,
  realHandshakePreflightSupported: true,
  realHandshakePreflightDefault: 'blocked',
  manualOptInRequired: true,
  serverSideOnly: true,
  browserRuntimeAllowed: false,
  verifySmokeNetworkForbidden: true,
  fallbackProviderId: 'localdev_mock',
  requestSchemaMapping: {
    handshake: 'provider_specific_handshake_dry_run_request',
    inputPacket: 'omni.input_packet.v1',
    audioFrame: 'omni.audio_frame.v1',
    cameraFrame: 'omni.camera_frame.v1',
    interrupt: 'omni.interrupt.v1'
  },
  responseSchemaMapping: {
    outputState: 'omni.output_state.v1',
    outputTurn: 'omni.output_turn.v1',
    replyAudioFrame: 'omni.reply_audio_frame.v1',
    error: 'provider_specific_error'
  },
  guardrails: {
    endpointMetadataOnly: true,
    noFetch: true,
    noWebSocket: true,
    noRealAudioUpload: true,
    noRealCameraUpload: true,
    noRealtimeBilling: true,
    replyTextNotTtsInput: true,
    replyAudioFrameIsRealtimeVoiceOutput: true,
    asrLlmTtsRegressionForbidden: true,
    localdevMockFallbackRequired: true,
    apiKeyMustNotEnterFrontend: true,
    realHandshakePreflightBlockedByDefault: true,
    realHandshakePreflightManualOnly: true,
    realHandshakePreflightServerSideOnly: true,
    verifySmokeNetworkForbidden: true
  }
};

export const PROVIDER_SPECIFIC_HANDSHAKE_ADAPTERS = Object.freeze({
  bigmodel_glm_realtime_candidate: Object.freeze({
    ...BASE_ADAPTER_FIELDS,
    providerId: 'bigmodel_glm_realtime_candidate',
    displayName: 'BigModel GLM-Realtime Candidate',
    officialName: 'GLM-Realtime',
    endpointTemplate: 'wss://open.bigmodel.cn/api/paas/v4/realtime',
    providerNotes: [
      'Candidate metadata only. Do not call this endpoint in v1.3.9.',
      'Future real auth must live in a server-side proxy / Robot Gateway / Device Runtime.'
    ],
    safety: lockSafety()
  }),
  dashscope_qwen_omni_candidate: Object.freeze({
    ...BASE_ADAPTER_FIELDS,
    providerId: 'dashscope_qwen_omni_candidate',
    displayName: 'DashScope Qwen-Omni Realtime Candidate',
    officialName: 'Qwen-Omni Realtime',
    endpointTemplate: 'wss://dashscope.aliyuncs.com/api-ws/v1/realtime/qwen-omni',
    providerNotes: [
      'Candidate metadata only. Do not call this endpoint in v1.3.9.',
      'Future real auth must live in a server-side proxy / Robot Gateway / Device Runtime.'
    ],
    safety: lockSafety()
  })
});

export function getProviderSpecificHandshakeAdapter(providerId) {
  const adapter = PROVIDER_SPECIFIC_HANDSHAKE_ADAPTERS[providerId];
  return adapter ? structuredClone(adapter) : null;
}

export function createProviderSpecificHandshakeAdapter(providerId) {
  return getProviderSpecificHandshakeAdapter(providerId);
}

export function listProviderSpecificHandshakeAdapters() {
  return PROVIDER_SPECIFIC_HANDSHAKE_ADAPTER_IDS
    .map((providerId) => getProviderSpecificHandshakeAdapter(providerId))
    .filter(Boolean);
}

export function validateProviderSpecificHandshakeAdapter(adapter) {
  const failures = [];
  if (!adapter || typeof adapter !== 'object') return { ok: false, failures: ['adapter_must_be_object'] };
  if (adapter.schema !== PROVIDER_SPECIFIC_HANDSHAKE_ADAPTER_SCHEMA) failures.push('schema_must_be_provider_specific_handshake_adapter_v1');
  if (!PROVIDER_SPECIFIC_HANDSHAKE_ADAPTER_IDS.includes(adapter.providerId)) failures.push('provider_id_must_be_known_candidate');
  if (adapter.providerKind !== 'real_cloud_candidate') failures.push('provider_kind_must_be_real_cloud_candidate');
  if (adapter.authBoundary !== 'server_side_proxy_required') failures.push('auth_boundary_must_be_server_side_proxy_required');
  if (adapter.browserDirectSocketAllowed !== false) failures.push('browser_direct_socket_must_be_false');
  if (adapter.requiresServerSideSecret !== true) failures.push('requires_server_side_secret_must_be_true');
  if (adapter.canOpenRealtimeSocket !== false) failures.push('canOpenRealtimeSocket_must_be_false');
  if (adapter.canSendRealAudio !== false) failures.push('canSendRealAudio_must_be_false');
  if (adapter.canSendRealCamera !== false) failures.push('canSendRealCamera_must_be_false');
  if (adapter.canStartBillingSession !== false) failures.push('canStartBillingSession_must_be_false');
  if (adapter.replyTextToTts !== false) failures.push('replyTextToTts_must_be_false');
  if (adapter.replyAudioFrameNativeRequired !== true) failures.push('replyAudioFrameNativeRequired_must_be_true');
  if (adapter.candidateOnly !== true) failures.push('candidateOnly_must_be_true');
  if (adapter.dryRunOnly !== true) failures.push('dryRunOnly_must_be_true');
  if (adapter.realHandshakePreflightSupported !== true) failures.push('realHandshakePreflightSupported_must_be_true');
  if (adapter.realHandshakePreflightDefault !== 'blocked') failures.push('realHandshakePreflightDefault_must_be_blocked');
  if (adapter.manualOptInRequired !== true) failures.push('manualOptInRequired_must_be_true');
  if (adapter.serverSideOnly !== true) failures.push('serverSideOnly_must_be_true');
  if (adapter.browserRuntimeAllowed !== false) failures.push('browserRuntimeAllowed_must_be_false');
  if (adapter.verifySmokeNetworkForbidden !== true) failures.push('verifySmokeNetworkForbidden_must_be_true');
  if (adapter.fallbackProviderId !== 'localdev_mock') failures.push('fallback_must_be_localdev_mock');
  const safety = adapter.safety || {};
  for (const key of ['opensRealSocket', 'sentToProvider', 'uploaded', 'persisted', 'billingStarted', 'canOpenRealtimeSocket', 'canSendRealAudio', 'canSendRealCamera', 'canStartBillingSession', 'replyTextToTts']) {
    if (safety[key] !== false) failures.push(`safety_${key}_must_be_false`);
  }
  if (safety.replyAudioFrameNativeRequired !== true) failures.push('safety_replyAudioFrameNativeRequired_must_be_true');
  if (!adapter.endpointTemplate || typeof adapter.endpointTemplate !== 'string') failures.push('endpoint_template_required');
  return { ok: failures.length === 0, failures };
}

export function summarizeProviderSpecificHandshakeAdapter(adapter) {
  if (!adapter) return 'provider-specific handshake adapter=unknown';
  return `${adapter.providerId}/${adapter.providerKind}: endpoint=${adapter.endpointKind}; dry_run_only=${adapter.dryRunOnly ? 'yes' : 'no'}; real_preflight=${adapter.realHandshakePreflightDefault}; direct_socket=${adapter.browserDirectSocketAllowed ? 'allowed' : 'blocked'}; real_audio=no; real_camera=no; billing=no; reply_text_tts=no; reply_audio_frame=required; fallback=${adapter.fallbackProviderId}`;
}
