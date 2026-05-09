const WORKER_SOURCE = `
function normalizeAction(item) {
  if (!item) return null;
  if (typeof item === 'string') return item;
  if (typeof item !== 'object') return null;
  if (item.type === 'robot.expression') return 'robot.expression:' + String(item.value || item.expression || 'idle');
  if (item.type === 'robot.say') return 'robot.say:' + String(item.text || item.value || '收到。');
  if (item.type === 'robot.motion') return 'robot.motion:' + String(item.value || item.motion || 'idle');
  if (item.type === 'robot.set_role') return 'robot.set_role:' + String(item.value || item.role || 'companion');
  if (item.type === 'device.set_temperature') return 'device.set_temperature:' + String(item.deviceId || 'living_room_ac') + ':' + String(item.temperature || 24);
  if (item.type === 'email.create_draft') return 'email.create_draft:mock';
  return null;
}

self.onmessage = async (message) => {
  const { sourceCode, context } = message.data || {};
  try {
    self.fetch = undefined;
    self.XMLHttpRequest = undefined;
    self.WebSocket = undefined;
    self.importScripts = undefined;

    const toolkit = {
      action: {
        expression: (value) => 'robot.expression:' + String(value || 'idle'),
        say: (text) => 'robot.say:' + String(text || '收到。'),
        motion: (value) => 'robot.motion:' + String(value || 'idle'),
        setRole: (value) => 'robot.set_role:' + String(value || 'companion'),
        setTemperature: (deviceId, temperature) => 'device.set_temperature:' + String(deviceId || 'living_room_ac') + ':' + String(temperature || 24),
        createEmailDraft: () => 'email.create_draft:mock'
      },
      eventIs: (type) => context?.event?.type === type,
      triggerIs: (value) => context?.trigger === value
    };

    const pluginFunction = new Function('ctx', 'toolkit', '"use strict";\n' + String(sourceCode || 'return [];'));
    const output = await pluginFunction(context || {}, toolkit);
    const rawActions = Array.isArray(output) ? output : [output];
    const actions = rawActions.map(normalizeAction).filter(Boolean).slice(0, 24);
    self.postMessage({ ok: true, actions });
  } catch (error) {
    self.postMessage({ ok: false, error: error?.message || String(error) });
  }
};
`;

function sanitizeContext(context = {}) {
  return {
    trigger: context.trigger,
    event: context.event ? {
      type: context.event.type,
      area: context.event.area,
      gesture: context.event.gesture,
      tagId: context.event.tagId,
      intent: context.event.intent,
      label: context.event.label
    } : null,
    robot: context.robot ? {
      mode: context.robot.mode,
      state: context.robot.state,
      expression: context.robot.expression,
      role: context.robot.role
    } : null
  };
}

export function defaultCodePluginSource() {
  return `// 写插件函数体：返回动作数组。ctx 里只有事实事件和少量机器人状态。\n// 不要在这里直接控制硬件；只返回动作意图，由 Runtime 做权限检查。\nif (ctx.event?.type === 'touch.event' && ctx.event.area === 'head') {\n  return [\n    toolkit.action.expression('happy'),\n    toolkit.action.say('这是代码插件返回的摸头回应。'),\n    toolkit.action.motion('tail_wag')\n  ];\n}\n\nreturn [toolkit.action.expression('thinking')];`;
}

export function runCodePluginSandbox(plugin, context = {}, timeoutMs = 900) {
  return new Promise((resolve) => {
    if (typeof Worker === 'undefined' || typeof Blob === 'undefined' || typeof URL === 'undefined') {
      resolve({ ok: false, actions: [], error: '当前环境不支持 Web Worker 沙箱。' });
      return;
    }

    const blob = new Blob([WORKER_SOURCE], { type: 'text/javascript' });
    const url = URL.createObjectURL(blob);
    const worker = new Worker(url);
    const timer = window.setTimeout(() => {
      worker.terminate();
      URL.revokeObjectURL(url);
      resolve({ ok: false, actions: [], error: `代码插件超过 ${timeoutMs}ms，已被终止。` });
    }, timeoutMs);

    worker.onmessage = (event) => {
      window.clearTimeout(timer);
      worker.terminate();
      URL.revokeObjectURL(url);
      resolve(event.data?.ok
        ? { ok: true, actions: event.data.actions || [] }
        : { ok: false, actions: [], error: event.data?.error || '代码插件执行失败。' });
    };

    worker.onerror = (error) => {
      window.clearTimeout(timer);
      worker.terminate();
      URL.revokeObjectURL(url);
      resolve({ ok: false, actions: [], error: error?.message || '代码插件沙箱错误。' });
    };

    worker.postMessage({
      sourceCode: plugin?.sourceCode || 'return [];',
      context: sanitizeContext({ ...context, trigger: plugin?.trigger, robot: context.robot })
    });
  });
}
