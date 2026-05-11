import { evaluateProviderGate } from './providerGate.js';

export const PROVIDER_CAMERA_GATE_STATUSES = [
  'disabled',
  'mock_not_required',
  'unconfigured',
  'blocked',
  'ready_for_camera_dry_run',
  'camera_dry_run_ok',
  'camera_dry_run_failed'
];

function uniqueReasons(reasons = []) {
  return [...new Set(reasons.filter(Boolean))];
}

function getContentType(media = {}) {
  return media.mimeType || media.contentType || media.codec || null;
}

export function validateDryRunCameraFrame(frame = {}) {
  const reasons = [];
  const media = frame.media || {};
  const contentType = getContentType(media);

  if (frame.schema !== 'omni.camera_frame.v1') reasons.push('schema_must_be_omni_camera_frame_v1');
  if (contentType !== 'image/jpeg') reasons.push('content_type_must_be_image_jpeg');
  if (media.payloadEncoding !== 'base64') reasons.push('payload_encoding_must_be_base64');
  if (typeof media.payloadIncluded !== 'boolean') reasons.push('payload_included_must_be_explicit');
  if (!media.payloadIncluded) reasons.push('payload_required_for_dry_run_validation');
  if (!media.byteLength || Number(media.byteLength) <= 0) reasons.push('byte_length_required');
  if (Number(media.byteLength || 0) > 512 * 1024) reasons.push('byte_length_too_large_for_dry_run');
  if (!media.payload || typeof media.payload !== 'string') reasons.push('base64_payload_required');
  if (media.width != null && Number(media.width) <= 0) reasons.push('width_must_be_positive_when_present');
  if (media.height != null && Number(media.height) <= 0) reasons.push('height_must_be_positive_when_present');

  return {
    ok: reasons.length === 0,
    schema: frame.schema || null,
    contentType,
    payloadEncoding: media.payloadEncoding || null,
    width: media.width || null,
    height: media.height || null,
    byteLength: media.byteLength || 0,
    payloadIncluded: Boolean(media.payloadIncluded),
    persisted: false,
    uploaded: false,
    sentToProvider: false,
    reasons: uniqueReasons(reasons)
  };
}

export function createProviderCameraGate(input = {}) {
  const gate = input.providerGate || evaluateProviderGate(input);
  const reasons = [...(gate.blockReasons || [])];

  let status = 'blocked';
  if (!gate.isRealProvider) {
    status = 'mock_not_required';
    reasons.push('localdev_mock_does_not_use_real_camera_upload_gate');
  } else if (!gate.enabled) {
    status = 'disabled';
  } else if (!gate.endpointConfigured || !gate.apiKeyConfigured) {
    status = 'unconfigured';
  } else if (gate.mode !== 'camera_dry_run') {
    status = 'blocked';
    reasons.push('camera_dry_run_mode_required');
  } else if (!gate.allowCameraUpload) {
    status = 'blocked';
    reasons.push('allow_camera_upload_required');
  } else if (gate.fallbackProviderId === 'localdev_mock') {
    status = 'ready_for_camera_dry_run';
  }

  let validation = null;
  if (input.cameraFrame) {
    validation = validateDryRunCameraFrame(input.cameraFrame);
    if (status === 'ready_for_camera_dry_run') {
      status = validation.ok ? 'camera_dry_run_ok' : 'camera_dry_run_failed';
      reasons.push(...validation.reasons);
    }
  }

  return {
    providerId: gate.providerId,
    mode: gate.mode,
    status,
    canSendRealCamera: false,
    canSendDryRunCameraPayload: status === 'ready_for_camera_dry_run' || status === 'camera_dry_run_ok',
    canSendAudio: false,
    canStartRealtime: false,
    canStartBillingSession: false,
    fallbackProviderId: gate.fallbackProviderId || 'localdev_mock',
    reasons: uniqueReasons(reasons),
    gateStatus: gate.status,
    endpointConfigured: Boolean(gate.endpointConfigured),
    apiKeyConfigured: Boolean(gate.apiKeyConfigured),
    allowCameraUpload: Boolean(gate.allowCameraUpload),
    dryRunValidation: validation
  };
}

export function summarizeProviderCameraGate(cameraGate = createProviderCameraGate()) {
  const reasons = cameraGate.reasons?.length ? cameraGate.reasons.join(', ') : 'none';
  return `${cameraGate.providerId}/${cameraGate.mode}: ${cameraGate.status}; real_camera=no; dry_run=${cameraGate.canSendDryRunCameraPayload ? 'yes' : 'no'}; audio=no; realtime=no; billing=no; fallback=${cameraGate.fallbackProviderId}; reasons=${reasons}`;
}
