// providerHandshakeEventMapping.js
//
// v1.3.9 provider-specific event mapping descriptors.
// Descriptive only: no provider event is sent from this module.

import { getProviderSpecificHandshakeAdapter } from './providerSpecificHandshakeAdapters.js';

export const PROVIDER_HANDSHAKE_EVENT_MAPPING_SCHEMA = 'omni.provider_handshake_event_mapping.v1';

const INTERNAL_INPUT_SCHEMAS = [
  'omni.input_packet.v1',
  'omni.audio_frame.v1',
  'omni.camera_frame.v1',
  'omni.interrupt.v1'
];

const INTERNAL_OUTPUT_SCHEMAS = [
  'omni.output_state.v1',
  'omni.output_turn.v1',
  'omni.reply_audio_frame.v1'
];

const GENERIC_PROVIDER_EVENTS = {
  'omni.input_packet.v1': 'session.context.update',
  'omni.audio_frame.v1': 'input_audio_buffer.append',
  'omni.camera_frame.v1': 'input_image_frame.append',
  'omni.interrupt.v1': 'response.cancel',
  'omni.output_state.v1': 'response.state',
  'omni.reply_audio_frame.v1': 'response.audio.delta',
  'omni.output_turn.v1': 'response.done',
  mediaAck: 'diagnostic.media_ack',
  error: 'error'
};

const PROVIDER_EVENT_OVERRIDES = {
  bigmodel_glm_realtime_candidate: {
    sessionCreated: 'session.created',
    sessionReady: 'session.ready',
    responseAudioDelta: 'response.audio.delta',
    responseDone: 'response.done'
  },
  dashscope_qwen_omni_candidate: {
    sessionCreated: 'session.created',
    sessionReady: 'session.ready',
    responseAudioDelta: 'response.audio.delta',
    responseDone: 'response.done'
  }
};

export function createProviderHandshakeEventMapping(providerId) {
  const adapter = getProviderSpecificHandshakeAdapter(providerId);
  if (!adapter) return null;
  const override = PROVIDER_EVENT_OVERRIDES[providerId] || {};
  return {
    schema: PROVIDER_HANDSHAKE_EVENT_MAPPING_SCHEMA,
    providerId: adapter.providerId,
    providerKind: adapter.providerKind,
    dryRunOnly: true,
    sentToProvider: false,
    fallbackProviderId: 'localdev_mock',
    input: {
      'omni.input_packet.v1': {
        providerEvent: GENERIC_PROVIDER_EVENTS['omni.input_packet.v1'],
        purpose: 'runtime_context_update',
        blocking: false
      },
      'omni.audio_frame.v1': {
        providerEvent: GENERIC_PROVIDER_EVENTS['omni.audio_frame.v1'],
        purpose: 'realtime_audio_input',
        autoInterrupt: false,
        realUploadAllowed: false
      },
      'omni.camera_frame.v1': {
        providerEvent: GENERIC_PROVIDER_EVENTS['omni.camera_frame.v1'],
        purpose: 'camera_keyframe_input',
        keepLatestUnderBackpressure: true,
        realUploadAllowed: false
      },
      'omni.interrupt.v1': {
        providerEvent: GENERIC_PROVIDER_EVENTS['omni.interrupt.v1'],
        purpose: 'explicit_interrupt_control',
        highestPriority: true,
        triggeredByAudioFrame: false
      }
    },
    output: {
      'omni.output_state.v1': {
        providerEvent: GENERIC_PROVIDER_EVENTS['omni.output_state.v1'],
        purpose: 'thinking_speaking_finished_state'
      },
      'omni.reply_audio_frame.v1': {
        providerEvent: override.responseAudioDelta || GENERIC_PROVIDER_EVENTS['omni.reply_audio_frame.v1'],
        purpose: 'realtime_voice_output_main_path',
        nativeAudioRequired: true,
        replyTextToTts: false
      },
      'omni.output_turn.v1': {
        providerEvent: override.responseDone || GENERIC_PROVIDER_EVENTS['omni.output_turn.v1'],
        purpose: 'structured_turn_subtitles_logs_tools',
        replyTextUsage: 'subtitles_logs_debug_visible_context_only'
      }
    },
    providerLifecycle: {
      sessionCreated: override.sessionCreated || 'session.created',
      sessionReady: override.sessionReady || 'session.ready',
      error: GENERIC_PROVIDER_EVENTS.error
    },
    diagnostics: {
      mediaAck: {
        providerEvent: GENERIC_PROVIDER_EVENTS.mediaAck,
        diagnosticsOnly: true,
        gatesMediaSend: false
      }
    },
    guardrails: {
      replyAudioFrameIsRealtimeVoiceOutput: true,
      replyTextNotTtsInput: true,
      asrLlmTtsRegressionForbidden: true,
      audioFrameDoesNotAutoInterrupt: true,
      replyAudioFrameCannotTriggerInterrupt: true,
      mediaAckDiagnosticsOnly: true,
      noRealAudioUpload: true,
      noRealCameraUpload: true,
      noRealtimeBilling: true,
      noRealProviderSocket: true
    }
  };
}

export function validateProviderHandshakeEventMapping(mapping) {
  const failures = [];
  if (!mapping || typeof mapping !== 'object') return { ok: false, failures: ['mapping_must_be_object'] };
  if (mapping.schema !== PROVIDER_HANDSHAKE_EVENT_MAPPING_SCHEMA) failures.push('schema_must_be_provider_handshake_event_mapping_v1');
  for (const schema of INTERNAL_INPUT_SCHEMAS) {
    if (!mapping.input?.[schema]) failures.push(`missing_input_mapping:${schema}`);
  }
  for (const schema of INTERNAL_OUTPUT_SCHEMAS) {
    if (!mapping.output?.[schema]) failures.push(`missing_output_mapping:${schema}`);
  }
  if (mapping.output?.['omni.reply_audio_frame.v1']?.nativeAudioRequired !== true) failures.push('reply_audio_frame_native_required');
  if (mapping.output?.['omni.reply_audio_frame.v1']?.replyTextToTts !== false) failures.push('reply_audio_frame_must_not_use_tts');
  if (mapping.output?.['omni.output_turn.v1']?.replyTextUsage !== 'subtitles_logs_debug_visible_context_only') failures.push('reply_text_usage_must_be_subtitle_only');
  if (mapping.input?.['omni.interrupt.v1']?.triggeredByAudioFrame !== false) failures.push('interrupt_must_not_be_audio_triggered');
  if (mapping.diagnostics?.mediaAck?.diagnosticsOnly !== true || mapping.diagnostics?.mediaAck?.gatesMediaSend !== false) failures.push('media_ack_must_be_diagnostics_only');
  if (mapping.fallbackProviderId !== 'localdev_mock') failures.push('fallback_must_be_localdev_mock');
  if (mapping.sentToProvider !== false) failures.push('sentToProvider_must_be_false');
  return { ok: failures.length === 0, failures };
}

export function summarizeProviderHandshakeEventMapping(mapping) {
  if (!mapping) return 'provider event mapping=unknown';
  return `${mapping.providerId}: input=${Object.keys(mapping.input || {}).length}; output=${Object.keys(mapping.output || {}).length}; reply_audio_frame=main_voice_path; reply_text_tts=blocked; interrupt=explicit; media_ack=diagnostics; sent=no; fallback=${mapping.fallbackProviderId}`;
}
