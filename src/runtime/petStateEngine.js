import { PET_STATE_SCHEMA, createPetAction } from './petBehaviorProtocol.js';

const DEFAULT_REST_REMINDER = {
  active: false,
  reasonCode: null,
  icon: 'none',
  label: 'idle'
};

const STATE_DEFAULTS = {
  idle: { expression: 'idle_eyes', motion: 'none', sound: 'none', icon: 'none' },
  curious: { expression: 'curious_eyes', motion: 'look_up', sound: 'soft_hum', icon: 'leaf' },
  happy: { expression: 'happy_eyes', motion: 'happy_bounce', sound: 'happy_chirp', icon: 'none' },
  comforted: { expression: 'comforted_eyes', motion: 'tiny_wiggle', sound: 'purr', icon: 'leaf' },
  sleepy: { expression: 'sleepy_eyes', motion: 'sleep_breathing', sound: 'yawn', icon: 'sleep_hat' },
  sleeping: { expression: 'sleeping_eyes', motion: 'sleep_breathing', sound: 'sleep_breath', icon: 'sleep_hat' },
  concerned: { expression: 'soft_worried_eyes', motion: 'nudge_forward_small', sound: 'soft_hum', icon: 'stretch' },
  lonely: { expression: 'lonely_eyes', motion: 'shrink_back_small', sound: 'sad_whimper', icon: 'leaf' },
  hungry: { expression: 'hungry_eyes', motion: 'look_down', sound: 'soft_hum', icon: 'food' },
  low_battery: { expression: 'low_battery_eyes', motion: 'sleep_breathing', sound: 'sleep_breath', icon: 'sleep_hat' },
  sick: { expression: 'sick_eyes', motion: 'shrink_back_small', sound: 'tiny_sneeze', icon: 'water' },
  focused: { expression: 'focused_eyes', motion: 'none', sound: 'none', icon: 'none' },
  privacy_closed: { expression: 'privacy_closed_eyes', motion: 'none', sound: 'none', icon: 'privacy_eye_closed' },
  offline_pet: { expression: 'idle_eyes', motion: 'tiny_wiggle', sound: 'soft_hum', icon: 'leaf' }
};

function isoTime(now = new Date()) {
  return now instanceof Date ? now.toISOString() : new Date(now).toISOString();
}

function normalizeNow(now) {
  return now instanceof Date ? now : new Date(now || Date.now());
}

function withState(currentState, patch, event, now) {
  const defaults = STATE_DEFAULTS[patch.petState] || STATE_DEFAULTS.idle;
  return {
    ...currentState,
    schema: PET_STATE_SCHEMA,
    petState: patch.petState || currentState.petState || 'idle',
    expression: patch.expression || defaults.expression,
    motion: patch.motion || defaults.motion,
    sound: patch.sound || defaults.sound,
    icon: patch.icon || defaults.icon,
    reasonCode: patch.reasonCode || 'idle_tick',
    speechForbidden: true,
    lastEventType: event?.type || currentState.lastEventType || null,
    lastUpdatedAt: isoTime(now),
    restReminder: patch.restReminder || DEFAULT_REST_REMINDER,
    cameraOpen: typeof patch.cameraOpen === 'boolean' ? patch.cameraOpen : currentState.cameraOpen,
    networkOnline: typeof patch.networkOnline === 'boolean' ? patch.networkOnline : currentState.networkOnline
  };
}

export function createInitialPetState(seed = {}) {
  const now = normalizeNow(seed.now);
  return {
    schema: PET_STATE_SCHEMA,
    petState: seed.petState || 'idle',
    expression: seed.expression || 'idle_eyes',
    motion: seed.motion || 'none',
    sound: seed.sound || 'none',
    icon: seed.icon || 'none',
    reasonCode: seed.reasonCode || 'idle_tick',
    speechForbidden: true,
    lastEventType: seed.lastEventType || null,
    lastUpdatedAt: isoTime(now),
    restReminder: seed.restReminder || DEFAULT_REST_REMINDER,
    cameraOpen: seed.cameraOpen || false,
    networkOnline: seed.networkOnline !== false
  };
}

export function reducePetState(currentState = createInitialPetState(), event = { type: 'pet.timer.tick' }, now = new Date()) {
  const current = currentState || createInitialPetState({ now });
  const type = event?.type || 'pet.timer.tick';

  if (type === 'touch.event') {
    if (event.area === 'head') {
      return withState(current, {
        petState: current.petState === 'sleepy' ? 'comforted' : 'happy',
        expression: current.petState === 'sleepy' ? 'comforted_eyes' : 'happy_eyes',
        motion: 'tiny_wiggle',
        sound: 'purr',
        reasonCode: 'touch_head'
      }, event, now);
    }
    if (event.area === 'face') {
      return withState(current, {
        petState: current.petState === 'idle' ? 'curious' : 'happy',
        expression: current.petState === 'idle' ? 'curious_eyes' : 'happy_eyes',
        motion: 'tiny_wiggle',
        sound: 'happy_chirp',
        reasonCode: 'touch_face'
      }, event, now);
    }
    if (event.area === 'back') {
      return withState(current, {
        petState: 'comforted',
        expression: 'comforted_eyes',
        motion: 'tiny_wiggle',
        sound: 'purr',
        reasonCode: 'touch_back'
      }, event, now);
    }
  }

  if (type === 'nfc.detected') {
    const label = event.label || event.tagId || event.prop || '';
    if (label === 'food') {
      return withState(current, {
        petState: current.petState === 'hungry' ? 'happy' : 'comforted',
        expression: current.petState === 'hungry' ? 'happy_eyes' : 'comforted_eyes',
        motion: 'happy_bounce',
        sound: 'happy_chirp',
        icon: 'food',
        reasonCode: 'nfc_food'
      }, event, now);
    }
    if (label === 'sleep_hat') {
      return withState(current, {
        petState: current.petState === 'sleepy' ? 'sleeping' : 'sleepy',
        expression: current.petState === 'sleepy' ? 'sleeping_eyes' : 'sleepy_eyes',
        motion: 'sleep_breathing',
        sound: 'sleep_breath',
        icon: 'sleep_hat',
        reasonCode: 'nfc_sleep_hat'
      }, event, now);
    }
    if (label === 'medicine_patch') {
      return withState(current, {
        petState: 'comforted',
        expression: 'comforted_eyes',
        motion: 'tiny_wiggle',
        sound: 'purr',
        icon: 'water',
        reasonCode: 'idle_tick'
      }, event, now);
    }
    if (label === 'work_badge') {
      return withState(current, {
        petState: 'focused',
        expression: 'focused_eyes',
        motion: 'none',
        sound: 'none',
        reasonCode: 'idle_tick'
      }, event, now);
    }
  }

  if (type === 'pet.work_session.long') {
    return withState(current, {
      petState: 'concerned',
      expression: 'soft_worried_eyes',
      motion: 'nudge_forward_small',
      sound: 'soft_hum',
      icon: 'stretch',
      reasonCode: 'work_session_long',
      restReminder: {
        active: true,
        reasonCode: 'work_session_long',
        icon: 'stretch',
        label: 'expression_only'
      }
    }, event, now);
  }

  if (type === 'pet.battery.low') {
    return withState(current, {
      petState: 'low_battery',
      expression: 'sleepy_eyes',
      motion: 'sleep_breathing',
      sound: 'sleep_breath',
      icon: 'sleep_hat',
      reasonCode: 'battery_low'
    }, event, now);
  }

  if (type === 'pet.camera.closed') {
    return withState(current, {
      petState: 'privacy_closed',
      expression: 'privacy_closed_eyes',
      motion: 'none',
      sound: 'none',
      icon: 'privacy_eye_closed',
      reasonCode: 'camera_closed',
      cameraOpen: false
    }, event, now);
  }

  if (type === 'pet.camera.opened') {
    return withState(current, {
      petState: current.networkOnline ? 'curious' : 'offline_pet',
      expression: current.networkOnline ? 'curious_eyes' : 'idle_eyes',
      motion: 'look_up',
      sound: 'soft_hum',
      reasonCode: 'idle_tick',
      cameraOpen: true
    }, event, now);
  }

  if (type === 'pet.user.returned') {
    return withState(current, {
      petState: 'happy',
      expression: 'happy_eyes',
      motion: 'happy_bounce',
      sound: 'happy_chirp',
      reasonCode: 'user_returned'
    }, event, now);
  }

  if (type === 'network.offline') {
    return withState(current, {
      petState: 'offline_pet',
      expression: 'idle_eyes',
      motion: 'tiny_wiggle',
      sound: 'soft_hum',
      icon: 'leaf',
      reasonCode: 'offline',
      networkOnline: false
    }, event, now);
  }

  if (type === 'network.online') {
    return withState(current, {
      petState: 'idle',
      expression: 'idle_eyes',
      motion: 'none',
      sound: 'none',
      reasonCode: 'user_returned',
      networkOnline: true
    }, event, now);
  }

  return withState(current, {
    petState: current.petState || 'idle',
    expression: current.expression || 'idle_eyes',
    motion: 'none',
    sound: 'none',
    icon: current.icon || 'none',
    reasonCode: 'idle_tick',
    restReminder: current.restReminder?.active ? current.restReminder : DEFAULT_REST_REMINDER
  }, event, now);
}

export function createPetActionFromState(nextState, event = {}, now = new Date()) {
  return createPetAction({
    source: event.source || 'pet_state_engine',
    petState: nextState.petState,
    expression: nextState.expression,
    motion: nextState.motion,
    sound: nextState.sound,
    icon: nextState.icon,
    reasonCode: nextState.reasonCode,
    createdAt: isoTime(now)
  });
}
