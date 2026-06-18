export const PET_ACTION_SCHEMA = 'cloudgenie.pet_action.v1';
export const PET_STATE_SCHEMA = 'cloudgenie.pet_state.v1';
export const PET_EYE_FRAME_SCHEMA = 'cloudgenie.pet_eye_frame.v1';

export const PET_STATES = [
  'idle',
  'curious',
  'happy',
  'comforted',
  'sleepy',
  'sleeping',
  'concerned',
  'lonely',
  'hungry',
  'low_battery',
  'sick',
  'focused',
  'privacy_closed',
  'offline_pet'
];

export const PET_EXPRESSIONS = [
  'idle_eyes',
  'happy_eyes',
  'soft_worried_eyes',
  'sleepy_eyes',
  'sleeping_eyes',
  'curious_eyes',
  'comforted_eyes',
  'lonely_eyes',
  'hungry_eyes',
  'low_battery_eyes',
  'sick_eyes',
  'focused_eyes',
  'privacy_closed_eyes'
];

export const PET_MOTIONS = [
  'none',
  'tiny_wiggle',
  'nudge_forward_small',
  'shrink_back_small',
  'sleep_breathing',
  'look_up',
  'look_down',
  'happy_bounce'
];

export const PET_SOUNDS = [
  'none',
  'purr',
  'soft_hum',
  'tiny_sneeze',
  'sleep_breath',
  'happy_chirp',
  'sad_whimper',
  'yawn'
];

export const PET_ICONS = [
  'none',
  'water',
  'leaf',
  'stretch',
  'food',
  'sleep_hat',
  'privacy_eye_closed'
];

export const PET_REASON_CODES = [
  'touch_head',
  'touch_face',
  'touch_back',
  'nfc_food',
  'nfc_sleep_hat',
  'work_session_long',
  'battery_low',
  'camera_closed',
  'user_returned',
  'idle_tick',
  'offline'
];

export const PET_ACTION_SOURCES = [
  'pet_state_engine',
  'localdev_mock',
  'future_omni_pet_adapter',
  'user_event'
];

export function createPetAction({
  source = 'pet_state_engine',
  petState = 'idle',
  expression = 'idle_eyes',
  motion = 'none',
  sound = 'none',
  icon = 'none',
  reasonCode = 'idle_tick',
  createdAt = new Date().toISOString()
} = {}) {
  return {
    schema: PET_ACTION_SCHEMA,
    source: PET_ACTION_SOURCES.includes(source) ? source : 'pet_state_engine',
    petState: PET_STATES.includes(petState) ? petState : 'idle',
    expression: PET_EXPRESSIONS.includes(expression) ? expression : 'idle_eyes',
    motion: PET_MOTIONS.includes(motion) ? motion : 'none',
    sound: PET_SOUNDS.includes(sound) ? sound : 'none',
    icon: PET_ICONS.includes(icon) ? icon : 'none',
    reasonCode: PET_REASON_CODES.includes(reasonCode) ? reasonCode : 'idle_tick',
    speechForbidden: true,
    createdAt
  };
}

export function createPetEyeFrame(seed = {}) {
  const capturedAt = seed.capturedAt || new Date().toISOString();
  return {
    schema: PET_EYE_FRAME_SCHEMA,
    frameId: seed.frameId || `pet-eye-${Date.now()}`,
    capturedAt,
    width: seed.width || 0,
    height: seed.height || 0,
    policy: seed.policy || 'local_preview',
    localPreviewDataUrl: seed.localPreviewDataUrl || '',
    rawDataUrl: seed.rawDataUrl || '',
    uploadStatus: seed.uploadStatus || 'local_only',
    uploadReceipt: seed.uploadReceipt || null
  };
}
