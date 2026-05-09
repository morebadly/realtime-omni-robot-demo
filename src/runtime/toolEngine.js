import { expressionToRobotState } from './expressionEngine';

function parseAction(action) {
  const [type, ...payload] = String(action || '').split(':');
  return { type, payload };
}

export function executeMockToolAction(robot, action, plugin, context = {}, startedAt = new Date().toISOString()) {
  const { type, payload } = parseAction(action);
  const sourcePlugin = plugin?.id || 'runtime';

  if (type === 'robot.expression') {
    const expression = payload[0] || 'idle';
    return {
      ...robot,
      expression,
      expressionSource: plugin?.runtime === 'code_sandbox' ? 'code_plugin' : 'plugin_action',
      state: expressionToRobotState(expression)
    };
  }

  if (type === 'robot.say') {
    const text = payload.join(':') || '收到。';
    return {
      ...robot,
      lastSpeech: text,
      speechHistory: [
        { id: `${Date.now()}_${Math.random()}`, text, at: startedAt, source: sourcePlugin },
        ...(robot.speechHistory || [])
      ].slice(0, 10)
    };
  }

  if (type === 'robot.motion') {
    const motion = payload[0] || 'idle';
    return {
      ...robot,
      motion: {
        name: motion,
        at: startedAt,
        source: sourcePlugin
      }
    };
  }

  if (type === 'device.set_temperature') {
    const [deviceId, temperature] = payload;
    return {
      ...robot,
      ac: {
        ...robot.ac,
        deviceId: deviceId || robot.ac?.deviceId,
        power: 'on',
        temperature: Number(temperature || 24)
      }
    };
  }

  if (type === 'email.create_draft') {
    return {
      ...robot,
      emailDrafts: [
        ...(robot.emailDrafts || []),
        {
          id: Date.now() + Math.random(),
          to: 'teacher@example.com',
          subject: 'Mock 邮件草稿',
          body: '这是一封由插件动作 email.create_draft 生成的模拟邮件草稿。',
          sourcePlugin,
          createdFromEvent: context.event?.type || 'manual_test'
        }
      ]
    };
  }

  if (type === 'robot.set_role') {
    return { ...robot, role: payload[0] || 'companion' };
  }

  return robot;
}
