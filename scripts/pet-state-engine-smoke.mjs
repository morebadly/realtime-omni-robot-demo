#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createInitialPetState, createPetActionFromState, reducePetState } from '../src/runtime/petStateEngine.js';

const FORBIDDEN_FIELDS = ['reply_text', 'replyText', 'speech', 'speechText', 'tts', 'text', 'utterance', 'message'];

function actionFor(event, startState = createInitialPetState()) {
  const nextState = reducePetState(startState, event, new Date('2026-06-17T00:00:00.000Z'));
  const action = createPetActionFromState(nextState, event, new Date('2026-06-17T00:00:00.000Z'));
  return { nextState, action };
}

function assertNoSpeech(action) {
  assert.equal(action.speechForbidden, true);
  for (const field of FORBIDDEN_FIELDS) {
    assert.equal(Object.hasOwn(action, field), false, `pet action must not contain ${field}`);
  }
}

const head = actionFor({ type: 'touch.event', area: 'head' });
assert.ok(['happy', 'comforted'].includes(head.action.petState));
assert.ok(['happy_eyes', 'comforted_eyes'].includes(head.action.expression));
assert.equal(head.action.speechForbidden, true);

const work = actionFor({ type: 'pet.work_session.long' });
assert.equal(work.action.petState, 'concerned');
assert.equal(work.action.expression, 'soft_worried_eyes');
assert.equal(work.nextState.restReminder.active, true);
assertNoSpeech(work.action);

const cameraClosed = actionFor({ type: 'pet.camera.closed' });
assert.equal(cameraClosed.action.petState, 'privacy_closed');
assert.equal(cameraClosed.action.expression, 'privacy_closed_eyes');
assert.equal(cameraClosed.nextState.cameraOpen, false);
assertNoSpeech(cameraClosed.action);

const battery = actionFor({ type: 'pet.battery.low' });
assert.equal(battery.action.petState, 'low_battery');
assert.equal(battery.action.expression, 'sleepy_eyes');
assert.equal(battery.action.motion, 'sleep_breathing');
assertNoSpeech(battery.action);

for (const event of [
  { type: 'touch.event', area: 'face' },
  { type: 'touch.event', area: 'back' },
  { type: 'nfc.detected', label: 'food' },
  { type: 'nfc.detected', label: 'sleep_hat' },
  { type: 'network.offline' },
  { type: 'pet.user.returned' }
]) {
  assertNoSpeech(actionFor(event).action);
}

console.log('pet-state-engine smoke passed');
