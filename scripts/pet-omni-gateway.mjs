#!/usr/bin/env node
import http from 'node:http';
import { URL, fileURLToPath } from 'node:url';
import { createPetAction, PET_ACTION_SCHEMA, PET_EYE_FRAME_SCHEMA } from '../src/runtime/petBehaviorProtocol.js';

const DEFAULT_HOST = process.env.PET_OMNI_GATEWAY_HOST || '127.0.0.1';
const DEFAULT_PORT = Number(process.env.PET_OMNI_GATEWAY_PORT || 8021);
const PROVIDER_KEY_ENV_BY_PROVIDER = Object.freeze({
  local_mock: 'PET_OMNI_API_KEY',
  future_omni_pet_adapter: 'PET_OMNI_API_KEY',
  openai_realtime: 'OPENAI_API_KEY',
  dashscope_qwen_omni: 'DASHSCOPE_API_KEY',
  bigmodel_glm_realtime_candidate: 'BIGMODEL_API_KEY',
  dashscope_qwen_omni_candidate: 'DASHSCOPE_API_KEY'
});

const FORBIDDEN_TEXT_FIELDS = new Set([
  'reply_text',
  'replyText',
  'speech',
  'speechText',
  'tts',
  'text',
  'utterance',
  'message',
  'spokenText',
  'humanSpeech'
]);

function getProviderConfig(env = process.env) {
  const provider = env.PET_OMNI_PROVIDER || 'local_mock';
  const keyEnvName = PROVIDER_KEY_ENV_BY_PROVIDER[provider] || 'PET_OMNI_API_KEY';
  const keyValue = env[keyEnvName];
  return {
    provider,
    cloudEnabled: env.PET_OMNI_CLOUD_ENABLED === '1',
    realProviderCallsEnabled: env.PET_OMNI_REAL_PROVIDER_CALLS === '1',
    cameraUploadEnvAllowed: env.PET_OMNI_ALLOW_CAMERA_UPLOAD === '1',
    keyEnvName,
    keyPresent: Boolean(keyValue)
  };
}

function getProviderKey(provider, env = process.env) {
  const keyEnvName = PROVIDER_KEY_ENV_BY_PROVIDER[provider] || 'PET_OMNI_API_KEY';
  return env[keyEnvName] || '';
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
    'X-Pet-Omni-Gateway': 'server-side-skeleton',
    'X-Calls-Real-Provider': 'false'
  });
  res.end(payload);
}

function sendError(res, status, error) {
  sendJson(res, status, {
    ok: false,
    error,
    fallbackProviderId: 'localdev_mock'
  });
}

async function readJsonBody(req, maxBytes = 4 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let received = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      received += chunk.length;
      if (received > maxBytes) {
        reject(new Error('payload_too_large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (chunks.length === 0) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (err) {
        reject(new Error('invalid_json'));
      }
    });
    req.on('error', reject);
  });
}

function permissionAllowsCameraUpload(permissions) {
  if (!permissions) return false;
  if (permissions.cameraUpload === true || permissions.allowCameraUpload === true) return true;
  if (permissions.camera?.upload === true || permissions.camera?.cloudUpload === true) return true;
  if (Array.isArray(permissions)) {
    return permissions.some((item) => (
      item === 'camera.cloud_upload' ||
      item === 'camera.upload' ||
      item?.key === 'camera.cloud_upload' && item?.status === 'enabled'
    ));
  }
  return false;
}

function createUploadReceipt({
  provider,
  frame,
  uploaded = false,
  reason = 'not_sent',
  endpointKind = 'none',
  requestId = null
}) {
  return {
    schema: 'cloudgenie.pet_upload_receipt.v1',
    provider,
    frameId: frame?.frameId || null,
    capturedAt: frame?.capturedAt || null,
    uploadStatus: uploaded ? 'sent_to_gateway' : (frame?.uploadStatus || 'local_only'),
    uploaded: Boolean(uploaded),
    rawImageIncluded: Boolean(uploaded && frame?.rawDataUrl),
    endpointKind,
    requestId,
    reason,
    createdAt: new Date().toISOString()
  };
}

function reasonFromFacts(facts = [], frame = {}) {
  const types = new Set(facts.map((fact) => fact?.type).filter(Boolean));
  const labels = new Set(facts.map((fact) => fact?.label).filter(Boolean));
  if (frame.uploadStatus === 'local_only' && !frame.rawDataUrl) return 'camera_closed';
  if (types.has('pet.work_session.long')) return 'work_session_long';
  if (types.has('pet.battery.low')) return 'battery_low';
  if (types.has('touch.event') && labels.has('head')) return 'touch_head';
  if (types.has('touch.event') && labels.has('face')) return 'touch_face';
  if (types.has('touch.event') && labels.has('back')) return 'touch_back';
  if (types.has('nfc.detected') && labels.has('food')) return 'nfc_food';
  if (types.has('nfc.detected') && labels.has('sleep_hat')) return 'nfc_sleep_hat';
  if (types.has('network.offline')) return 'offline';
  return 'idle_tick';
}

function localActionForRequest(body = {}, source = 'localdev_mock') {
  const reasonCode = reasonFromFacts(body.facts || [], body.frame || {});
  const map = {
    camera_closed: { petState: 'privacy_closed', expression: 'privacy_closed_eyes', motion: 'none', sound: 'none', icon: 'privacy_eye_closed' },
    work_session_long: { petState: 'concerned', expression: 'soft_worried_eyes', motion: 'nudge_forward_small', sound: 'soft_hum', icon: 'stretch' },
    battery_low: { petState: 'low_battery', expression: 'sleepy_eyes', motion: 'sleep_breathing', sound: 'sleep_breath', icon: 'sleep_hat' },
    touch_head: { petState: 'happy', expression: 'happy_eyes', motion: 'tiny_wiggle', sound: 'purr', icon: 'none' },
    touch_face: { petState: 'curious', expression: 'curious_eyes', motion: 'tiny_wiggle', sound: 'happy_chirp', icon: 'none' },
    touch_back: { petState: 'comforted', expression: 'comforted_eyes', motion: 'tiny_wiggle', sound: 'purr', icon: 'leaf' },
    nfc_food: { petState: 'comforted', expression: 'comforted_eyes', motion: 'happy_bounce', sound: 'happy_chirp', icon: 'food' },
    nfc_sleep_hat: { petState: 'sleepy', expression: 'sleepy_eyes', motion: 'sleep_breathing', sound: 'sleep_breath', icon: 'sleep_hat' },
    offline: { petState: 'offline_pet', expression: 'idle_eyes', motion: 'tiny_wiggle', sound: 'soft_hum', icon: 'leaf' },
    idle_tick: { petState: body.currentPetState || 'idle', expression: 'idle_eyes', motion: 'none', sound: 'none', icon: 'none' }
  };
  return createPetAction({
    source,
    reasonCode,
    ...(map[reasonCode] || map.idle_tick)
  });
}

function withUploadReceipt(action, receipt) {
  return {
    ...action,
    uploadReceipt: receipt || null
  };
}

function stripSpeechFields(value) {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(stripSpeechFields);
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !FORBIDDEN_TEXT_FIELDS.has(key))
      .map(([key, item]) => [key, stripSpeechFields(item)])
  );
}

export function normalizeProviderPetAction(providerResponse = {}, fallbackBody = {}) {
  const safe = stripSpeechFields(providerResponse);
  return createPetAction({
    source: 'future_omni_pet_adapter',
    petState: safe.petState || fallbackBody.currentPetState || 'idle',
    expression: safe.expression || 'idle_eyes',
    motion: safe.motion || 'none',
    sound: safe.sound || 'none',
    icon: safe.icon || 'none',
    reasonCode: safe.reasonCode || reasonFromFacts(fallbackBody.facts || [], fallbackBody.frame || {})
  });
}

async function syntheticProviderAnalyze(body) {
  const action = localActionForRequest(body, 'future_omni_pet_adapter');
  return {
    ...action,
    speech: 'provider text must be stripped',
    reply_text: 'provider text must be stripped',
    tts: { text: 'provider text must be stripped' }
  };
}

function buildPetJsonInstruction() {
  return [
    'Return only one JSON object matching cloudgenie.pet_action.v1.',
    'Allowed fields: schema, source, petState, expression, motion, sound, icon, reasonCode, speechForbidden, createdAt.',
    'speechForbidden must be true.',
    'Do not include speech, text, reply_text, tts, audio, transcript, message, or human-language utterance.'
  ].join(' ');
}

function createOpenAIRealtimeAdapter(env = process.env) {
  return {
    provider: 'openai_realtime',
    endpointKind: 'openai_responses_server_side_json',
    model: env.PET_OMNI_OPENAI_MODEL || 'gpt-4o-mini',
    async analyze({ body, apiKey, includeImage }) {
      const content = [
        {
          type: 'input_text',
          text: `${buildPetJsonInstruction()}\nFacts: ${JSON.stringify(body.facts || [])}\nCurrent pet state: ${body.currentPetState || 'idle'}`
        }
      ];
      if (includeImage && body.frame?.rawDataUrl) {
        content.push({ type: 'input_image', image_url: body.frame.rawDataUrl });
      }
      const response = await fetch(env.PET_OMNI_OPENAI_ENDPOINT || 'https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: this.model,
          input: [{ role: 'user', content }],
          text: {
            format: {
              type: 'json_object'
            }
          }
        })
      });
      if (!response.ok) {
        throw new Error(`openai_provider_error_${response.status}`);
      }
      const result = await response.json();
      const outputText = result.output_text || result.output?.flatMap((item) => item.content || []).find((item) => item.text)?.text || '{}';
      return JSON.parse(outputText);
    }
  };
}

function createDashScopeQwenOmniAdapter(env = process.env) {
  return {
    provider: 'dashscope_qwen_omni',
    endpointKind: 'dashscope_openai_compatible_chat_json',
    model: env.PET_OMNI_DASHSCOPE_MODEL || 'qwen3-omni-flash',
    async analyze({ body, apiKey, includeImage }) {
      const content = [
        {
          type: 'text',
          text: `${buildPetJsonInstruction()}\nFacts: ${JSON.stringify(body.facts || [])}\nCurrent pet state: ${body.currentPetState || 'idle'}`
        }
      ];
      if (includeImage && body.frame?.rawDataUrl) {
        content.push({ type: 'image_url', image_url: { url: body.frame.rawDataUrl } });
      }
      const response = await fetch(env.PET_OMNI_DASHSCOPE_ENDPOINT || 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: this.model,
          messages: [{ role: 'user', content }],
          modalities: ['text'],
          response_format: { type: 'json_object' },
          extra_body: { enable_thinking: false }
        })
      });
      if (!response.ok) {
        throw new Error(`dashscope_provider_error_${response.status}`);
      }
      const result = await response.json();
      const outputText = result.choices?.[0]?.message?.content || '{}';
      return typeof outputText === 'string' ? JSON.parse(outputText) : outputText;
    }
  };
}

function getProviderAdapter(provider, env = process.env) {
  if (provider === 'openai_realtime') return createOpenAIRealtimeAdapter(env);
  if (provider === 'dashscope_qwen_omni') return createDashScopeQwenOmniAdapter(env);
  return null;
}

function validateAnalyzeBody(body) {
  if (!body || typeof body !== 'object') return 'body_required';
  if (body.frame?.schema !== PET_EYE_FRAME_SCHEMA) return 'pet_eye_frame_required';
  if (!body.frame.rawDataUrl && !body.frame.frameId) return 'frame_rawDataUrl_or_frameId_required';
  if (body.frame.uploadStatus && !['local_only', 'cloud_allowed_but_not_sent', 'sent_to_gateway'].includes(body.frame.uploadStatus)) {
    return 'invalid_upload_status';
  }
  return null;
}

export async function analyzePetOmni(body, env = process.env) {
  const validationError = validateAnalyzeBody(body);
  if (validationError) {
    return { status: 400, body: { ok: false, error: validationError, fallbackProviderId: 'localdev_mock' } };
  }

  const providerConfig = getProviderConfig(env);
  const noUploadReceipt = createUploadReceipt({
    provider: providerConfig.provider,
    frame: body.frame,
    uploaded: false,
    reason: providerConfig.cloudEnabled ? 'cloud_gate_pending' : 'cloud_disabled'
  });
  if (!providerConfig.cloudEnabled) {
    return { status: 200, body: withUploadReceipt(localActionForRequest(body, 'localdev_mock'), noUploadReceipt) };
  }

  const userCameraAllowed = permissionAllowsCameraUpload(body.permissions);
  const includeImage = Boolean(
    providerConfig.cameraUploadEnvAllowed &&
    userCameraAllowed &&
    body.frame?.rawDataUrl
  );
  if (!userCameraAllowed) {
    return {
      status: 200,
      body: withUploadReceipt(
        localActionForRequest(body, 'localdev_mock'),
        createUploadReceipt({
          provider: providerConfig.provider,
          frame: body.frame,
          uploaded: false,
          reason: 'camera_permission_denied'
        })
      )
    };
  }

  if (!providerConfig.cameraUploadEnvAllowed && body.frame?.rawDataUrl) {
    return {
      status: 200,
      body: withUploadReceipt(
        localActionForRequest(body, 'localdev_mock'),
        createUploadReceipt({
          provider: providerConfig.provider,
          frame: body.frame,
          uploaded: false,
          reason: 'camera_upload_env_disabled'
        })
      )
    };
  }

  if (!providerConfig.realProviderCallsEnabled) {
    return {
      status: 200,
      body: withUploadReceipt(
        localActionForRequest(body, 'localdev_mock'),
        createUploadReceipt({
          provider: providerConfig.provider,
          frame: body.frame,
          uploaded: false,
          reason: 'real_provider_calls_disabled'
        })
      )
    };
  }

  const adapter = getProviderAdapter(providerConfig.provider, env);
  const apiKey = getProviderKey(providerConfig.provider, env);
  if (!adapter || !apiKey) {
    return {
      status: 200,
      body: withUploadReceipt(
        localActionForRequest(body, 'localdev_mock'),
        createUploadReceipt({
          provider: providerConfig.provider,
          frame: body.frame,
          uploaded: false,
          reason: adapter ? 'provider_key_missing' : 'provider_adapter_missing'
        })
      )
    };
  }

  try {
    const providerResponse = await adapter.analyze({ body, apiKey, includeImage });
    const action = normalizeProviderPetAction(providerResponse, body);
    return {
      status: 200,
      body: withUploadReceipt(action, createUploadReceipt({
        provider: providerConfig.provider,
        frame: body.frame,
        uploaded: includeImage,
        endpointKind: adapter.endpointKind,
        reason: includeImage ? 'frame_sent_to_provider' : 'facts_only_provider_call'
      }))
    };
  } catch (err) {
    return {
      status: 200,
      body: withUploadReceipt(
        localActionForRequest(body, 'localdev_mock'),
        createUploadReceipt({
          provider: providerConfig.provider,
          frame: body.frame,
          uploaded: false,
          endpointKind: adapter.endpointKind,
          reason: 'provider_error_fallback'
        })
      )
    };
  }
}

export function createPetOmniGatewayHandler(options = {}) {
  const env = options.env || process.env;
  return async function handler(req, res) {
    const url = new URL(req.url || '/', `http://${req.headers.host || `${DEFAULT_HOST}:${DEFAULT_PORT}`}`);
    const route = `${req.method} ${url.pathname}`;

    try {
      if (route === 'GET /health') {
        const { provider, cloudEnabled, keyPresent } = getProviderConfig(env);
        return sendJson(res, 200, { ok: true, provider, cloudEnabled, keyPresent });
      }

      if (route === 'POST /pet-omni/analyze') {
        const body = await readJsonBody(req);
        const result = await analyzePetOmni(body, env);
        return sendJson(res, result.status, result.body);
      }

      if (route === 'POST /pet-omni/realtime/session') {
        return sendJson(res, 501, createPetAction({
          source: 'localdev_mock',
          petState: 'offline_pet',
          expression: 'idle_eyes',
          motion: 'none',
          sound: 'none',
          icon: 'leaf',
          reasonCode: 'offline'
        }));
      }

      return sendError(res, 404, 'not_found');
    } catch (err) {
      return sendError(res, err.message === 'payload_too_large' ? 413 : 400, err.message || 'request_failed');
    }
  };
}

export function startPetOmniGateway(options = {}) {
  const host = options.host || DEFAULT_HOST;
  const port = Number(options.port || DEFAULT_PORT);
  const server = http.createServer(createPetOmniGatewayHandler(options));
  server.listen(port, host, () => {
    console.log(`Pet Omni Gateway skeleton listening on http://${host}:${port}`);
    console.log('No real provider traffic is enabled by default.');
  });
  return server;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startPetOmniGateway();
}

export { PET_ACTION_SCHEMA };
