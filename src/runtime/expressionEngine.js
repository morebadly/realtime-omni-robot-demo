export function expressionToRobotState(expression) {
  if (expression?.endsWith?.('_eyes')) return petExpressionToRobotState(expression);
  if (expression === 'speaking') return 'speaking';
  if (expression === 'listening') return 'listening';
  if (expression === 'thinking') return 'thinking';
  return 'idle';
}

export function inferExpressionFromEvent(event, fallback = 'idle') {
  if (event.type === 'touch.event' && event.area === 'head') return 'happy';
  if (event.type === 'touch.event' && event.area === 'tail') return 'angry';
  if (event.type === 'nfc.detected') return 'thinking';
  if (event.type === 'voice.intent' && event.intent === 'user_feels_hot') return 'happy';
  if (event.type === 'voice.intent' && event.intent === 'create_email_draft') return 'thinking';
  if (event.type === 'visual.query') return 'thinking';
  if (event.type === 'system.error') return 'error';
  return fallback;
}

export function getExpressionFromPlugin(plugin, fallback = 'thinking') {
  const action = plugin?.actions?.find((item) => item.startsWith('robot.expression:'));
  return action ? action.split(':')[1] : fallback;
}

export function petExpressionToRobotState(expression) {
  if (expression === 'sleeping_eyes') return 'sleeping';
  if (expression === 'sleepy_eyes' || expression === 'low_battery_eyes') return 'sleepy';
  if (expression === 'soft_worried_eyes') return 'concerned';
  if (expression === 'privacy_closed_eyes') return 'privacy_closed';
  if (expression === 'focused_eyes') return 'focused';
  return 'idle';
}

export function petExpressionToRobotExpression(expression) {
  const map = {
    idle_eyes: 'idle_eyes',
    happy_eyes: 'happy_eyes',
    soft_worried_eyes: 'soft_worried_eyes',
    sleepy_eyes: 'sleepy_eyes',
    sleeping_eyes: 'sleeping_eyes',
    curious_eyes: 'curious_eyes',
    comforted_eyes: 'comforted_eyes',
    lonely_eyes: 'lonely_eyes',
    hungry_eyes: 'hungry_eyes',
    low_battery_eyes: 'low_battery_eyes',
    sick_eyes: 'sick_eyes',
    focused_eyes: 'focused_eyes',
    privacy_closed_eyes: 'privacy_closed_eyes'
  };
  return map[expression] || 'idle_eyes';
}
