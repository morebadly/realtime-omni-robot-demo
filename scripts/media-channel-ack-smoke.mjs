#!/usr/bin/env node
import {
  applyMediaAck,
  createDefaultMediaChannels,
  summarizeMediaChannels,
  updateMediaChannelStats
} from '../src/runtime/omniMediaFrames.js';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function createFrame(schema, frameId) {
  return {
    schema,
    frameId,
    createdAt: new Date().toISOString(),
    media: { kind: schema === 'omni.audio_frame.v1' ? 'audio' : 'camera' }
  };
}

let channels = createDefaultMediaChannels();
const audioFrame = createFrame('omni.audio_frame.v1', 'aud_smoke_001');
const cameraFrame = createFrame('omni.camera_frame.v1', 'cam_smoke_001');

channels = updateMediaChannelStats(channels, audioFrame, 'sent');
channels = updateMediaChannelStats(channels, cameraFrame, 'sent');
channels = applyMediaAck(channels, {
  schema: 'cloudgenie.local_dev.media_ack.v1',
  receivedFrame: { schema: audioFrame.schema, frameId: audioFrame.frameId }
});
channels = applyMediaAck(channels, {
  schema: 'cloudgenie.local_dev.media_ack.v1',
  receivedFrame: { schema: cameraFrame.schema, frameId: cameraFrame.frameId }
});

assert(channels.audio.observed === 1, `expected audio observed=1, got ${channels.audio.observed}`);
assert(channels.audio.sent === 1, `expected audio sent=1, got ${channels.audio.sent}`);
assert(channels.camera.observed === 1, `expected camera observed=1, got ${channels.camera.observed}`);
assert(channels.camera.sent === 1, `expected camera sent=1, got ${channels.camera.sent}`);
assert(channels.localDev.ackCount === 2, `expected total ack=2, got ${channels.localDev.ackCount}`);
assert(channels.localDev.audioAckCount === 1, `expected audio ack=1, got ${channels.localDev.audioAckCount}`);
assert(channels.localDev.cameraAckCount === 1, `expected camera ack=1, got ${channels.localDev.cameraAckCount}`);
assert(channels.localDev.ackBySchema['omni.audio_frame.v1'] === 1, 'missing audio ackBySchema count');
assert(channels.localDev.ackBySchema['omni.camera_frame.v1'] === 1, 'missing camera ackBySchema count');

const summary = summarizeMediaChannels(channels);
assert(summary.includes('audio 1/1/ack 1'), `summary missing audio ack split: ${summary}`);
assert(summary.includes('camera 1/1/ack 1'), `summary missing camera ack split: ${summary}`);
assert(summary.includes('totalAck 2'), `summary missing total ack: ${summary}`);

console.log(`Media channel ack smoke passed: ${summary}`);
