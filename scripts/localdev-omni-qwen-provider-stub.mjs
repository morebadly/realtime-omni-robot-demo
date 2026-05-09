import { callQwenOmniService, createQwenProviderConfig, createQwenProviderErrorTurn, normalizeQwenProviderResult } from './localdev-qwen-http-client.mjs';
import { createQwenRealtimeClient } from './localdev-qwen-realtime-client.mjs';

export function createQwenOmniProviderStub() {
  const config = createQwenProviderConfig();
  const realtimeClient = createQwenRealtimeClient(config);
  const media = {
    audioFrames: 0,
    cameraFrames: 0,
    lastAudioFrame: null,
    lastCameraFrame: null
  };

  return {
    name: 'qwen2_5_omni_provider_stub',
    kind: 'qwen_stub',
    config,
    realtimeClient,

    async observeMediaFrame(frame, requestId = null) {
      if (frame?.schema === 'omni.camera_frame.v1') {
        media.cameraFrames += 1;
        media.lastCameraFrame = frame;
      } else {
        media.audioFrames += 1;
        media.lastAudioFrame = frame;
      }
      await realtimeClient.sendMediaFrame(frame, requestId);
      return { ...media };
    },

    getMediaSnapshot() {
      return { ...media };
    },

    async runInference({ packet, requestId }) {
      const realtimeResult = await realtimeClient.sendInputPacket(packet, requestId);
      if (!realtimeResult.ok) {
        return createQwenProviderErrorTurn({
          packet,
          requestId,
          config,
          mediaSnapshot: media,
          realtimeStatus: realtimeClient.getStatus(),
          code: realtimeResult.code,
          error: realtimeResult.error
        });
      }
      const result = await callQwenOmniService({ packet, mediaSnapshot: media, requestId, config });
      if (result.ok) {
        return normalizeQwenProviderResult(result.output, { packet, requestId, config, mediaSnapshot: media, realtimeStatus: realtimeClient.getStatus() });
      }
      return createQwenProviderErrorTurn({
        packet,
        requestId,
        config,
        mediaSnapshot: media,
        realtimeStatus: realtimeClient.getStatus(),
        code: result.code,
        error: result.error
      });
    },

    createReplyAudioPlan() {
      return [];
    },

    async sendInterrupt(interrupt) {
      return realtimeClient.sendInterrupt(interrupt);
    }
  };
}
