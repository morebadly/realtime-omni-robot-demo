#!/usr/bin/env node
// v1.4.1 manual real provider handshake probe plan stub.
//
// Server-side plan generation only. This script never performs a provider
// network handshake, never opens sockets, never uploads media, never starts
// billing, and never prints raw key values.

import {
  createRealHandshakeProbePolicy,
  evaluateRealHandshakeProbeRequest
} from '../src/runtime/providerRealHandshakeProbePolicy.js';
import { getProbeKeyEnvName } from '../src/runtime/providerRealHandshakeProbePlan.js';

const providerId = process.argv[2] || 'bigmodel_glm_realtime_candidate';
const keyEnvName = getProbeKeyEnvName(providerId);
const keyPresent = keyEnvName ? Boolean(process.env[keyEnvName]) : false;
const optIn = process.env.ALLOW_REAL_PROVIDER_HANDSHAKE_PROBE === '1';

const request = {
  providerId,
  explicitOptIn: optIn,
  serverSideOnly: true,
  keyPresent
};

const decision = evaluateRealHandshakeProbeRequest(
  request,
  createRealHandshakeProbePolicy({ enabled: optIn })
);

const output = {
  schema: 'omni.real_provider_handshake_probe_plan_cli.v1',
  status: optIn ? decision.decision : 'disabled',
  providerId,
  keyPresent,
  keyPrinted: false,
  rawKeyIncluded: false,
  manualOnly: true,
  serverSideOnly: true,
  dryRunDefault: true,
  noNetworkDefault: true,
  networkCallAttempted: false,
  opensRealSocket: false,
  audioUpload: false,
  cameraUpload: false,
  billing: false,
  replyTextToTts: false,
  fallbackProviderId: 'localdev_mock',
  decision
};

process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
