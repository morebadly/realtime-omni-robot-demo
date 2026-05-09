import { collectActionPermissions } from './actionLibrary';

export function createPluginManifest(plugin = {}) {
  const permissions = plugin.permissions?.length
    ? plugin.permissions
    : collectActionPermissions(plugin.actions || []);

  return {
    manifestVersion: 'demo.plugin.v1',
    id: plugin.id,
    name: plugin.name || '未命名插件',
    enabled: Boolean(plugin.enabled),
    runtime: plugin.runtime || 'template_orchestration',
    trigger: plugin.trigger || 'manual.test',
    permissions: [...new Set(['plugin.run', ...permissions])],
    actionCount: plugin.runtime === 'code_sandbox' ? 'runtime_resolved' : (plugin.actions || []).length,
    sandbox: plugin.runtime === 'code_sandbox'
      ? {
        isolation: 'web_worker_demo',
        timeoutMs: plugin.sandbox?.timeoutMs || 900,
        network: plugin.sandbox?.network || 'blocked',
        directHardwareAccess: plugin.sandbox?.directHardwareAccess || 'blocked'
      }
      : null
  };
}

export function attachManifest(plugin = {}) {
  return {
    ...plugin,
    manifest: createPluginManifest(plugin)
  };
}

export function normalizePlugin(plugin = {}) {
  const normalized = {
    ...plugin,
    id: plugin.id || `plugin_${Date.now()}`,
    enabled: plugin.enabled !== false,
    runtime: plugin.runtime || 'template_orchestration',
    permissions: [...new Set(plugin.permissions || collectActionPermissions(plugin.actions || []))],
    actions: [...(plugin.actions || [])]
  };
  return attachManifest(normalized);
}

export function summarizeManifest(plugin = {}) {
  const manifest = plugin.manifest || createPluginManifest(plugin);
  const permissionText = manifest.permissions.join(' / ') || '无额外权限';
  return `${manifest.runtime} · ${manifest.trigger} · ${permissionText}`;
}
