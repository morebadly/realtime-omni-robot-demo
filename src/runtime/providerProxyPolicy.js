// providerProxyPolicy.js
//
// v1.3.7 Provider Proxy Policy.
//
// Pure functions that model how a future server-side proxy / Robot Gateway /
// Device Runtime would evaluate restricted requests from a Web Console and
// optionally issue ephemeral session tokens.
//
// In v1.3.7 this module is Runtime-only and Mock-safe:
//   - NEVER stores real API keys (any apiKey/secret/tokenRawValue field in
//     the request is stripped before any return value is built).
//   - NEVER returns tokens that unlock real audio/camera upload, real
//     realtime sockets, billing, or reply_text -> TTS.
//   - real_cloud and self_hosted providers are denied by default.
//   - synthetic_test, localdev_mock, offline_pet_engine can receive a
//     synthetic_only token descriptor.
//   - Any request that asks for `media.audio.upload`, `media.camera.upload`,
//     `billing.start`, `provider.realtime.open`, or `reply_text.tts` is
//     denied with explicit blockReasons.

import {
  PROVIDER_PROXY_CONTRACT_SCHEMA,
  PROVIDER_PROXY_DECISION_SCHEMA,
  PROVIDER_PROXY_REQUEST_SCHEMA,
  PROVIDER_PROXY_DENIED_SCOPES,
  PROVIDER_PROXY_ALLOWED_SYNTHETIC_SCOPES,
  PROVIDER_PROXY_ALLOWED_DRY_RUN_SCOPES,
  PROVIDER_PROXY_TOKEN_KINDS,
  createProviderProxyContract
} from './providerProxyContract.js';
import {
  createEphemeralSessionToken,
  validateEphemeralSessionToken,
  EPHEMERAL_SESSION_TOKEN_SCHEMA
} from './providerEphemeralSession.js';
import { getProviderCapability } from './providerCapabilities.js';
import {
  getProviderSpecificHandshakeAdapter,
  listProviderSpecificHandshakeAdapters,
  validateProviderSpecificHandshakeAdapter,
  summarizeProviderSpecificHandshakeAdapter
} from './providerSpecificHandshakeAdapters.js';
import {
  createProviderHandshakeEventMapping,
  validateProviderHandshakeEventMapping
} from './providerHandshakeEventMapping.js';
import {
  createProviderHandshakeErrorMapping,
  validateProviderHandshakeErrorMapping,
  createProviderSpecificFallbackDecision as createProviderSpecificFallbackDecisionEnvelope
} from './providerHandshakeErrorMapping.js';

const SECRET_FIELD_NAMES = new Set([
  'apiKey',
  'apikey',
  'api_key',
  'token',
  'tokenRawValue',
  'token_raw',
  'authorization',
  'auth',
  'secret',
  'clientSecret',
  'client_secret',
  'accessKey',
  'access_key',
  'accessKeyId',
  'accessKeySecret',
  'refreshToken',
  'refresh_token',
  'bearerToken',
  'bearer_token',
  'password',
  'sessionKey',
  'session_key',
  'authToken'
]);

const REAL_ACTION_SCOPE_MAP = {
  realAudioUpload: 'media.audio.upload',
  realCameraUpload: 'media.camera.upload',
  realtimeBilling: 'billing.start',
  realProviderSocket: 'provider.realtime.open',
  replyTextToTts: 'reply_text.tts'
};

function isRealProviderKind(kind) {
  return kind === 'real_cloud' || kind === 'self_hosted' || kind === 'real_cloud_candidate';
}

function stripSecrets(obj, droppedOut) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    return obj.map((item) => stripSecrets(item, droppedOut));
  }
  const out = {};
  for (const [key, value] of Object.entries(obj)) {
    if (SECRET_FIELD_NAMES.has(key)) {
      droppedOut.push(key);
      continue;
    }
    if (value && typeof value === 'object') {
      out[key] = stripSecrets(value, droppedOut);
    } else {
      out[key] = value;
    }
  }
  return out;
}

export function createDefaultProviderProxyPolicy(overrides = {}) {
  const contract = createProviderProxyContract();
  return {
    schema: 'omni.provider_proxy_policy.v1',
    contract,
    defaultTokenKind: 'synthetic_only',
    defaultTtlMs: contract.defaultTtlMs,
    allowDryRunTokenForSynthetic: true,
    allowSyntheticTokenForLocalDevMock: true,
    allowSyntheticTokenForOfflineEngine: true,
    denyRealCloudByDefault: true,
    denySelfHostedByDefault: true,
    fallbackProviderId: 'localdev_mock',
    safety: {
      apiKeyAllowedInRequest: false,
      apiKeyAllowedInResponse: false,
      uploadAllowed: false,
      billingAllowed: false,
      socketOpenAllowed: false,
      replyTextToTts: false
    },
    ...overrides,
    notes: overrides.notes || [
      'Real provider keys live server-side. Web Console must never send them.',
      'Any secret-like field in the request is stripped before evaluation.',
      'Default decision for real providers is denied.',
      'All issued tokens are synthetic_only or dry_run_only.'
    ]
  };
}

function describeBlockReasons(request) {
  const reasons = [];
  if (!request || typeof request !== 'object') return reasons;
  for (const [key, scope] of Object.entries(REAL_ACTION_SCOPE_MAP)) {
    if (request[key] === true) {
      reasons.push(`requested_${key}_blocked:${scope}`);
    }
  }
  if (Array.isArray(request.requestedScope)) {
    for (const s of request.requestedScope) {
      if (typeof s === 'string' && PROVIDER_PROXY_DENIED_SCOPES.includes(s)) {
        reasons.push(`scope_denied:${s}`);
      }
    }
  }
  if (request.providerSecretInline) {
    reasons.push('provider_secret_must_not_be_inline');
  }
  return reasons;
}

function pickAllowedScope(tokenKind, requestedScope) {
  const allowed = tokenKind === 'dry_run_only'
    ? PROVIDER_PROXY_ALLOWED_DRY_RUN_SCOPES
    : PROVIDER_PROXY_ALLOWED_SYNTHETIC_SCOPES;
  if (!Array.isArray(requestedScope) || requestedScope.length === 0) return [...allowed];
  const out = [];
  for (const s of requestedScope) {
    if (typeof s !== 'string') continue;
    if (PROVIDER_PROXY_DENIED_SCOPES.includes(s)) continue;
    if (allowed.includes(s) && !out.includes(s)) out.push(s);
  }
  return out.length > 0 ? out : [...allowed];
}

function buildDecisionEnvelope({
  decision,
  policy,
  providerId,
  providerKind,
  tokenKind,
  token,
  blockReasons,
  secretStripped,
  strippedFields,
  scrubbedRequest,
  notes
}) {
  return {
    schema: PROVIDER_PROXY_DECISION_SCHEMA,
    decision,
    providerId,
    providerKind,
    tokenKind: tokenKind || null,
    token: token || null,
    fallbackProviderId: policy.fallbackProviderId,
    contractSchema: PROVIDER_PROXY_CONTRACT_SCHEMA,
    tokenSchema: EPHEMERAL_SESSION_TOKEN_SCHEMA,
    blockReasons: blockReasons || [],
    secretStripped: secretStripped === true,
    strippedFields: strippedFields || [],
    scrubbedRequest: scrubbedRequest || null,
    safety: {
      opensRealSocket: false,
      canSendRealAudio: false,
      canSendRealCamera: false,
      canStartBillingSession: false,
      replyTextToTts: false,
      sentToProvider: false,
      uploaded: false,
      persisted: false,
      apiKeyReturned: false,
      apiKeyAccepted: false
    },
    decidedAt: new Date().toISOString(),
    notes: notes || []
  };
}

export function evaluateProviderProxyRequest(request = {}, policy = null) {
  const effectivePolicy = policy || createDefaultProviderProxyPolicy();
  const strippedFields = [];
  const scrubbedRequest = stripSecrets({ ...request, schema: PROVIDER_PROXY_REQUEST_SCHEMA }, strippedFields);
  const secretStripped = strippedFields.length > 0;

  const providerId = scrubbedRequest.providerId || 'localdev_mock';
  const capability = getProviderCapability(providerId);
  const providerKind = capability?.providerKind || 'unknown';
  const blockReasons = describeBlockReasons(scrubbedRequest);

  const realActionRequested = blockReasons.length > 0;
  const realProvider = isRealProviderKind(providerKind);

  if (realActionRequested) {
    return buildDecisionEnvelope({
      decision: 'denied',
      policy: effectivePolicy,
      providerId,
      providerKind,
      tokenKind: null,
      token: null,
      blockReasons,
      secretStripped,
      strippedFields,
      scrubbedRequest,
      notes: ['Real audio upload / camera upload / billing / socket / TTS are blocked.']
    });
  }

  if (realProvider) {
    return buildDecisionEnvelope({
      decision: 'denied',
      policy: effectivePolicy,
      providerId,
      providerKind,
      tokenKind: null,
      token: null,
      blockReasons: ['real_provider_blocked_by_default'],
      secretStripped,
      strippedFields,
      scrubbedRequest,
      notes: ['Real provider sockets must be opened by a future server-side proxy / Robot Gateway / Device Runtime, not by the browser.']
    });
  }

  const requestedTokenKind = PROVIDER_PROXY_TOKEN_KINDS.includes(scrubbedRequest.tokenKind)
    ? scrubbedRequest.tokenKind
    : effectivePolicy.defaultTokenKind || 'synthetic_only';
  const allowedScope = pickAllowedScope(requestedTokenKind, scrubbedRequest.requestedScope);

  const token = createEphemeralSessionToken({
    tokenKind: requestedTokenKind,
    providerId,
    robotId: scrubbedRequest.robotId || null,
    sessionId: scrubbedRequest.sessionId || null,
    ttlMs: Number.isFinite(scrubbedRequest.ttlMs) ? scrubbedRequest.ttlMs : effectivePolicy.defaultTtlMs,
    scope: allowedScope
  });

  return buildDecisionEnvelope({
    decision: 'granted',
    policy: effectivePolicy,
    providerId,
    providerKind,
    tokenKind: requestedTokenKind,
    token,
    blockReasons: [],
    secretStripped,
    strippedFields,
    scrubbedRequest,
    notes: ['Synthetic / dry-run token descriptor. Not a real provider token. No real socket, no real upload, no billing.']
  });
}

export function requestEphemeralProviderSession(input = {}) {
  const policy = input.policy || createDefaultProviderProxyPolicy();
  return evaluateProviderProxyRequest(input, policy);
}

// v1.3.8: handshake dry-run pure decision. Used by both the Runtime and
// the local skeleton server. Real-cloud / self-hosted / real-cloud-candidate
// providers are blocked. Synthetic / localdev / offline kinds may receive a
// dry-run-ready decision IF the supplied ephemeral token validates.
export function evaluateProxyHandshakeDryRun(request = {}, policy = null) {
  const effectivePolicy = policy || createDefaultProviderProxyPolicy();
  // Pull the legitimate ephemeral token descriptor (if any) BEFORE scrubbing.
  // SECRET_FIELD_NAMES intentionally contains 'token' to defend against
  // raw token strings being passed in, but here the caller may pass a
  // structured `omni.ephemeral_session_token.v1` descriptor.
  const inputToken = (request && typeof request.token === 'object' && request.token && request.token.schema === EPHEMERAL_SESSION_TOKEN_SCHEMA) ? request.token : null;
  const requestForScrub = { ...(request || {}) };
  delete requestForScrub.token;
  const strippedFields = [];
  const scrubbedRequest = stripSecrets({ ...requestForScrub, schema: 'omni.provider_handshake_dry_run_request.v1' }, strippedFields);
  const providerId = scrubbedRequest.providerId || 'localdev_mock';
  const capability = getProviderCapability(providerId);
  const providerKind = capability?.providerKind || 'unknown';
  const realProvider = isRealProviderKind(providerKind);
  const blockReasons = describeBlockReasons(scrubbedRequest);
  const secretStripped = strippedFields.length > 0;

  const baseEnvelope = {
    schema: 'omni.provider_handshake_dry_run.v1',
    providerId,
    providerKind,
    fallbackProviderId: effectivePolicy.fallbackProviderId || 'localdev_mock',
    secretStripped,
    strippedFields,
    scrubbedRequest,
    safety: {
      opensRealSocket: false,
      sentToProvider: false,
      uploaded: false,
      persisted: false,
      billingStarted: false,
      canSendRealAudio: false,
      canSendRealCamera: false,
      canStartBillingSession: false,
      replyTextToTts: false,
      apiKeyReturned: false,
      apiKeyAccepted: false,
      realProviderHandshake: false
    },
    dryRunOnly: true,
    decidedAt: new Date().toISOString()
  };

  if (realProvider) {
    return {
      ...baseEnvelope,
      decision: 'blocked',
      dryRunReady: false,
      blockReasons: ['real_provider_handshake_blocked_by_default', ...blockReasons],
      notes: ['Real / candidate provider handshake must happen on a future server-side proxy / Robot Gateway / Device Runtime. The browser and the skeleton must not perform real handshakes.']
    };
  }

  if (blockReasons.length > 0) {
    return {
      ...baseEnvelope,
      decision: 'blocked',
      dryRunReady: false,
      blockReasons,
      notes: ['Real audio upload / camera upload / billing / socket / TTS are blocked.']
    };
  }

  const token = inputToken;
  if (!token) {
    return {
      ...baseEnvelope,
      decision: 'blocked',
      dryRunReady: false,
      blockReasons: ['ephemeral_token_required_for_dry_run'],
      notes: ['Handshake dry-run requires a synthetic_only / dry_run_only ephemeral session token descriptor.']
    };
  }

  const tokenValidation = validateEphemeralSessionToken(token);
  if (!tokenValidation.ok) {
    return {
      ...baseEnvelope,
      decision: 'blocked',
      dryRunReady: false,
      blockReasons: [`token_invalid:${tokenValidation.failures.join('|')}`],
      notes: ['Provided ephemeral token did not validate. Falling back to localdev_mock is recommended.']
    };
  }

  return {
    ...baseEnvelope,
    decision: 'dry_run_ready',
    dryRunReady: true,
    tokenKind: token.tokenKind,
    tokenId: token.tokenId,
    blockReasons: [],
    notes: ['Dry-run validation completed locally. No real provider was contacted. No socket, audio, camera, or billing was started.']
  };
}

// v1.3.8: server health descriptor for the local Mock skeleton server.
export function createProviderProxyHealth(input = {}) {
  return {
    schema: 'omni.provider_proxy_health.v1',
    serverKind: input.serverKind || 'local_mock_skeleton',
    status: 'ok',
    productionReady: false,
    proxyRequired: true,
    frontendCanHoldApiKey: false,
    browserDirectProviderSocketAllowed: false,
    serverSideSecretRequired: true,
    realProviderHandshakeAllowed: false,
    realMediaUploadAllowed: false,
    realtimeBillingAllowed: false,
    replyTextToTts: false,
    replyAudioFrameNative: true,
    fallbackProviderId: 'localdev_mock',
    readsRealApiKeyEnv: false,
    callsRealProviderEndpoint: false,
    bootedAt: input.bootedAt || new Date().toISOString(),
    notes: input.notes || [
      'Local Mock skeleton only. Not a production proxy.',
      'No real provider endpoint is contacted.',
      'No real API key is read from env.',
      'omni.reply_audio_frame.v1 remains the realtime voice output. reply_text is never a TTS input.'
    ]
  };
}

// v1.3.8: explicit fallback decision envelope returned by the skeleton
// server's /provider-proxy/fallback endpoint. Always lands on localdev_mock.
export function createProviderProxyFallbackDecision(input = {}) {
  const strippedFields = [];
  const scrubbedRequest = stripSecrets({ ...input, schema: 'omni.provider_proxy_fallback_request.v1' }, strippedFields);
  return {
    schema: 'omni.provider_proxy_fallback_decision.v1',
    decision: 'fallback_to_localdev_mock',
    fromProviderId: scrubbedRequest.fromProviderId || scrubbedRequest.providerId || null,
    fallbackProviderId: 'localdev_mock',
    reason: typeof scrubbedRequest.reason === 'string' ? scrubbedRequest.reason : 'safety_fallback_required',
    secretStripped: strippedFields.length > 0,
    strippedFields,
    scrubbedRequest,
    safety: {
      opensRealSocket: false,
      sentToProvider: false,
      uploaded: false,
      persisted: false,
      billingStarted: false,
      replyTextToTts: false,
      realProviderHandshake: false
    },
    decidedAt: new Date().toISOString(),
    notes: [
      'Fallback always points to localdev_mock.',
      'No real provider was contacted. No real media, billing, or TTS was triggered.'
    ]
  };
}

export function createProviderHandshakeDryRunReport(providerId, request = {}) {
  const strippedFields = [];
  const scrubbedRequest = stripSecrets({ ...(request || {}), schema: 'omni.provider_specific_handshake_dry_run_request.v1' }, strippedFields);
  const adapter = getProviderSpecificHandshakeAdapter(providerId);
  const eventMapping = createProviderHandshakeEventMapping(providerId);
  const errorMapping = createProviderHandshakeErrorMapping(providerId);
  const adapterValidation = validateProviderSpecificHandshakeAdapter(adapter);
  const eventValidation = validateProviderHandshakeEventMapping(eventMapping);
  const errorValidation = validateProviderHandshakeErrorMapping(errorMapping);
  const ok = Boolean(adapter && adapterValidation.ok && eventValidation.ok && errorValidation.ok);
  return {
    schema: 'omni.provider_specific_handshake_dry_run_report.v1',
    providerId,
    providerKind: adapter?.providerKind || 'unknown',
    status: ok ? 'dry_run_metadata_ready' : 'dry_run_metadata_invalid',
    dryRunOnly: true,
    candidateOnly: adapter?.candidateOnly === true,
    fallbackProviderId: 'localdev_mock',
    secretStripped: strippedFields.length > 0,
    strippedFields,
    scrubbedRequest,
    adapter,
    adapterSummary: summarizeProviderSpecificHandshakeAdapter(adapter),
    eventMapping,
    errorMapping,
    validation: {
      ok,
      adapter: adapterValidation,
      eventMapping: eventValidation,
      errorMapping: errorValidation
    },
    safety: {
      opensRealSocket: false,
      sentToProvider: false,
      uploaded: false,
      persisted: false,
      billingStarted: false,
      canSendRealAudio: false,
      canSendRealCamera: false,
      canStartBillingSession: false,
      replyTextToTts: false,
      realProviderHandshake: false
    },
    guardrails: {
      endpointMetadataOnly: true,
      noFetch: true,
      noWebSocket: true,
      noRealAudioUpload: true,
      noRealCameraUpload: true,
      noRealtimeBilling: true,
      noRealProviderSocket: true,
      replyAudioFrameIsRealtimeVoiceOutput: true,
      replyTextNotTtsInput: true,
      asrLlmTtsRegressionForbidden: true,
      localdevMockFallbackRequired: true
    },
    notes: [
      'Provider-specific handshake adapter dry-run is metadata validation only.',
      'No provider endpoint was called. No provider socket was opened.',
      'reply_text remains subtitle/log/debug only; omni.reply_audio_frame.v1 remains the realtime voice output.'
    ],
    decidedAt: new Date().toISOString()
  };
}

export function evaluateProviderSpecificHandshakeDryRun(providerId, request = {}, policy = null) {
  const effectivePolicy = policy || createDefaultProviderProxyPolicy();
  const report = createProviderHandshakeDryRunReport(providerId, request);
  const explicitBlockReasons = describeBlockReasons(report.scrubbedRequest || {});
  const decision = report.validation.ok && explicitBlockReasons.length === 0 ? 'dry_run_ready' : 'blocked';
  return {
    schema: 'omni.provider_specific_handshake_dry_run.v1',
    decision,
    dryRunReady: decision === 'dry_run_ready',
    providerId,
    providerKind: report.providerKind,
    fallbackProviderId: effectivePolicy.fallbackProviderId || 'localdev_mock',
    blockReasons: decision === 'dry_run_ready'
      ? []
      : [
          ...explicitBlockReasons,
          ...(report.validation.adapter.failures || []),
          ...(report.validation.eventMapping.failures || []),
          ...(report.validation.errorMapping.failures || [])
        ],
    report,
    safety: { ...report.safety },
    dryRunOnly: true,
    secretStripped: report.secretStripped,
    strippedFields: report.strippedFields,
    scrubbedRequest: report.scrubbedRequest,
    notes: report.notes,
    decidedAt: report.decidedAt
  };
}

export function createProviderSpecificFallbackDecision(providerId, error = {}) {
  return createProviderSpecificFallbackDecisionEnvelope(providerId, error);
}

export function listProviderSpecificHandshakeAdapterSummaries() {
  return listProviderSpecificHandshakeAdapters().map((adapter) => ({
    providerId: adapter.providerId,
    providerKind: adapter.providerKind,
    displayName: adapter.displayName,
    officialName: adapter.officialName,
    endpointKind: adapter.endpointKind,
    endpointTemplate: adapter.endpointTemplate,
    dryRunOnly: adapter.dryRunOnly,
    candidateOnly: adapter.candidateOnly,
    browserDirectSocketAllowed: adapter.browserDirectSocketAllowed,
    requiresServerSideSecret: adapter.requiresServerSideSecret,
    canOpenRealtimeSocket: adapter.canOpenRealtimeSocket,
    canSendRealAudio: adapter.canSendRealAudio,
    canSendRealCamera: adapter.canSendRealCamera,
    canStartBillingSession: adapter.canStartBillingSession,
    replyTextToTts: adapter.replyTextToTts,
    replyAudioFrameNativeRequired: adapter.replyAudioFrameNativeRequired,
    fallbackProviderId: adapter.fallbackProviderId,
    summary: summarizeProviderSpecificHandshakeAdapter(adapter)
  }));
}

export { validateEphemeralSessionToken };

export function summarizeProviderProxyDecision(decision) {
  if (!decision) return 'no decision';
  if (decision.decision === 'denied') {
    return `denied: provider=${decision.providerId}/${decision.providerKind}; reasons=${(decision.blockReasons || []).join(',') || 'none'}; secretStripped=${decision.secretStripped}; fallback=${decision.fallbackProviderId}`;
  }
  return `granted: provider=${decision.providerId}/${decision.providerKind}; tokenKind=${decision.tokenKind}; tokenId=${decision.token?.tokenId}; scope=${(decision.token?.scope || []).join('|')}; ttlMs=${decision.token?.ttlMs}; secretStripped=${decision.secretStripped}; fallback=${decision.fallbackProviderId}`;
}

export function describeProxyForUi(policy, lastDecision) {
  const contract = (policy && policy.contract) || createProviderProxyContract();
  return {
    proxyRequired: contract.proxyRequired,
    frontendCanHoldApiKey: contract.frontendCanHoldApiKey,
    browserDirectProviderSocketAllowed: contract.browserDirectProviderSocketAllowed,
    serverSideSecretRequired: contract.serverSideSecretRequired,
    supportedTokenKinds: [...(contract.supportedTokenKinds || [])],
    defaultTtlMs: contract.defaultTtlMs,
    realMediaUploadAllowed: contract.realMediaUploadAllowed,
    realtimeBillingAllowed: contract.realtimeBillingAllowed,
    replyTextToTts: contract.replyTextToTts,
    replyAudioFrameNative: contract.replyAudioFrameNative,
    fallbackProviderId: contract.fallbackProviderId,
    lastDecision: lastDecision
      ? {
          decision: lastDecision.decision,
          providerId: lastDecision.providerId,
          providerKind: lastDecision.providerKind,
          tokenKind: lastDecision.tokenKind,
          tokenId: lastDecision.token?.tokenId || null,
          ttlMs: lastDecision.token?.ttlMs || 0,
          secretStripped: lastDecision.secretStripped,
          blockReasons: [...(lastDecision.blockReasons || [])],
          decidedAt: lastDecision.decidedAt
        }
      : null
  };
}
