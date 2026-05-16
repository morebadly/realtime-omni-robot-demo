#!/usr/bin/env node
// v1.3.8 Provider Proxy Skeleton Server.
//
// LOCAL Mock / contract skeleton only. NOT a production server.
//
// SAFETY INVARIANTS (enforced in code AND verified by smoke tests):
//   * This skeleton MUST NOT read real provider API keys from environment
//     variables. The forbidden env var name list is declared at runtime in
//     `FORBIDDEN_ENV_KEYS` (used for refusal reporting only; never used to
//     read process.env[*]).
//   * This skeleton MUST NOT call a real provider endpoint. There is no
//     outbound fetch / WebSocket / TCP connect to any external host.
//   * This skeleton MUST NOT open a real provider socket.
//   * This skeleton MUST NOT upload real microphone PCM.
//   * This skeleton MUST NOT upload real camera JPEG.
//   * This skeleton MUST NOT start realtime billing.
//   * This skeleton MUST NOT connect reply_text to any TTS provider.
//   * Fallback is always localdev_mock.
//
// The skeleton purely echoes Runtime-side pure functions over HTTP for
// future contract integration testing. It exists so that a future real
// server-side proxy / Robot Gateway / Device Runtime can be plugged in
// while the protocol shape stays stable.

import http from 'node:http';
import { URL, fileURLToPath } from 'node:url';
import {
  createProviderProxyServerContract,
  PROVIDER_PROXY_SERVER_ENDPOINTS
} from '../src/runtime/providerProxyServerContract.js';
import {
  createDefaultProviderProxyPolicy,
  createProviderProxyFallbackDecision,
  createProviderProxyHealth,
  createProviderHandshakeDryRunReport,
  createProviderSpecificFallbackDecision,
  evaluateProviderProxyRequest,
  evaluateProviderSpecificHandshakeDryRun,
  evaluateProxyHandshakeDryRun,
  listProviderSpecificHandshakeAdapterSummaries,
  validateEphemeralSessionToken
} from '../src/runtime/providerProxyPolicy.js';
import {
  getProviderSpecificHandshakeAdapter
} from '../src/runtime/providerSpecificHandshakeAdapters.js';
import {
  createProviderHandshakeEventMapping
} from '../src/runtime/providerHandshakeEventMapping.js';
import {
  createProviderHandshakeErrorMapping
} from '../src/runtime/providerHandshakeErrorMapping.js';

const DEFAULT_PORT = Number(process.env.PROVIDER_PROXY_SKELETON_PORT) || 8011;
const DEFAULT_HOST = process.env.PROVIDER_PROXY_SKELETON_HOST || '127.0.0.1';

// Hard guard: refuse to read or expose real provider API keys.
const FORBIDDEN_ENV_KEYS = Object.freeze([
  'BIGMODEL_API_KEY',
  'BIGMODEL_TOKEN',
  'DASHSCOPE_API_KEY',
  'DASHSCOPE_TOKEN',
  'QWEN_API_KEY',
  'QWEN_TOKEN',
  'OPENAI_API_KEY',
  'MINIMAX_API_KEY'
]);

function refuseRealApiKeyEnv() {
  // Intentionally do NOT read process.env[name] here. Instead, only return
  // a refusal descriptor. This makes the safety invariant inspectable.
  return {
    readsRealApiKeyEnv: false,
    refusedEnvVars: [...FORBIDDEN_ENV_KEYS],
    note: 'Skeleton must not read real provider API key environment variables.'
  };
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
    'X-Provider-Proxy-Skeleton': 'local-mock-only',
    'X-Reads-Real-Api-Key': 'false',
    'X-Calls-Real-Provider': 'false'
  });
  res.end(payload);
}

function sendError(res, status, reason, detail) {
  sendJson(res, status, {
    schema: 'omni.provider_proxy_server_error.v1',
    error: reason,
    detail: detail || null,
    fallbackProviderId: 'localdev_mock',
    safety: {
      opensRealSocket: false,
      sentToProvider: false,
      uploaded: false,
      persisted: false,
      billingStarted: false,
      replyTextToTts: false
    }
  });
}

function providerSpecificRoute(pathname, suffix) {
  const prefix = '/provider-proxy/providers/';
  if (!pathname.startsWith(prefix) || !pathname.endsWith(suffix)) return null;
  const providerId = pathname.slice(prefix.length, pathname.length - suffix.length);
  return providerId && !providerId.includes('/') ? decodeURIComponent(providerId) : null;
}

async function readJsonBody(req, maxBytes = 64 * 1024) {
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
        const text = Buffer.concat(chunks).toString('utf8');
        resolve(text.length ? JSON.parse(text) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

export function createProviderProxySkeletonHandler(options = {}) {
  const policy = options.policy || createDefaultProviderProxyPolicy();
  const bootedAt = new Date().toISOString();
  const envGuard = refuseRealApiKeyEnv();

  return async function handler(req, res) {
    const url = new URL(req.url || '/', `http://${req.headers.host || `${DEFAULT_HOST}:${DEFAULT_PORT}`}`);
    const route = `${req.method} ${url.pathname}`;

    try {
      if (route === 'GET /health') {
        const health = createProviderProxyHealth({ bootedAt });
        return sendJson(res, 200, { ...health, envGuard });
      }
      if (route === 'GET /provider-proxy/contract') {
        return sendJson(res, 200, createProviderProxyServerContract());
      }
      if (route === 'POST /provider-proxy/session/request') {
        const body = await readJsonBody(req);
        const decision = evaluateProviderProxyRequest(body, policy);
        return sendJson(res, decision.decision === 'granted' ? 200 : 403, decision);
      }
      if (route === 'POST /provider-proxy/session/validate') {
        const body = await readJsonBody(req);
        const inputToken = body?.token || null;
        const validation = validateEphemeralSessionToken(inputToken);
        // Echo a sanitized token only: never reflect secret-like fields that
        // a caller may have stuffed into the descriptor.
        const sanitizedToken = (validation.ok && inputToken) ? {
          schema: inputToken.schema,
          tokenId: inputToken.tokenId,
          tokenKind: inputToken.tokenKind,
          providerId: inputToken.providerId,
          robotId: inputToken.robotId || null,
          sessionId: inputToken.sessionId || null,
          issuedAt: inputToken.issuedAt,
          expiresAt: inputToken.expiresAt,
          ttlMs: inputToken.ttlMs,
          scope: Array.isArray(inputToken.scope) ? [...inputToken.scope] : [],
          deniedScopes: Array.isArray(inputToken.deniedScopes) ? [...inputToken.deniedScopes] : [],
          safety: { ...(inputToken.safety || {}) },
          fallbackProviderId: inputToken.fallbackProviderId || 'localdev_mock'
        } : null;
        return sendJson(res, validation.ok ? 200 : 400, {
          schema: 'omni.provider_proxy_decision.v1',
          decision: validation.ok ? 'granted' : 'denied',
          providerId: inputToken?.providerId || null,
          providerKind: null,
          tokenKind: inputToken?.tokenKind || null,
          token: sanitizedToken,
          blockReasons: validation.ok ? [] : validation.failures,
          fallbackProviderId: 'localdev_mock',
          secretStripped: Boolean(inputToken && (inputToken.apiKey || inputToken.secret || inputToken.tokenRawValue || inputToken.authorization)),
          safety: {
            opensRealSocket: false,
            canSendRealAudio: false,
            canSendRealCamera: false,
            canStartBillingSession: false,
            replyTextToTts: false,
            sentToProvider: false,
            uploaded: false,
            persisted: false
          },
          decidedAt: new Date().toISOString()
        });
      }
      if (route === 'POST /provider-proxy/handshake/dry-run') {
        const body = await readJsonBody(req);
        const result = evaluateProxyHandshakeDryRun(body, policy);
        return sendJson(res, result.decision === 'dry_run_ready' ? 200 : 403, result);
      }
      if (route === 'POST /provider-proxy/fallback') {
        const body = await readJsonBody(req);
        return sendJson(res, 200, createProviderProxyFallbackDecision(body));
      }
      if (route === 'GET /provider-proxy/providers') {
        return sendJson(res, 200, {
          schema: 'omni.provider_specific_handshake_adapter_list.v1',
          dryRunOnly: true,
          count: listProviderSpecificHandshakeAdapterSummaries().length,
          providers: listProviderSpecificHandshakeAdapterSummaries(),
          fallbackProviderId: 'localdev_mock',
          safety: {
            opensRealSocket: false,
            sentToProvider: false,
            uploaded: false,
            persisted: false,
            billingStarted: false,
            replyTextToTts: false
          }
        });
      }

      const adapterProviderId = providerSpecificRoute(url.pathname, '/handshake-adapter');
      if (req.method === 'GET' && adapterProviderId) {
        const adapter = getProviderSpecificHandshakeAdapter(adapterProviderId);
        if (!adapter) return sendError(res, 404, 'provider_specific_adapter_not_found', adapterProviderId);
        return sendJson(res, 200, adapter);
      }

      const dryRunProviderId = providerSpecificRoute(url.pathname, '/handshake/dry-run');
      if (req.method === 'POST' && dryRunProviderId) {
        const body = await readJsonBody(req);
        const result = evaluateProviderSpecificHandshakeDryRun(dryRunProviderId, body, policy);
        return sendJson(res, result.decision === 'dry_run_ready' ? 200 : 403, result);
      }

      const eventMappingProviderId = providerSpecificRoute(url.pathname, '/event-mapping');
      if (req.method === 'GET' && eventMappingProviderId) {
        const mapping = createProviderHandshakeEventMapping(eventMappingProviderId);
        if (!mapping) return sendError(res, 404, 'provider_specific_event_mapping_not_found', eventMappingProviderId);
        return sendJson(res, 200, mapping);
      }

      const errorMappingProviderId = providerSpecificRoute(url.pathname, '/error-mapping');
      if (req.method === 'GET' && errorMappingProviderId) {
        const mapping = createProviderHandshakeErrorMapping(errorMappingProviderId);
        if (!mapping) return sendError(res, 404, 'provider_specific_error_mapping_not_found', errorMappingProviderId);
        return sendJson(res, 200, {
          ...mapping,
          dryRunReport: createProviderHandshakeDryRunReport(errorMappingProviderId),
          sampleFallback: createProviderSpecificFallbackDecision(errorMappingProviderId, { category: 'socket_denied' })
        });
      }
      // Unknown route: list endpoints + safety reminder.
      return sendJson(res, 404, {
        schema: 'omni.provider_proxy_server_error.v1',
        error: 'unknown_endpoint',
        route,
        endpoints: PROVIDER_PROXY_SERVER_ENDPOINTS.map((e) => `${e.method} ${e.path}`),
        fallbackProviderId: 'localdev_mock'
      });
    } catch (err) {
      return sendError(res, 400, 'request_failed', String(err?.message || err));
    }
  };
}

export function startProviderProxySkeletonServer(options = {}) {
  const port = Number.isFinite(Number(options.port)) ? Number(options.port) : DEFAULT_PORT;
  const host = options.host || DEFAULT_HOST;
  const handler = createProviderProxySkeletonHandler(options);
  const server = http.createServer((req, res) => { handler(req, res); });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      const address = server.address();
      const actualPort = typeof address === 'object' && address ? address.port : port;
      resolve({
        server,
        port: actualPort,
        host,
        baseUrl: `http://${host}:${actualPort}`,
        close() {
          return new Promise((closeResolve) => server.close(() => closeResolve()));
        }
      });
    });
  });
}

const invokedDirectly = (() => {
  try {
    const entry = process.argv[1] ? new URL(`file://${process.argv[1].replace(/\\/g, '/')}`).href : null;
    const self = fileURLToPath(import.meta.url);
    const selfUrl = new URL(`file://${self.replace(/\\/g, '/')}`).href;
    return Boolean(entry) && entry === selfUrl;
  } catch {
    return false;
  }
})();

if (invokedDirectly) {
  startProviderProxySkeletonServer({ port: DEFAULT_PORT, host: DEFAULT_HOST }).then((handle) => {
    process.stdout.write(`Provider proxy skeleton server listening on ${handle.baseUrl} (local Mock only; reads no real API key; calls no real provider).\n`);
    const shutdown = (signal) => () => {
      process.stdout.write(`Provider proxy skeleton server shutting down (${signal}).\n`);
      handle.close().then(() => process.exit(0));
    };
    process.on('SIGINT', shutdown('SIGINT'));
    process.on('SIGTERM', shutdown('SIGTERM'));
  }).catch((err) => {
    process.stderr.write(`Provider proxy skeleton server failed to start: ${err?.message || err}\n`);
    process.exit(1);
  });
}
