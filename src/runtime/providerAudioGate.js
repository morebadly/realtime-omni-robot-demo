import { evaluateProviderGate } from './providerGate.js';

export const PROVIDER_AUDIO_GATE_STATUSES = [
  'disabled',
  'mock_not_required',
  'unconfigured',
  'blocked',
  'ready_for_audio_dry_run',
  'audio_dry_run_ok',
  'audio_dry_run_failed'
];

function uniqueReasons(reasons = []) {
  return [...new Set(reasons.filter(Boolean))];
}

export function validateDryRunAudioFrame(frame = {}) {
  const reasons = [];
  const media = frame.media || {};

  if (frame.schema !== 'omni.audio_frame.v1') reasons.push('schema_must_be_omni_audio_frame_v1');
  if (!media.sampleRate || Number(media.sampleRate) <= 0) reasons.push('sample_rate_required');
  if (!media.channels || Number(media.channels) <= 0) reasons.push('channels_required');
  if (media.payloadEncoding !== 'base64') reasons.push('payload_encoding_must_be_base64');
  if (!media.payloadIncluded) reasons.push('payload_required_for_dry_run_validation');
  if (!media.byteLength || Number(media.byteLength) <= 0) reasons.push('byte_length_required');
  if (Number(media.byteLength || 0) > 256 * 1024) reasons.push('byte_length_too_large_for_dry_run');
  if (!media.payload || typeof media.payload !== 'string') reasons.push('base64_payload_required');

  return {
    ok: reasons.length === 0,
    schema: frame.schema || null,
    sampleRate: media.sampleRate || null,
    channels: media.channels || null,
    payloadEncoding: media.payloadEncoding || null,
    byteLength: media.byteLength || 0,
    persisted: false,
    uploaded: false,
    sentToProvider: false,
    reasons: uniqueReasons(reasons)
  };
}

export function createProviderAudioGate(input = {}) {
  const gate = input.providerGate || evaluateProviderGate(input);
  const reasons = [...(gate.blockReasons || [])];

  let status = 'blocked';
  if (!gate.isRealProvider) {
    status = 'mock_not_required';
    reasons.push('localdev_mock_does_not_use_real_audio_upload_gate');
  } else if (!gate.enabled) {
    status = 'disabled';
  } else if (!gate.endpointConfigured || !gate.apiKeyConfigured) {
    status = 'unconfigured';
  } else if (gate.mode !== 'audio_dry_run') {
    status = 'blocked';
    reasons.push('audio_dry_run_mode_required');
  } else if (!gate.allowAudioUpload) {
    status = 'blocked';
    reasons.push('allow_audio_upload_required');
  } else if (gate.fallbackProviderId === 'localdev_mock') {
    status = 'ready_for_audio_dry_run';
  }

  let validation = null;
  if (input.audioFrame) {
    validation = validateDryRunAudioFrame(input.audioFrame);
    if (status === 'ready_for_audio_dry_run') {
      status = validation.ok ? 'audio_dry_run_ok' : 'audio_dry_run_failed';
      reasons.push(...validation.reasons);
    }
  }

  return {
    providerId: gate.providerId,
    mode: gate.mode,
    status,
    canSendRealAudio: false,
    canSendDryRunAudioPayload: status === 'ready_for_audio_dry_run' || status === 'audio_dry_run_ok',
    canSendCamera: false,
    canStartRealtime: false,
    canStartBillingSession: false,
    fallbackProviderId: gate.fallbackProviderId || 'localdev_mock',
    reasons: uniqueReasons(reasons),
    gateStatus: gate.status,
    endpointConfigured: Boolean(gate.endpointConfigured),
    apiKeyConfigured: Boolean(gate.apiKeyConfigured),
    allowAudioUpload: Boolean(gate.allowAudioUpload),
    dryRunValidation: validation
  };
}

export function summarizeProviderAudioGate(audioGate = createProviderAudioGate()) {
  const reasons = audioGate.reasons?.length ? audioGate.reasons.join(', ') : 'none';
  return `${audioGate.providerId}/${audioGate.mode}: ${audioGate.status}; real_audio=no; dry_run=${audioGate.canSendDryRunAudioPayload ? 'yes' : 'no'}; camera=no; realtime=no; billing=no; fallback=${audioGate.fallbackProviderId}; reasons=${reasons}`;
}
