import { actionLabel, collectActionPermissions } from './actionLibrary';
import { checkActionPermission, checkPermission, describePermissionStatus } from './permissionEngine';
import { runCodePluginSandbox } from './codePluginSandbox';
import { createPluginManifest } from './pluginManifest';
import { executeMockToolAction } from './toolEngine';

function parseAction(action) {
  const [type, ...payload] = String(action || '').split(':');
  return { type, payload };
}

export function formatAction(action) {
  const { type, payload } = parseAction(action);
  if (type === 'device.set_temperature') return `空调 ${payload[0]} → ${payload[1]}℃`;
  if (type === 'email.create_draft') return '生成模拟邮件草稿';
  if (type === 'robot.set_role') return `切换角色 → ${payload[0]}`;
  if (type === 'robot.expression') return `切换表情 → ${payload[0]}`;
  if (type === 'robot.say') return `机器人说：${payload.join(':')}`;
  if (type === 'robot.motion') return `机器人动作 → ${payload[0]}`;
  return actionLabel(action);
}

async function resolvePluginActions(plugin, context = {}) {
  if (plugin?.runtime !== 'code_sandbox') {
    return { actions: plugin?.actions || [], sandbox: null };
  }

  const sandboxResult = await runCodePluginSandbox(plugin, context);
  const actions = sandboxResult.ok ? sandboxResult.actions : [];
  return { actions, sandbox: sandboxResult };
}

function checkPluginDeclaredPermission(plugin, permission) {
  const manifest = plugin?.manifest || createPluginManifest(plugin);
  const declared = new Set([...(plugin?.permissions || []), ...(manifest.permissions || [])]);
  return declared.has(permission);
}

export async function executePluginActions(robot, plugin, context = {}) {
  if (!plugin) return { robot, effects: [], summary: '未匹配插件', skipped: [], sandbox: null };

  let next = { ...robot };
  const effects = [];
  const skipped = [];
  const startedAt = new Date().toISOString();
  const runGuard = checkPermission(context.permissionMap || {}, 'plugin.run');
  if (!runGuard.allowed) {
    const reason = `plugin.run：${describePermissionStatus(runGuard.status)}`;
    return {
      robot: next,
      effects: [{ type: 'permission.blocked', label: `已阻止插件运行（${reason}）` }],
      skipped: [{ action: 'plugin.run', permission: 'plugin.run', reason }],
      sandbox: null,
      summary: `插件运行被权限中心阻止：${reason}`
    };
  }
  const { actions, sandbox } = await resolvePluginActions(plugin, { ...context, robot });

  if (sandbox && !sandbox.ok) {
    return {
      robot: next,
      effects,
      skipped: [{ action: 'code_sandbox', reason: sandbox.error }],
      sandbox,
      summary: `代码插件沙箱失败：${sandbox.error}`
    };
  }

  actions.forEach((action) => {
    const guard = checkActionPermission(action, context.permissionMap || {});
    if (!checkPluginDeclaredPermission(plugin, guard.permission)) {
      skipped.push({
        action,
        permission: guard.permission,
        reason: `${guard.permission}：插件 manifest 未声明`
      });
      effects.push({ type: 'permission.blocked', label: `已阻止：${formatAction(action)}（插件 manifest 未声明 ${guard.permission}）` });
      return;
    }
    if (!guard.allowed) {
      skipped.push({
        action,
        permission: guard.permission,
        reason: `${guard.permission}：${describePermissionStatus(guard.status)}`
      });
      effects.push({ type: 'permission.blocked', label: `已阻止：${formatAction(action)}（${guard.reason}）` });
      return;
    }

    next = executeMockToolAction(next, action, plugin, context, startedAt);
    effects.push({ type: parseAction(action).type, label: formatAction(action), permission: guard.permission, status: guard.status });
  });

  const summary = actions.length > 0
    ? actions.map((action) => {
      const blocked = skipped.find((item) => item.action === action);
      return blocked ? `${formatAction(action)} [已阻止: ${blocked.reason}]` : formatAction(action);
    }).join(' / ')
    : '无动作';

  return { robot: next, effects, skipped, sandbox, summary, resolvedActions: actions, permissions: collectActionPermissions(actions) };
}
