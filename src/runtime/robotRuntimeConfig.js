import { DEFAULT_PERMISSIONS } from '../data/demoConfig';
import { createDefaultAdapterProfiles } from './modelAdapters';
import { defaultPlugins } from './mockRuntime';
import { normalizePlugin } from './pluginManifest';
import { safeReadJson, safeRemove, safeWriteJson } from './storage';

const RUNTIME_CONFIG_STORAGE_PREFIX = 'realtime_omni_robot_runtime_config_v1__';
const LEGACY_ADAPTER_PROFILE_STORAGE_KEY = 'realtime_omni_adapter_profiles_v1';

function makeConfigStorageKey(robotId) {
  return `${RUNTIME_CONFIG_STORAGE_PREFIX}${robotId}`;
}

function clonePermissions(permissions = DEFAULT_PERMISSIONS) {
  return permissions.map((item) => ({ ...item }));
}

function clonePlugins(plugins = defaultPlugins()) {
  return plugins.map((plugin) => normalizePlugin({
    ...plugin,
    permissions: [...(plugin.permissions || [])],
    actions: [...(plugin.actions || [])],
    sandbox: plugin.sandbox ? { ...plugin.sandbox } : plugin.sandbox
  }));
}

function stripSecretsFromProfiles(profiles = {}) {
  return Object.fromEntries(Object.entries(profiles).map(([key, profile]) => [
    key,
    {
      ...profile,
      apiKey: '',
      providerConfig: {
        ...(profile.providerConfig || {}),
        apiKeyConfigured: false
      }
    }
  ]));
}

function mergeAdapterProfiles(storedProfiles = null) {
  const defaults = createDefaultAdapterProfiles();
  if (!storedProfiles) return defaults;
  return Object.fromEntries(Object.entries(defaults).map(([key, profile]) => [
    key,
    {
      ...profile,
      ...(storedProfiles[key] || {}),
      capabilities: storedProfiles[key]?.capabilities || profile.capabilities,
      providerConfig: {
        ...(profile.providerConfig || {}),
        ...(storedProfiles[key]?.providerConfig || {})
      }
    }
  ]));
}

function normalizeRuntimeConfig(config = {}, robotId) {
  return {
    robotId,
    permissions: clonePermissions(config.permissions || DEFAULT_PERMISSIONS),
    plugins: clonePlugins(config.plugins || defaultPlugins()),
    adapterProfiles: mergeAdapterProfiles(config.adapterProfiles),
    preferences: {
      networkQuality: config.preferences?.networkQuality || 'stable'
    },
    updatedAt: config.updatedAt || null
  };
}

export function createDefaultRobotRuntimeConfig(robotId) {
  const legacyAdapterProfiles = safeReadJson(LEGACY_ADAPTER_PROFILE_STORAGE_KEY, null);
  return normalizeRuntimeConfig({
    adapterProfiles: legacyAdapterProfiles
  }, robotId);
}

export function readRobotRuntimeConfig(robotId) {
  const stored = safeReadJson(makeConfigStorageKey(robotId), null);
  if (!stored) return createDefaultRobotRuntimeConfig(robotId);
  return normalizeRuntimeConfig(stored, robotId);
}

export function saveRobotRuntimeConfig(robotId, patch = {}) {
  const current = readRobotRuntimeConfig(robotId);
  const next = normalizeRuntimeConfig({
    ...current,
    ...patch,
    permissions: patch.permissions || current.permissions,
    plugins: patch.plugins || current.plugins,
    adapterProfiles: patch.adapterProfiles || current.adapterProfiles,
    preferences: {
      ...current.preferences,
      ...(patch.preferences || {})
    },
    updatedAt: new Date().toISOString()
  }, robotId);
  safeWriteJson(makeConfigStorageKey(robotId), {
    ...next,
    adapterProfiles: stripSecretsFromProfiles(next.adapterProfiles)
  });
  return next;
}

export function saveRobotPermissions(robotId, permissions) {
  return saveRobotRuntimeConfig(robotId, { permissions: clonePermissions(permissions) });
}

export function saveRobotPlugins(robotId, plugins) {
  return saveRobotRuntimeConfig(robotId, { plugins: clonePlugins(plugins) });
}

export function saveRobotAdapterProfiles(robotId, adapterProfiles) {
  return saveRobotRuntimeConfig(robotId, { adapterProfiles: stripSecretsFromProfiles(adapterProfiles) });
}

export function resetRobotAdapterProfiles(robotId) {
  const current = readRobotRuntimeConfig(robotId);
  return saveRobotRuntimeConfig(robotId, {
    ...current,
    adapterProfiles: createDefaultAdapterProfiles()
  });
}

export function deleteRobotRuntimeConfig(robotId) {
  safeRemove(makeConfigStorageKey(robotId));
  return robotId;
}
