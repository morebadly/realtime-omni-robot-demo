import { safeReadJson, safeRemove, safeWriteJson } from './storage';

export const ROBOT_PROFILE_STORAGE_KEY = 'realtime_omni_robot_profile_v2';
const ROBOT_PROFILE_STORAGE_PREFIX = 'realtime_omni_robot_profile_v2__';
const LEGACY_ROBOT_NAME_STORAGE_KEY = 'realtime_omni_robot_user_name_v1';

export const VOICE_STYLE_OPTIONS = [
  { key: 'warm_young', label: '温柔年轻声线' },
  { key: 'bright_assistant', label: '清亮助手声线' },
  { key: 'soft_pet', label: '软萌宠物声线' },
  { key: 'calm_study', label: '沉稳学习声线' }
];

export const DEFAULT_ROBOT_PROFILE = {
  robotId: 'robot_demo_001',
  displayName: 'DemoBot 01',
  wakeName: 'DemoBot',
  ownerCalling: '主人',
  defaultRole: 'companion',
  voiceStyle: 'warm_young',
  locale: 'zh-CN',
  personality: '温柔、轻快、可纠正；不会把猜测当成事实。',
  source: 'default_demo_identity',
  updatedAt: null
};

function makeProfileStorageKey(robotId) {
  return robotId ? `${ROBOT_PROFILE_STORAGE_PREFIX}${robotId}` : ROBOT_PROFILE_STORAGE_KEY;
}

function normalizeProfile(profile = {}) {
  const merged = { ...DEFAULT_ROBOT_PROFILE, ...profile };
  const displayName = String(merged.displayName || '').trim().slice(0, 24) || DEFAULT_ROBOT_PROFILE.displayName;
  const wakeName = String(merged.wakeName || displayName).trim().slice(0, 24) || displayName;
  return {
    ...merged,
    displayName,
    wakeName,
    ownerCalling: String(merged.ownerCalling || DEFAULT_ROBOT_PROFILE.ownerCalling).trim().slice(0, 24),
    defaultRole: String(merged.defaultRole || DEFAULT_ROBOT_PROFILE.defaultRole).trim(),
    voiceStyle: String(merged.voiceStyle || DEFAULT_ROBOT_PROFILE.voiceStyle).trim(),
    personality: String(merged.personality || DEFAULT_ROBOT_PROFILE.personality).trim().slice(0, 160),
    locale: String(merged.locale || DEFAULT_ROBOT_PROFILE.locale).trim()
  };
}

export function readRobotProfile(robotId = DEFAULT_ROBOT_PROFILE.robotId, registrySummary = null) {
  const scopedKey = makeProfileStorageKey(robotId);
  const stored = safeReadJson(scopedKey, null) || (robotId === DEFAULT_ROBOT_PROFILE.robotId ? safeReadJson(ROBOT_PROFILE_STORAGE_KEY, null) : null);
  if (stored) return normalizeProfile({ ...stored, robotId });

  if (typeof window !== 'undefined') {
    const legacyName = window.localStorage.getItem(LEGACY_ROBOT_NAME_STORAGE_KEY);
    if (legacyName && robotId === DEFAULT_ROBOT_PROFILE.robotId) {
      return normalizeProfile({
        robotId,
        displayName: legacyName,
        wakeName: legacyName,
        source: 'migrated_legacy_display_name',
        updatedAt: new Date().toISOString()
      });
    }
  }

  if (registrySummary) {
    return normalizeProfile({
      ...DEFAULT_ROBOT_PROFILE,
      robotId,
      displayName: registrySummary.displayName,
      wakeName: registrySummary.wakeName,
      defaultRole: DEFAULT_ROBOT_PROFILE.defaultRole,
      source: 'registry_summary_identity'
    });
  }

  return normalizeProfile({ ...DEFAULT_ROBOT_PROFILE, robotId });
}

export function saveRobotProfile(profile, robotId = profile?.robotId || DEFAULT_ROBOT_PROFILE.robotId) {
  const next = normalizeProfile({ ...profile, robotId, source: 'user_local_profile', updatedAt: new Date().toISOString() });
  safeWriteJson(makeProfileStorageKey(robotId), next);
  return next;
}

export function resetRobotProfile(robotId = DEFAULT_ROBOT_PROFILE.robotId, registrySummary = null) {
  safeRemove(makeProfileStorageKey(robotId));
  if (robotId === DEFAULT_ROBOT_PROFILE.robotId) safeRemove(ROBOT_PROFILE_STORAGE_KEY);
  if (typeof window !== 'undefined' && robotId === DEFAULT_ROBOT_PROFILE.robotId) window.localStorage.removeItem(LEGACY_ROBOT_NAME_STORAGE_KEY);
  return readRobotProfile(robotId, registrySummary);
}

export function deleteRobotProfile(robotId = DEFAULT_ROBOT_PROFILE.robotId) {
  safeRemove(makeProfileStorageKey(robotId));
  if (robotId === DEFAULT_ROBOT_PROFILE.robotId) safeRemove(ROBOT_PROFILE_STORAGE_KEY);
  if (typeof window !== 'undefined' && robotId === DEFAULT_ROBOT_PROFILE.robotId) window.localStorage.removeItem(LEGACY_ROBOT_NAME_STORAGE_KEY);
  return robotId;
}

export function applyProfileToRobot(robot, profile) {
  const normalized = normalizeProfile(profile);
  return {
    ...robot,
    robotId: normalized.robotId,
    name: normalized.displayName,
    wakeName: normalized.wakeName,
    ownerCalling: normalized.ownerCalling,
    voiceStyle: normalized.voiceStyle,
    profile: normalized,
    nameSource: normalized.source,
    lastSpeech: robot.lastSpeech || `你好，我是 ${normalized.displayName}。`
  };
}
