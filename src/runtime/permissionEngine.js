import { getActionMeta } from './actionLibrary';

export function createPermissionMap(permissions = []) {
  return Object.fromEntries(permissions.map((item) => [item.key, item.status]));
}

export function getPermissionStatus(permissionMap = {}, key) {
  return permissionMap[key] || 'disabled';
}

export function isAutoAllowed(status) {
  return status === 'enabled' || status === 'mock_only';
}

export function describePermissionStatus(status) {
  if (status === 'enabled') return '已允许';
  if (status === 'mock_only') return '仅 Mock 允许';
  if (status === 'confirm_required') return '需要用户确认';
  if (status === 'disabled') return '已关闭';
  return status || '未知';
}

export function checkPermission(permissionMap, key) {
  const status = getPermissionStatus(permissionMap, key);
  return {
    key,
    status,
    allowed: isAutoAllowed(status),
    reason: isAutoAllowed(status) ? describePermissionStatus(status) : describePermissionStatus(status)
  };
}

export function checkActionPermission(action, permissionMap = {}) {
  const meta = getActionMeta(action);
  const check = checkPermission(permissionMap, meta.permission);
  return {
    ...check,
    action,
    actionLabel: meta.label,
    permission: meta.permission
  };
}

export function checkPluginPermissions(plugin, permissionMap = {}) {
  const declared = plugin?.permissions || [];
  const checks = declared.map((permission) => checkPermission(permissionMap, permission));
  return {
    checks,
    allowed: checks.every((item) => item.allowed),
    blocked: checks.filter((item) => !item.allowed)
  };
}
