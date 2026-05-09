import { DEFAULT_PLUGINS } from '../data/demoConfig';
import { normalizePlugin } from './pluginManifest';
import { getAdapterForMode, getNetworkLabel } from './modelAdapters';

const initialAdapter = getAdapterForMode('local_dev');

export const initialRobot = {
  robotId: 'robot_demo_001',
  name: 'DemoBot 01',
  wakeName: 'DemoBot',
  ownerCalling: '主人',
  voiceStyle: 'warm_young',
  nameSource: 'default_demo_identity',
  online: true,
  mode: 'local_dev',
  network: getNetworkLabel('local_dev'),
  adapter: initialAdapter.name,
  adapterDetail: initialAdapter,
  role: 'companion',
  state: 'idle',
  expression: 'idle',
  expressionSource: 'boot',
  motion: { name: 'idle', at: null, source: 'boot' },
  lastSpeech: '你好，我是 DemoBot 01。',
  speechHistory: [],
  cameraPolicy: 'local_frames_only',
  framePolicy: 'idle:1fps / speaking:2-5fps / event burst / visual query high-res',
  cameraDemand: 'idle_buffer',
  ac: { deviceId: 'living_room_ac', name: '客厅空调', power: 'off', temperature: 26 },
  emailDrafts: []
};

export function matchPlugin(plugins, event) {
  if (event.type === 'touch.event') {
    return plugins.find((plugin) => plugin.enabled && plugin.trigger === `touch.event:${event.area}:${event.gesture}`);
  }
  if (event.type === 'nfc.detected') {
    return plugins.find((plugin) => plugin.enabled && plugin.trigger === `nfc.detected:${event.tagId}`);
  }
  if (event.type === 'voice.intent') {
    return plugins.find((plugin) => plugin.enabled && plugin.trigger === `voice.intent:${event.intent}`);
  }
  if (event.type === 'visual.query') {
    return plugins.find((plugin) => plugin.enabled && plugin.trigger === `visual.query:${event.intent}`);
  }
  return null;
}

export function createLog(level, message, detail) {
  return {
    id: crypto.randomUUID?.() || String(Date.now() + Math.random()),
    time: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
    level,
    message,
    detail
  };
}

export function defaultPlugins() {
  return DEFAULT_PLUGINS.map((plugin) => normalizePlugin({
    ...plugin,
    permissions: [...plugin.permissions],
    actions: [...plugin.actions]
  }));
}
