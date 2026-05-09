import { executePluginActions } from './pluginEngine';

const INTENT_TO_TRIGGER = {
  touch_head_affection: 'touch.event:head:tap',
  touch_tail_boundary: 'touch.event:tail:tap',
  nfc_study_card: 'nfc.detected:study_card_001',
  user_feels_hot: 'voice.intent:user_feels_hot',
  create_email_draft: 'voice.intent:create_email_draft'
};

function latestFactEvent(packet) {
  return packet?.input?.factEvents?.[0] || null;
}

function triggerFromFactEvent(event) {
  if (!event) return null;
  if (event.type === 'touch.event') return `touch.event:${event.area}:${event.gesture}`;
  if (event.type === 'nfc.detected') return `nfc.detected:${event.tagId}`;
  if (event.type === 'voice.intent') return `voice.intent:${event.intent}`;
  if (event.type === 'visual.query') return `visual.query:${event.intent}`;
  return null;
}

function resolveTrigger(intent, packet) {
  if (INTENT_TO_TRIGGER[intent.intent]) return INTENT_TO_TRIGGER[intent.intent];

  const factTrigger = triggerFromFactEvent(latestFactEvent(packet));
  if (intent.intent === 'nfc_detected' && factTrigger?.startsWith('nfc.detected:')) return factTrigger;
  if (intent.intent === 'voice_intent' && factTrigger?.startsWith('voice.intent:')) return factTrigger;
  if (intent.intent === 'visual_question_answering' && factTrigger?.startsWith('visual.query:')) return factTrigger;

  return null;
}

function findPluginByTrigger(plugins, trigger) {
  return (plugins || []).find((plugin) => plugin.enabled && plugin.trigger === trigger) || null;
}

export async function routeToolIntents({ robot, plugins, intents, packet, permissionMap }) {
  let nextRobot = { ...robot };
  const routed = [];

  for (const intent of intents || []) {
    const trigger = resolveTrigger(intent, packet);
    const plugin = findPluginByTrigger(plugins, trigger);

    if (!trigger || !plugin) {
      routed.push({
        intent: intent.intent,
        confidence: intent.confidence,
        status: 'no_plugin',
        trigger,
        reason: trigger ? '没有启用插件匹配该触发器' : '没有可路由的插件触发器'
      });
      continue;
    }

    const result = await executePluginActions(nextRobot, plugin, {
      event: latestFactEvent(packet) || { type: 'omni.tool_intent', intent: intent.intent },
      permissionMap,
      robot: nextRobot,
      source: 'omni_tool_intent',
      toolIntent: intent
    });

    nextRobot = result.robot;
    routed.push({
      intent: intent.intent,
      confidence: intent.confidence,
      status: result.skipped.length ? 'guarded' : 'executed',
      trigger,
      pluginId: plugin.id,
      pluginName: plugin.name,
      summary: result.summary,
      skipped: result.skipped
    });
  }

  return {
    robot: nextRobot,
    routed,
    executed: routed.filter((item) => item.status === 'executed').length,
    guarded: routed.filter((item) => item.status === 'guarded').length
  };
}
