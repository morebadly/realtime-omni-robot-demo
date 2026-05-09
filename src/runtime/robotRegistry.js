import { getAdapterForMode, getNetworkLabel } from './modelAdapters';
import { safeReadJson, safeWriteJson } from './storage';

export const ROBOT_REGISTRY_STORAGE_KEY = 'realtime_omni_robot_registry_v1';
export const ACTIVE_ROBOT_ID_STORAGE_KEY = 'realtime_omni_active_robot_id_v1';

export const DEFAULT_ROBOT_REGISTRY = [
  {
    robotId: 'robot_demo_001',
    displayName: 'DemoBot 01',
    wakeName: 'DemoBot',
    location: '开发桌面',
    mode: 'local_dev',
    online: true,
    expression: 'idle',
    state: 'idle',
    note: '当前本地调试机器人，适合接 LocalDevOmniAdapter。',
    lastSeen: '刚刚'
  },
  {
    robotId: 'robot_home_002',
    displayName: 'Home Robot',
    wakeName: 'Home Robot',
    location: '客厅 / Wi-Fi',
    mode: 'wifi_cloud',
    online: true,
    expression: 'happy',
    state: 'idle',
    note: '家庭 Wi-Fi 云端 Omni 模式预留实例。',
    lastSeen: '2 分钟前'
  },
  {
    robotId: 'robot_mobile_003',
    displayName: 'Mobile Robot',
    wakeName: 'Mobile Robot',
    location: '外出 / eSIM',
    mode: 'cellular_cloud',
    online: false,
    expression: 'sleepy',
    state: 'idle',
    note: '外出蜂窝网络模式预留实例，音频优先、关键帧低频。',
    lastSeen: '离线演示'
  }
];

function normalizeRobotSummary(summary = {}, index = 0) {
  const fallback = DEFAULT_ROBOT_REGISTRY[index] || DEFAULT_ROBOT_REGISTRY[0];
  const mode = String(summary.mode || fallback.mode || 'local_dev');
  const adapter = getAdapterForMode(mode);
  const displayName = String(summary.displayName || fallback.displayName || `Robot ${index + 1}`).trim().slice(0, 28);
  return {
    robotId: String(summary.robotId || fallback.robotId || `robot_demo_${String(index + 1).padStart(3, '0')}`),
    displayName: displayName || fallback.displayName,
    wakeName: String(summary.wakeName || displayName || fallback.wakeName).trim().slice(0, 28),
    location: String(summary.location || fallback.location || '未设置位置').trim().slice(0, 40),
    mode,
    network: getNetworkLabel(mode),
    adapterName: adapter.name,
    online: Boolean(summary.online),
    expression: String(summary.expression || fallback.expression || 'idle'),
    state: String(summary.state || fallback.state || 'idle'),
    note: String(summary.note || fallback.note || '机器人实例占位。').trim().slice(0, 120),
    lastSeen: String(summary.lastSeen || fallback.lastSeen || '未知'),
    updatedAt: summary.updatedAt || null
  };
}

export function readRobotRegistry() {
  const stored = safeReadJson(ROBOT_REGISTRY_STORAGE_KEY, null);
  const source = Array.isArray(stored) && stored.length ? stored : DEFAULT_ROBOT_REGISTRY;
  return source.map((item, index) => normalizeRobotSummary(item, index));
}

export function saveRobotRegistry(registry) {
  const normalized = (Array.isArray(registry) && registry.length ? registry : DEFAULT_ROBOT_REGISTRY)
    .map((item, index) => normalizeRobotSummary(item, index));
  safeWriteJson(ROBOT_REGISTRY_STORAGE_KEY, normalized);
  return normalized;
}

export function readActiveRobotId(registry = readRobotRegistry()) {
  if (typeof window === 'undefined') return registry[0]?.robotId || DEFAULT_ROBOT_REGISTRY[0].robotId;
  const stored = window.localStorage.getItem(ACTIVE_ROBOT_ID_STORAGE_KEY);
  if (stored && registry.some((item) => item.robotId === stored)) return stored;
  return registry[0]?.robotId || DEFAULT_ROBOT_REGISTRY[0].robotId;
}

export function saveActiveRobotId(robotId) {
  if (typeof window !== 'undefined') window.localStorage.setItem(ACTIVE_ROBOT_ID_STORAGE_KEY, robotId);
  return robotId;
}

export function createRobotRegistryItem(index = 0) {
  const suffix = String(index + 1).padStart(3, '0');
  return normalizeRobotSummary({
    robotId: `robot_custom_${Date.now()}_${suffix}`,
    displayName: `新机器人 ${index + 1}`,
    wakeName: `新机器人 ${index + 1}`,
    location: '未设置位置',
    mode: 'local_dev',
    online: false,
    expression: 'idle',
    state: 'idle',
    note: '用户新增机器人实例占位；后期可绑定真实硬件、云端设备证书和 Robot Gateway。',
    lastSeen: '刚创建',
    updatedAt: new Date().toISOString()
  }, index);
}

export function updateRegistryItem(registry, robotId, patch) {
  const next = registry.map((item, index) => (
    item.robotId === robotId
      ? normalizeRobotSummary({ ...item, ...patch, updatedAt: new Date().toISOString() }, index)
      : normalizeRobotSummary(item, index)
  ));
  return saveRobotRegistry(next);
}

export function removeRegistryItem(registry, robotId) {
  const source = Array.isArray(registry) ? registry : [];
  if (source.length <= 1) {
    return {
      removed: null,
      registry: saveRobotRegistry(source),
      nextActiveRobotId: source[0]?.robotId || DEFAULT_ROBOT_REGISTRY[0].robotId,
      reason: 'last_robot_guard'
    };
  }

  const removedIndex = source.findIndex((item) => item.robotId === robotId);
  if (removedIndex < 0) {
    return {
      removed: null,
      registry: saveRobotRegistry(source),
      nextActiveRobotId: source[0]?.robotId || DEFAULT_ROBOT_REGISTRY[0].robotId,
      reason: 'not_found'
    };
  }

  const removed = source[removedIndex];
  const nextSource = source.filter((item) => item.robotId !== robotId);
  const nextRegistry = saveRobotRegistry(nextSource);
  const fallbackIndex = Math.min(removedIndex, nextRegistry.length - 1);
  const nextActiveRobotId = nextRegistry[fallbackIndex]?.robotId || nextRegistry[0]?.robotId || DEFAULT_ROBOT_REGISTRY[0].robotId;

  return {
    removed,
    registry: nextRegistry,
    nextActiveRobotId,
    reason: 'removed'
  };
}

export function findRobotSummary(registry, robotId) {
  return registry.find((item) => item.robotId === robotId) || registry[0] || normalizeRobotSummary(DEFAULT_ROBOT_REGISTRY[0], 0);
}
