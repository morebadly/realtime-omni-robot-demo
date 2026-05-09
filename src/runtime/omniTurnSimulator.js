function latestFactEvent(packet) {
  return packet?.input?.factEvents?.[0] || null;
}

function createToolIntent(intent, confidence = 0.76, reason = '') {
  return {
    type: 'plugin.trigger',
    intent,
    confidence,
    reason
  };
}

function expressionForEvent(event) {
  if (!event) return 'idle';
  if (event.type === 'touch.event' && event.area === 'head') return 'happy';
  if (event.type === 'touch.event' && event.area === 'tail') return 'angry';
  if (event.type === 'nfc.detected') return 'thinking';
  if (event.type === 'visual.query') return 'thinking';
  if (event.type === 'system.error') return 'error';
  if (event.type === 'voice.intent') return 'thinking';
  return 'listening';
}

function replyForPacket(packet) {
  const name = packet?.identity?.displayName || 'DemoBot';
  const event = latestFactEvent(packet);

  if (packet?.routing?.route === 'offline_pet_engine') {
    return {
      replyText: `${name} 已进入基础宠物模式，我还能做表情、触摸和 NFC 预设反应。`,
      expression: event ? expressionForEvent(event) : 'sleepy',
      toolIntents: []
    };
  }

  if (event?.type === 'touch.event' && event.area === 'head') {
    return {
      replyText: '嘿嘿，我知道你刚刚摸了我的头。',
      expression: 'happy',
      toolIntents: [createToolIntent('touch_head_affection', 0.88, '事实事件 touch.head.tap 匹配本地插件。')]
    };
  }

  if (event?.type === 'touch.event' && event.area === 'tail') {
    return {
      replyText: '哼，尾巴那里有点敏感，不许乱摸。',
      expression: 'angry',
      toolIntents: [createToolIntent('touch_tail_boundary', 0.84, '事实事件 touch.tail.tap 匹配本地插件。')]
    };
  }

  if (event?.type === 'nfc.detected') {
    const study = event.tagId === 'study_card_001';
    return {
      replyText: study ? '学习卡已识别，我可以切换成学习助手陪你做题。' : '我识别到一张 NFC 卡，会按插件规则执行本地动作。',
      expression: study ? 'thinking' : 'surprised',
      toolIntents: [createToolIntent(study ? 'nfc_study_card' : 'nfc_detected', 0.82, `检测到 NFC：${event.tagId}`)]
    };
  }

  if (event?.type === 'visual.query') {
    return {
      replyText: '我会看当前高清关键帧和最近几帧，但不会在前端先做情绪摘要。',
      expression: 'thinking',
      toolIntents: [createToolIntent('visual_question_answering', 0.79, 'Frame Selector 进入高清当前帧 + 最近几帧策略。')]
    };
  }

  if (event?.type === 'voice.intent') {
    return {
      replyText: '我收到了语音意图，会先交给 Omni 理解，再由插件和权限系统执行动作。',
      expression: 'thinking',
      toolIntents: [createToolIntent(event.intent || 'voice_intent', 0.74, 'ASR/关键词只作为插件辅助，不替代原始音频输入。')]
    };
  }

  if (packet?.input?.audio?.active) {
    return {
      replyText: '我正在接收原始音频流，会结合关键帧和最近事实事件理解你的上下文。',
      expression: 'listening',
      toolIntents: []
    };
  }

  return {
    replyText: `${name} 待机中。你可以打开麦克风、摄像头，或触发触摸/NFC 事件来模拟实时 Omni 回合。`,
    expression: 'idle',
    toolIntents: []
  };
}

export function simulateOmniTurn(packet) {
  const reply = replyForPacket(packet);
  const now = new Date().toISOString();
  return {
    turnId: `turn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    schema: 'omni.output_turn.v1',
    createdAt: now,
    adapter: packet?.routing?.adapter,
    route: packet?.routing?.route,
    reply_text: reply.replyText,
    reply_audio: 'mock_audio_stream',
    expression: {
      type: 'expression.update',
      expression: reply.expression,
      source: 'omni_turn_simulator'
    },
    tool_intents: reply.toolIntents,
    transcript: {
      partial_asr: packet?.input?.audio?.active ? '（调试字幕占位，不作为主输入）' : '',
      usage: '字幕 / 日志 / 调试 / 插件关键词辅助'
    },
    notes: [
      '这是前端 Demo 的 Omni 回合模拟，不是真实模型输出。',
      '真实接入时由 LocalDevOmniAdapter / CloudOmniAdapter 返回语音、表情和工具意图。'
    ]
  };
}
