export function expressionToRobotState(expression) {
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
