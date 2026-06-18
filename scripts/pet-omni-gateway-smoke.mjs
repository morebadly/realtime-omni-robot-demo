#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { analyzePetOmni, createPetOmniGatewayHandler, normalizeProviderPetAction, PET_ACTION_SCHEMA } from './pet-omni-gateway.mjs';

const SECRET = 'pet-secret-raw-value-12345';

function baseBody(overrides = {}) {
  return {
    frame: {
      schema: 'cloudgenie.pet_eye_frame.v1',
      frameId: 'frame-1',
      rawDataUrl: 'data:image/jpeg;base64,AAAA',
      capturedAt: '2026-06-17T00:00:00.000Z',
      uploadStatus: 'local_only'
    },
    facts: [{ type: 'pet.work_session.long', timestamp: '2026-06-17T00:00:00.000Z', label: 'work' }],
    currentPetState: 'idle',
    permissions: {},
    ...overrides
  };
}

function assertNoSecretLeak(value) {
  const text = JSON.stringify(value);
  assert.equal(text.includes(SECRET), false, 'raw key leaked');
  assert.equal(text.includes('pet-secret'), false, 'key prefix leaked');
  assert.equal(/key(length|Length)"?\s*:\s*\d+/.test(text), false, 'key length leaked');
  assert.equal(/key(hash|Hash|prefix|Prefix|masked|Masked)/.test(text), false, 'derived key material leaked');
}

function assertPetAction(action) {
  assert.equal(action.schema, PET_ACTION_SCHEMA);
  assert.equal(action.speechForbidden, true);
  for (const key of ['reply_text', 'replyText', 'speech', 'speechText', 'tts', 'text', 'utterance', 'message']) {
    assert.equal(Object.hasOwn(action, key), false, `unexpected speech field ${key}`);
  }
}

function assertReceipt(action, { uploaded, reason, frameId = 'frame-1' }) {
  assert.equal(action.uploadReceipt?.schema, 'cloudgenie.pet_upload_receipt.v1');
  assert.equal(action.uploadReceipt.uploaded, uploaded);
  assert.equal(action.uploadReceipt.reason, reason);
  assert.equal(action.uploadReceipt.frameId, frameId);
  assert.equal(action.uploadReceipt.rawImageIncluded, uploaded);
}

const disabled = await analyzePetOmni(baseBody(), {
  PET_OMNI_PROVIDER: 'future_omni_pet_adapter',
  PET_OMNI_API_KEY: SECRET,
  PET_OMNI_CLOUD_ENABLED: '0'
});
assert.equal(disabled.status, 200);
assertPetAction(disabled.body);
assert.equal(disabled.body.source, 'localdev_mock');
assertReceipt(disabled.body, { uploaded: false, reason: 'cloud_disabled' });
assertNoSecretLeak(disabled.body);

const permissionBlocked = await analyzePetOmni(baseBody({
  permissions: { cameraUpload: false },
  frame: {
    schema: 'cloudgenie.pet_eye_frame.v1',
    frameId: 'frame-2',
    rawDataUrl: 'data:image/jpeg;base64,BBBB',
    capturedAt: '2026-06-17T00:00:00.000Z',
    uploadStatus: 'cloud_allowed_but_not_sent'
  }
}), {
  PET_OMNI_PROVIDER: 'future_omni_pet_adapter',
  PET_OMNI_API_KEY: SECRET,
  PET_OMNI_CLOUD_ENABLED: '1'
});
assert.equal(permissionBlocked.status, 200);
assertPetAction(permissionBlocked.body);
assert.equal(permissionBlocked.body.source, 'localdev_mock');
assertReceipt(permissionBlocked.body, { uploaded: false, reason: 'camera_permission_denied', frameId: 'frame-2' });
assertNoSecretLeak(permissionBlocked.body);

let fetchCalled = false;
const realFetch = globalThis.fetch;
globalThis.fetch = async () => {
  fetchCalled = true;
  throw new Error('fetch_must_not_run_by_default');
};
const realCallsDisabled = await analyzePetOmni(baseBody({
  permissions: { cameraUpload: true },
  facts: [{ type: 'touch.event', timestamp: '2026-06-17T00:00:00.000Z', label: 'head' }]
}), {
  PET_OMNI_PROVIDER: 'openai_realtime',
  OPENAI_API_KEY: SECRET,
  PET_OMNI_CLOUD_ENABLED: '1',
  PET_OMNI_ALLOW_CAMERA_UPLOAD: '1'
});
assert.equal(fetchCalled, false);
assert.equal(realCallsDisabled.status, 200);
assertPetAction(realCallsDisabled.body);
assert.equal(realCallsDisabled.body.source, 'localdev_mock');
assertReceipt(realCallsDisabled.body, { uploaded: false, reason: 'real_provider_calls_disabled' });
assertNoSecretLeak(realCallsDisabled.body);
globalThis.fetch = realFetch;

let capturedProviderRequest = null;
globalThis.fetch = async (url, options) => {
  capturedProviderRequest = { url, options };
  return {
    ok: true,
    async json() {
      return {
        output_text: JSON.stringify({
          schema: PET_ACTION_SCHEMA,
          source: 'future_omni_pet_adapter',
          petState: 'happy',
          expression: 'happy_eyes',
          motion: 'happy_bounce',
          sound: 'happy_chirp',
          icon: 'none',
          reasonCode: 'touch_head',
          speechForbidden: true,
          speech: 'strip me'
        })
      };
    }
  };
};
const openaiCall = await analyzePetOmni(baseBody({
  permissions: { cameraUpload: true },
  facts: [{ type: 'touch.event', timestamp: '2026-06-17T00:00:00.000Z', label: 'head' }]
}), {
  PET_OMNI_PROVIDER: 'openai_realtime',
  OPENAI_API_KEY: SECRET,
  PET_OMNI_CLOUD_ENABLED: '1',
  PET_OMNI_REAL_PROVIDER_CALLS: '1',
  PET_OMNI_ALLOW_CAMERA_UPLOAD: '1'
});
assert.equal(openaiCall.status, 200);
assertPetAction(openaiCall.body);
assertReceipt(openaiCall.body, { uploaded: true, reason: 'frame_sent_to_provider' });
assert.equal(capturedProviderRequest.options.headers.Authorization, `Bearer ${SECRET}`);
const openaiPayload = JSON.parse(capturedProviderRequest.options.body);
assert.equal(JSON.stringify(openaiPayload).includes('input_image'), true);
assertNoSecretLeak(openaiCall.body);
globalThis.fetch = realFetch;

globalThis.fetch = async (url, options) => {
  capturedProviderRequest = { url, options };
  return {
    ok: true,
    async json() {
      return {
        choices: [{
          message: {
            content: JSON.stringify({
              petState: 'comforted',
              expression: 'comforted_eyes',
              motion: 'tiny_wiggle',
              sound: 'purr',
              icon: 'leaf',
              reasonCode: 'touch_back',
              text: 'strip me'
            })
          }
        }]
      };
    }
  };
};
const dashscopeFactsOnly = await analyzePetOmni(baseBody({
  permissions: { cameraUpload: true },
  facts: [{ type: 'touch.event', timestamp: '2026-06-17T00:00:00.000Z', label: 'back' }]
}), {
  PET_OMNI_PROVIDER: 'dashscope_qwen_omni',
  DASHSCOPE_API_KEY: SECRET,
  PET_OMNI_CLOUD_ENABLED: '1',
  PET_OMNI_REAL_PROVIDER_CALLS: '1',
  PET_OMNI_ALLOW_CAMERA_UPLOAD: '0'
});
assert.equal(dashscopeFactsOnly.status, 200);
assertPetAction(dashscopeFactsOnly.body);
assert.equal(dashscopeFactsOnly.body.source, 'localdev_mock');
assertReceipt(dashscopeFactsOnly.body, { uploaded: false, reason: 'camera_upload_env_disabled' });
globalThis.fetch = realFetch;

const stripped = normalizeProviderPetAction({
  petState: 'happy',
  expression: 'happy_eyes',
  motion: 'happy_bounce',
  sound: 'happy_chirp',
  icon: 'none',
  reasonCode: 'touch_head',
  speech: 'hello',
  reply_text: 'hello',
  tts: { text: 'hello' }
}, baseBody());
assertPetAction(stripped);

const server = createServer(createPetOmniGatewayHandler({
  env: {
    PET_OMNI_PROVIDER: 'future_omni_pet_adapter',
    PET_OMNI_API_KEY: SECRET,
    PET_OMNI_CLOUD_ENABLED: '1'
  }
}));
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const { port } = server.address();
const health = await fetch(`http://127.0.0.1:${port}/health`).then((res) => res.json());
assert.deepEqual(Object.keys(health).sort(), ['cloudEnabled', 'keyPresent', 'ok', 'provider'].sort());
assert.equal(health.ok, true);
assert.equal(health.keyPresent, true);
assertNoSecretLeak(health);
await new Promise((resolve) => server.close(resolve));

console.log('pet-omni-gateway smoke passed');
