export const LOCALDEV_PREFLIGHT_STATUS = {
  PENDING: 'pending',
  CHECKING: 'checking',
  CONNECTED: 'connected',
  FAILED: 'failed',
  SKIPPED: 'skipped'
};

export function getLocalDevEndpointLabel(endpoint) {
  return endpoint || '未配置';
}

export function nowTime() {
  return new Date().toLocaleTimeString('zh-CN', { hour12: false });
}

export function createLocalDevPreflightState(robotId, endpoint, patch = {}) {
  return {
    robotId,
    endpoint: getLocalDevEndpointLabel(endpoint),
    status: LOCALDEV_PREFLIGHT_STATUS.PENDING,
    checked: false,
    checkedAt: null,
    error: null,
    detail: '首次发送到 LocalDev Adapter 时只检查一次连接状态。',
    healthCommand: 'npm run health:localdev',
    ...patch
  };
}

export function shouldRunLocalDevFirstCheck(preflight, { robotId, endpoint }) {
  const endpointLabel = getLocalDevEndpointLabel(endpoint);
  return !preflight?.checked
    || preflight.robotId !== robotId
    || preflight.endpoint !== endpointLabel;
}

export function markLocalDevPreflightChecking(robotId, endpoint, detail = '正在执行一次 WebSocket 握手测试；不发送 Omni 输入包。') {
  return createLocalDevPreflightState(robotId, endpoint, {
    status: LOCALDEV_PREFLIGHT_STATUS.CHECKING,
    checked: false,
    detail
  });
}

export function markLocalDevPreflightSkipped(robotId, endpoint, mode) {
  return createLocalDevPreflightState(robotId, endpoint, {
    status: LOCALDEV_PREFLIGHT_STATUS.SKIPPED,
    checked: true,
    checkedAt: nowTime(),
    detail: `当前机器人处于 ${mode || 'unknown'} 模式，未执行 LocalDev Adapter 预检。`
  });
}

export function markLocalDevPreflightFailed(robotId, endpoint, error, detail = 'LocalDev Adapter 预检失败；请确认 mock/local Qwen adapter 正在监听该 WebSocket。') {
  return createLocalDevPreflightState(robotId, endpoint, {
    status: LOCALDEV_PREFLIGHT_STATUS.FAILED,
    checked: true,
    checkedAt: nowTime(),
    error,
    detail
  });
}

export function markLocalDevPreflightConnected(robotId, endpoint, result = {}, detail) {
  return createLocalDevPreflightState(robotId, endpoint, {
    status: LOCALDEV_PREFLIGHT_STATUS.CONNECTED,
    checked: true,
    checkedAt: nowTime(),
    error: null,
    detail: detail || (result.reused
      ? '预检通过：复用已有 LocalDev WebSocket 会话。'
      : '预检通过：LocalDev WebSocket 已连接并保持会话。')
  });
}

export function describeLocalDevPreflight(preflight) {
  if (!preflight) return 'LocalDev Adapter 尚未预检。';
  if (preflight.status === LOCALDEV_PREFLIGHT_STATUS.CONNECTED) return preflight.detail || 'LocalDev Adapter 已连接。';
  if (preflight.status === LOCALDEV_PREFLIGHT_STATUS.CHECKING) return preflight.detail || 'LocalDev Adapter 正在检查。';
  if (preflight.status === LOCALDEV_PREFLIGHT_STATUS.FAILED) return preflight.error || preflight.detail || 'LocalDev Adapter 预检失败。';
  if (preflight.status === LOCALDEV_PREFLIGHT_STATUS.SKIPPED) return preflight.detail || 'LocalDev Adapter 预检已跳过。';
  return preflight.detail || '等待首次 LocalDev Adapter 预检。';
}
