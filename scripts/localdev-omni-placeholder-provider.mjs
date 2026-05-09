import { simulateOmniTurn } from '../src/runtime/omniTurnSimulator.js';

function makePcmFloat32Base64({ sampleRate = 24000, durationMs = 120, frequency = 440, gain = 0.06 } = {}) {
  const sampleCount = Math.max(1, Math.round(sampleRate * durationMs / 1000));
  const samples = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i += 1) {
    const t = i / sampleRate;
    const fade = Math.min(1, i / Math.max(1, sampleCount * 0.2), (sampleCount - i) / Math.max(1, sampleCount * 0.2));
    samples[i] = Math.sin(2 * Math.PI * frequency * t) * gain * fade;
  }
  return { payload: Buffer.from(samples.buffer).toString('base64'), byteLength: samples.byteLength };
}

export function createPlaceholderOmniProvider() {
  const media = {
    audioFrames: 0,
    cameraFrames: 0,
    lastAudioFrame: null,
    lastCameraFrame: null
  };

  return {
    name: 'placeholder_omni_provider',
    kind: 'placeholder',

    observeMediaFrame(frame) {
      if (frame?.schema === 'omni.camera_frame.v1') {
        media.cameraFrames += 1;
        media.lastCameraFrame = frame;
      } else {
        media.audioFrames += 1;
        media.lastAudioFrame = frame;
      }
      return { ...media };
    },

    getMediaSnapshot() {
      return { ...media };
    },

    async runInference({ packet, requestId }) {
      const simulated = simulateOmniTurn(packet);
      return {
        ...simulated,
        requestId,
        adapter: 'LocalDevOmniAdapterSkeleton',
        route: packet.routing?.route || 'local_dev_omni',
        reply_audio: null,
        notes: [
          'LocalDev Adapter Skeleton placeholder output.',
          'Replace createPlaceholderOmniProvider() with a real Qwen2.5-Omni provider later.',
          `Observed media before this turn: audio=${media.audioFrames}, camera=${media.cameraFrames}.`,
          'reply_text is subtitle/log/debug only; reply_audio_frame is the output media channel.',
          ...(simulated.notes || [])
        ]
      };
    },

    createReplyAudioPlan() {
      const frameCount = 4;
      return Array.from({ length: frameCount }, (_, index) => {
        const tone = makePcmFloat32Base64({ frequency: 420 + index * 45 });
        return {
          sequence: index + 1,
          isFinal: index === frameCount - 1,
          payloadBase64: tone.payload,
          byteLength: tone.byteLength,
          sampleRate: 24000,
          channels: 1,
          durationMs: 120,
          delayMs: 100 + index * 130
        };
      });
    }
  };
}
