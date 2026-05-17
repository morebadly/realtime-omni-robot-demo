#!/usr/bin/env node
// v1.3.9 Provider-specific Handshake Adapter Dry-run smoke.
//
// This smoke validates candidate-specific metadata, event mappings, error
// mappings, and the local skeleton endpoints. It does not need a real API key
// and does not contact any real provider endpoint.

import fs from 'node:fs';
import { startProviderProxySkeletonServer } from './provider-proxy-skeleton-server.mjs';
import {
  createProviderSpecificHandshakeAdapter,
  listProviderSpecificHandshakeAdapters,
  validateProviderSpecificHandshakeAdapter
} from '../src/runtime/providerSpecificHandshakeAdapters.js';
import {
  createProviderHandshakeEventMapping,
  validateProviderHandshakeEventMapping
} from '../src/runtime/providerHandshakeEventMapping.js';
import {
  PROVIDER_HANDSHAKE_ERROR_CATEGORIES,
  createProviderHandshakeErrorMapping,
  createProviderSpecificFallbackDecision,
  validateProviderHandshakeErrorMapping
} from '../src/runtime/providerHandshakeErrorMapping.js';
import {
  createProviderHandshakeDryRunReport,
  evaluateProviderSpecificHandshakeDryRun
} from '../src/runtime/providerProxyPolicy.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertNoSecretLeak(serialized, label) {
  for (const probe of ['sk-bigmodel-v139-canary', 'sk-dashscope-v139-canary', 'raw-token-v139-canary']) {
    assert(!serialized.includes(probe), `${label}: secret canary ${probe} must not leak`);
  }
}

const providerIds = [
  'bigmodel_glm_realtime_candidate',
  'dashscope_qwen_omni_candidate'
];

// 1-2. Candidate adapters exist.
const adapters = providerIds.map((providerId) => createProviderSpecificHandshakeAdapter(providerId));
assert(adapters[0]?.providerId === providerIds[0], 'BigModel candidate adapter must exist');
assert(adapters[1]?.providerId === providerIds[1], 'DashScope candidate adapter must exist');

for (const adapter of adapters) {
  const validation = validateProviderSpecificHandshakeAdapter(adapter);
  assert(validation.ok, `${adapter.providerId} adapter validation failed: ${validation.failures.join(',')}`);

  // 3-11. Safety/capability locks.
  assert(adapter.providerKind === 'real_cloud_candidate', `${adapter.providerId} providerKind must be real_cloud_candidate`);
  assert(adapter.canOpenRealtimeSocket === false, `${adapter.providerId} canOpenRealtimeSocket must be false`);
  assert(adapter.canSendRealAudio === false, `${adapter.providerId} canSendRealAudio must be false`);
  assert(adapter.canSendRealCamera === false, `${adapter.providerId} canSendRealCamera must be false`);
  assert(adapter.canStartBillingSession === false, `${adapter.providerId} canStartBillingSession must be false`);
  assert(adapter.replyTextToTts === false, `${adapter.providerId} replyTextToTts must be false`);
  assert(adapter.requiresServerSideSecret === true, `${adapter.providerId} requiresServerSideSecret must be true`);
  assert(adapter.browserDirectSocketAllowed === false, `${adapter.providerId} browserDirectSocketAllowed must be false`);
  assert(adapter.fallbackProviderId === 'localdev_mock', `${adapter.providerId} fallback must be localdev_mock`);

  // 12. Endpoint metadata exists, but the adapter is only metadata.
  assert(adapter.endpointTemplate && adapter.endpointKind === 'websocket_realtime', `${adapter.providerId} endpoint metadata must exist`);
  assert(adapter.guardrails.noFetch === true && adapter.guardrails.noWebSocket === true, `${adapter.providerId} must not send network calls`);

  const eventMapping = createProviderHandshakeEventMapping(adapter.providerId);
  const eventValidation = validateProviderHandshakeEventMapping(eventMapping);
  assert(eventValidation.ok, `${adapter.providerId} event mapping failed: ${eventValidation.failures.join(',')}`);

  // 13-14. Input/output schemas are mapped.
  for (const schema of ['omni.input_packet.v1', 'omni.audio_frame.v1', 'omni.camera_frame.v1', 'omni.interrupt.v1']) {
    assert(eventMapping.input[schema], `${adapter.providerId} event mapping must include ${schema}`);
  }
  for (const schema of ['omni.output_state.v1', 'omni.output_turn.v1', 'omni.reply_audio_frame.v1']) {
    assert(eventMapping.output[schema], `${adapter.providerId} event mapping must include ${schema}`);
  }

  // 15-19. Omni-first guardrails.
  assert(eventMapping.output['omni.reply_audio_frame.v1'].nativeAudioRequired === true, `${adapter.providerId} reply_audio_frame must be native audio`);
  assert(eventMapping.output['omni.reply_audio_frame.v1'].replyTextToTts === false, `${adapter.providerId} reply_text must not feed TTS`);
  assert(eventMapping.guardrails.asrLlmTtsRegressionForbidden === true, `${adapter.providerId} ASR->LLM->TTS regression must be forbidden`);
  assert(eventMapping.input['omni.interrupt.v1'].triggeredByAudioFrame === false, `${adapter.providerId} interrupt must not be audio-triggered`);
  assert(eventMapping.diagnostics.mediaAck.diagnosticsOnly === true && eventMapping.diagnostics.mediaAck.gatesMediaSend === false, `${adapter.providerId} media_ack must be diagnostics only`);

  const errorMapping = createProviderHandshakeErrorMapping(adapter.providerId);
  const errorValidation = validateProviderHandshakeErrorMapping(errorMapping);
  assert(errorValidation.ok, `${adapter.providerId} error mapping failed: ${errorValidation.failures.join(',')}`);

  // 20-21. Every mapped error falls back to localdev_mock and keeps real channels closed.
  for (const providerError of Object.keys(PROVIDER_HANDSHAKE_ERROR_CATEGORIES)) {
    const item = errorMapping.mappings.find((entry) => entry.providerError === providerError);
    assert(item?.fallbackProviderId === 'localdev_mock', `${adapter.providerId}/${providerError} fallback must be localdev_mock`);
    assert(item.safety.opensRealSocket === false, `${adapter.providerId}/${providerError} must not open socket`);
    assert(item.safety.uploaded === false, `${adapter.providerId}/${providerError} must not upload media`);
    assert(item.safety.billingStarted === false, `${adapter.providerId}/${providerError} must not start billing`);
  }
  for (const category of ['auth_missing', 'quota_exceeded', 'billing_required', 'socket_denied', 'media_upload_denied']) {
    const fallback = createProviderSpecificFallbackDecision(adapter.providerId, { category });
    assert(fallback.decision === 'fallback_to_localdev_mock', `${adapter.providerId}/${category} fallback decision must be localdev_mock`);
    assert(fallback.safety.opensRealSocket === false && fallback.safety.uploaded === false && fallback.safety.billingStarted === false, `${adapter.providerId}/${category} fallback must keep real channels closed`);
  }

  const report = createProviderHandshakeDryRunReport(adapter.providerId, {
    apiKey: 'sk-bigmodel-v139-canary',
    nested: { secret: 'sk-dashscope-v139-canary', tokenRawValue: 'raw-token-v139-canary' }
  });
  assert(report.status === 'dry_run_metadata_ready', `${adapter.providerId} dry-run report must be ready`);
  assert(report.secretStripped === true, `${adapter.providerId} dry-run report must strip secrets`);
  assertNoSecretLeak(JSON.stringify(report), `${adapter.providerId} dry-run report`);
  const decision = evaluateProviderSpecificHandshakeDryRun(adapter.providerId, {});
  assert(decision.decision === 'dry_run_ready', `${adapter.providerId} provider-specific dry-run must be ready`);
  assert(decision.safety.opensRealSocket === false && decision.safety.sentToProvider === false, `${adapter.providerId} dry-run must not contact provider`);
}

const listed = listProviderSpecificHandshakeAdapters();
assert(listed.length === 2, 'provider-specific adapter registry must list exactly 2 candidates');

const handle = await startProviderProxySkeletonServer({ port: 0, host: '127.0.0.1' });
const baseUrl = handle.baseUrl;

async function getJson(pathname) {
  const res = await fetch(`${baseUrl}${pathname}`);
  const text = await res.text();
  return { status: res.status, body: JSON.parse(text), raw: text };
}

async function postJson(pathname, payload) {
  const res = await fetch(`${baseUrl}${pathname}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {})
  });
  const text = await res.text();
  return { status: res.status, body: JSON.parse(text), raw: text };
}

try {
  // 22. Skeleton provider-specific endpoints return dry-run metadata.
  const providerList = await getJson('/provider-proxy/providers');
  assert(providerList.status === 200, '/provider-proxy/providers must return 200');
  assert(providerList.body.count === 2, '/provider-proxy/providers must list 2 providers');
  for (const providerId of providerIds) {
    const adapterRes = await getJson(`/provider-proxy/providers/${providerId}/handshake-adapter`);
    assert(adapterRes.status === 200 && adapterRes.body.providerId === providerId, `${providerId} adapter endpoint must return metadata`);
    const dryRunRes = await postJson(`/provider-proxy/providers/${providerId}/handshake/dry-run`, {
      apiKey: 'sk-bigmodel-v139-canary',
      secret: 'sk-dashscope-v139-canary',
      tokenRawValue: 'raw-token-v139-canary'
    });
    assert(dryRunRes.status === 200 && dryRunRes.body.decision === 'dry_run_ready', `${providerId} dry-run endpoint must return dry_run_ready`);
    assertNoSecretLeak(dryRunRes.raw, `${providerId} dry-run endpoint`);
    const eventRes = await getJson(`/provider-proxy/providers/${providerId}/event-mapping`);
    assert(eventRes.status === 200 && eventRes.body.schema === 'omni.provider_handshake_event_mapping.v1', `${providerId} event mapping endpoint must work`);
    const errorRes = await getJson(`/provider-proxy/providers/${providerId}/error-mapping`);
    assert(errorRes.status === 200 && errorRes.body.schema === 'omni.provider_handshake_error_mapping.v1', `${providerId} error mapping endpoint must work`);
  }

  // 23-24. Skeleton source remains local mock only: no provider call surface.
  const source = fs.readFileSync('scripts/provider-proxy-skeleton-server.mjs', 'utf8');
  assert(!source.includes('fetch('), 'skeleton server source must not call fetch');
  assert(!source.includes('new WebSocket('), 'skeleton server source must not construct WebSocket');
  assert(!/from\s+['"]ws['"]/m.test(source), 'skeleton server source must not import ws');
  for (const forbiddenHost of ['open.bigmodel.cn', 'dashscope.aliyuncs.com']) {
    assert(!source.includes(forbiddenHost), `skeleton server source must not contain real provider host ${forbiddenHost}`);
  }

  // 25. Smoke does not need a real API key.
  assert(baseUrl.startsWith('http://127.0.0.1:'), `smoke must use loopback only (got ${baseUrl})`);

  // 26. Secret-like request fields are stripped and never echoed.
  const dirty = await postJson('/provider-proxy/providers/bigmodel_glm_realtime_candidate/handshake/dry-run', {
    apiKey: 'sk-bigmodel-v139-canary',
    nested: { secret: 'sk-dashscope-v139-canary', tokenRawValue: 'raw-token-v139-canary' }
  });
  assert(dirty.body.secretStripped === true, 'provider-specific dry-run must report secretStripped=true');
  assertNoSecretLeak(dirty.raw, 'provider-specific dirty dry-run');

  // 27. Package smoke suite includes this test; v1.4.1 registers 29 checks overall.
  const smokeSource = fs.readFileSync('scripts/run-smoke-suite.mjs', 'utf8');
  assert(smokeSource.includes("'test:provider-specific-handshake-adapter'"), 'smoke suite must include provider-specific handshake adapter test');
  const checkCount = [...smokeSource.matchAll(/'test:[^']+'/g)].length;
  assert(checkCount === 29, `smoke suite must contain 29 checks (got ${checkCount})`);

  console.log(`Provider-specific handshake adapter smoke passed: 2 candidates · 29 checks suite · no real key · no real provider call · fallback=localdev_mock`);
} finally {
  await handle.close();
}
