#!/usr/bin/env node
// v1.4.3 Provider Gateway Execution Shell / Synthetic-only CLI.
//
// Manual local shell output only. This script never executes a provider
// network handshake, opens sockets, uploads media, starts billing, or prints
// provider key values.

import {
  createProviderGatewayExecutionPolicy,
  evaluateProviderGatewayExecutionRequest
} from '../src/runtime/providerGatewayExecutionPolicy.js';
import { auditSecretBoundarySurface } from '../src/runtime/providerSecretBoundaryAudit.js';

const providerId = process.argv[2] || 'bigmodel_glm_realtime_candidate';
const optIn = process.env.ALLOW_PROVIDER_GATEWAY_EXECUTION_SHELL === '1';
const keyPresent = process.env.PROVIDER_GATEWAY_KEY_PRESENT === '1';

const request = {
  providerId,
  explicitOptIn: optIn,
  serverSideOnly: true,
  keyPresent
};

const decision = evaluateProviderGatewayExecutionRequest(
  request,
  createProviderGatewayExecutionPolicy({ enabled: optIn })
);

const output = {
  schema: 'omni.provider_gateway_execution_shell_cli.v1',
  status: optIn ? decision.decision : 'disabled',
  providerId,
  keyPresent,
  keyPrinted: false,
  rawKeyIncluded: false,
  maskedKeyIncluded: false,
  keyPrefixIncluded: false,
  keyLengthIncluded: false,
  keyHashIncluded: false,
  manualOnly: true,
  serverSideOnly: true,
  syntheticOnly: true,
  noNetworkDefault: true,
  browserForbidden: true,
  networkCallAttempted: false,
  opensRealSocket: false,
  callsRealEndpoint: false,
  audioUpload: false,
  cameraUpload: false,
  billing: false,
  replyTextToTts: false,
  asrLlmTtsFallback: false,
  fallbackProviderId: 'localdev_mock',
  decision
};

const audit = auditSecretBoundarySurface({
  surface: 'Provider Gateway Execution Shell CLI output',
  payload: output,
  requireLocaldevMockFallback: true
});

process.stdout.write(`${JSON.stringify({
  ...output,
  secretBoundaryAudit: {
    status: audit.status,
    violationCount: audit.violationCount,
    leakedValueIncluded: audit.leakedValueIncluded
  }
}, null, 2)}\n`);
