#!/usr/bin/env node
// v1.4.0 manual real provider handshake preflight skeleton.
//
// This command is intentionally NOT part of verify or the default smoke
// suite. It performs local config validation only after explicit opt-in.

import {
  createRealHandshakePreflightPolicy,
  evaluateRealHandshakePreflightRequest
} from '../src/runtime/providerRealHandshakePreflightPolicy.js';
import { getProviderSpecificHandshakeAdapter } from '../src/runtime/providerSpecificHandshakeAdapters.js';

const providerId = process.argv[2] || 'bigmodel_glm_realtime_candidate';
const optIn = process.env.ALLOW_REAL_PROVIDER_HANDSHAKE === '1';
const adapter = getProviderSpecificHandshakeAdapter(providerId);

function keyNameForProvider(id) {
  if (id === 'bigmodel_glm_realtime_candidate') return 'BIGMODEL_API_KEY';
  if (id === 'dashscope_qwen_omni_candidate') return 'DASHSCOPE_API_KEY';
  return null;
}

function print(payload) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

if (!optIn) {
  print({
    schema: 'omni.real_provider_handshake_preflight_cli.v1',
    status: 'disabled',
    providerId,
    endpointKind: adapter?.endpointKind || null,
    message: 'Set ALLOW_REAL_PROVIDER_HANDSHAKE=1 to run manual server-side config validation.',
    keyPresent: false,
    keyPrinted: false,
    audioUpload: false,
    cameraUpload: false,
    billing: false,
    replyTextToTts: false,
    fallbackProviderId: 'localdev_mock',
    networkCallAttempted: false
  });
  process.exit(0);
}

const keyName = keyNameForProvider(providerId);
const keyPresent = keyName ? Boolean(process.env[keyName]) : false;
const policy = createRealHandshakePreflightPolicy({ enabled: true });
const decision = evaluateRealHandshakePreflightRequest({
  providerId,
  explicitOptIn: true,
  serverSideOnly: true,
  env: { ALLOW_REAL_PROVIDER_HANDSHAKE: '1' },
  keyPresent
}, policy);

print({
  schema: 'omni.real_provider_handshake_preflight_cli.v1',
  status: decision.decision,
  providerId,
  providerKind: adapter?.providerKind || 'unknown',
  endpointKind: adapter?.endpointKind || null,
  adapterReady: Boolean(adapter),
  keyPresent,
  keyPrinted: false,
  audioUpload: false,
  cameraUpload: false,
  billing: false,
  replyTextToTts: false,
  fallbackProviderId: 'localdev_mock',
  networkCallAttempted: false,
  decision
});
