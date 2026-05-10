import { callQwenOmniService, createQwenProviderConfig, createQwenProviderErrorTurn, normalizeQwenProviderResult } from './localdev-qwen-http-client.mjs';
import { createQwenRealtimeClient } from './localdev-qwen-realtime-client.mjs';

function canReceiveRealtimeOutput(config) {
  return config?.transport === 'websocket_json' || config?.transport === 'ws_json';
}

export function createQwenOmniCompatibleProvider() {
  const config = createQwenProviderConfig();
  const replyAudioListeners = new Set();
  const media = {
    audioFrames: 0,
    cameraFrames: 0,
    lastAudioFrame: null,
    lastCameraFrame: null
  };
  let lastReplyAudioFrames = [];
  let replyAudioWasStreamed = false;

  function handleReplyAudioFrame(frame) {
    lastReplyAudioFrames.push(frame);
    for (const listener of replyAudioListeners) {
      replyAudioWasStreamed = true;
      listener(frame);
    }
  }

  const realtimeClient = createQwenRealtimeClient({
    ...config,
    onReplyAudioFrame: handleReplyAudioFrame
  });

  function refreshReplyAudioFrames(requestId = null) {
    lastReplyAudioFrames = typeof realtimeClient.getReplyAudioFrames === 'function'
      ? realtimeClient.getReplyAudioFrames({ requestId })
      : [];
    return lastReplyAudioFrames;
  }

  return {
    name: 'qwen_omni_compatible_provider',
    kind: 'qwen_omni',
    config,
    realtimeClient,

    onReplyAudioFrame(listener) {
      if (typeof listener !== 'function') return () => {};
      replyAudioListeners.add(listener);
      return () => replyAudioListeners.delete(listener);
    },

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
      lastReplyAudioFrames = [];
      replyAudioWasStreamed = false;
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
      if (canReceiveRealtimeOutput(config)) {
        const outputResult = await realtimeClient.waitForOutputTurn({ requestId, timeoutMs: config.timeoutMs });
        if (outputResult.ok) {
          refreshReplyAudioFrames(requestId);
          return normalizeQwenProviderResult(outputResult.output, { packet, requestId, config, mediaSnapshot: media, realtimeStatus: realtimeClient.getStatus() });
        }
        return createQwenProviderErrorTurn({
          packet,
          requestId,
          config,
          mediaSnapshot: media,
          realtimeStatus: realtimeClient.getStatus(),
          code: outputResult.code,
          error: outputResult.error
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

    createReplyAudioPlan({ requestId } = {}) {
      if (replyAudioWasStreamed) return [];
      const frames = lastReplyAudioFrames.length ? lastReplyAudioFrames : refreshReplyAudioFrames(requestId);
      return frames.map((frame, index) => ({
        sequence: frame.sequence ?? index + 1,
        isFinal: Boolean(frame.isFinal),
        payloadBase64: frame.audio?.payload || null,
        byteLength: frame.audio?.byteLength || 0,
        sampleRate: frame.audio?.sampleRate || 24000,
        channels: frame.audio?.channels || 1,
        durationMs: frame.audio?.durationMs || 120,
        delayMs: Math.max(0, index * 30)
      }));
    },

    async sendInterrupt(interrupt) {
      return realtimeClient.sendInterrupt(interrupt);
    }
  };
}

export const createQwenOmniProviderStub = createQwenOmniCompatibleProvider;
