#!/usr/bin/env node
import {
  applyReplyAudioFrame,
  applyRealtimeOutputInterrupt,
  createDefaultRealtimeOutputChannel,
  summarizeRealtimeOutputChannel
} from '../src/runtime/realtimeOutputChannel.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function frame(sequence, frameId = `reply_${sequence}`) {
  return {
    schema: 'omni.reply_audio_frame.v1',
    type: 'omni.reply_audio_frame',
    frameId,
    turnId: 'turn_queue_smoke',
    sequence,
    isFinal: false,
    audio: {
      kind: 'reply_audio',
      codec: 'pcm_float32',
      payloadEncoding: 'base64',
      payloadIncluded: true,
      byteLength: 16,
      payload: 'AAAAAA=='
    }
  };
}

let output = createDefaultRealtimeOutputChannel();
output = applyReplyAudioFrame(output, frame(1, 'dup_frame'));
output = applyReplyAudioFrame(output, frame(1, 'dup_frame'));
assert(output.receivedAudioFrames === 1, `duplicate should not increase received frames, got ${output.receivedAudioFrames}`);
assert(output.duplicateAudioFrames === 1, `expected duplicate count=1, got ${output.duplicateAudioFrames}`);

output = applyReplyAudioFrame(output, frame(3, 'seq_3'));
output = applyReplyAudioFrame(output, frame(2, 'seq_2'));
assert(output.outOfOrderAudioFrames === 1, `expected out-of-order count=1, got ${output.outOfOrderAudioFrames}`);
assert(output.queuedAudioFrames.map((item) => item.sequence).join(',') === '1,2,3', 'out-of-order reply frames should be retained in playback order');

for (let i = 4; i <= 62; i += 1) {
  output = applyReplyAudioFrame(output, frame(i));
}

assert(output.queuedAudioFrames.length === 48, `queue should cap at 48, got ${output.queuedAudioFrames.length}`);
assert(output.droppedAudioFrames > 0, 'queue overflow should record dropped frames');
assert(output.queuedAudioFrames[0].sequence === 15, `oldest retained sequence should be 15, got ${output.queuedAudioFrames[0].sequence}`);

output = applyRealtimeOutputInterrupt(output, { reason: 'user_barge_in', turnId: 'turn_queue_smoke' });
assert(output.queuedAudioFrames.length === 0, 'interrupt should clear queued output');
assert(output.playbackActive === false, 'interrupt should stop playback');

const summary = summarizeRealtimeOutputChannel(output);
assert(summary.includes('dropped'), `summary should include dropped count: ${summary}`);

console.log('Realtime output queue smoke passed.');
