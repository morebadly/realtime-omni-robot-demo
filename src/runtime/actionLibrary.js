export const TRIGGER_LIBRARY = [
  { label: '语音：我热了', value: 'voice.intent:user_feels_hot', eventType: 'voice.intent' },
  { label: '语音：生成邮件草稿', value: 'voice.intent:create_email_draft', eventType: 'voice.intent' },
  { label: '触摸：摸头', value: 'touch.event:head:tap', eventType: 'touch.event' },
  { label: '触摸：摸尾巴', value: 'touch.event:tail:tap', eventType: 'touch.event' },
  { label: 'NFC：学习卡', value: 'nfc.detected:study_card_001', eventType: 'nfc.detected' },
  { label: 'NFC：睡觉卡', value: 'nfc.detected:sleep_card_001', eventType: 'nfc.detected' },
  { label: '视觉：你看这个是什么', value: 'visual.query:identify_current_view', eventType: 'visual.query' }
];

export const ACTION_LIBRARY = [
  { label: '表情：开心', value: 'robot.expression:happy', permission: 'robot.expression.write', type: '表情' },
  { label: '表情：思考', value: 'robot.expression:thinking', permission: 'robot.expression.write', type: '表情' },
  { label: '表情：生气', value: 'robot.expression:angry', permission: 'robot.expression.write', type: '表情' },
  { label: '表情：傲娇', value: 'robot.expression:annoyed', permission: 'robot.expression.write', type: '表情' },
  { label: '表情：害羞', value: 'robot.expression:shy', permission: 'robot.expression.write', type: '表情' },
  { label: '表情：困倦', value: 'robot.expression:sleepy', permission: 'robot.expression.write', type: '表情' },
  { label: '说话：摸头回应', value: 'robot.say:嘿嘿，摸头好舒服呀。', permission: 'voice.output', type: '语音' },
  { label: '说话：学习助手开启', value: 'robot.say:学习助手已开启，我会陪你一步步做题。', permission: 'voice.output', type: '语音' },
  { label: '说话：别摸尾巴', value: 'robot.say:哼，不许乱摸尾巴。', permission: 'voice.output', type: '语音' },
  { label: '说话：空调已降温', value: 'robot.say:空调已调到 24℃，我先帮你降温。', permission: 'voice.output', type: '语音' },
  { label: '动作：摇尾巴', value: 'robot.motion:tail_wag', permission: 'robot.motion.write', type: '动作' },
  { label: '动作：点头', value: 'robot.motion:nod', permission: 'robot.motion.write', type: '动作' },
  { label: '角色：学习助手', value: 'robot.set_role:study_assistant', permission: 'role.change', type: '角色' },
  { label: '角色：陪伴模式', value: 'robot.set_role:companion', permission: 'role.change', type: '角色' },
  { label: '空调：调到 24℃', value: 'device.set_temperature:living_room_ac:24', permission: 'home.ac.write', type: '设备' },
  { label: '邮件：生成草稿', value: 'email.create_draft:mock', permission: 'email.draft', type: '邮件' }
];

export function getActionMeta(action) {
  return ACTION_LIBRARY.find((item) => item.value === action) || {
    label: action,
    value: action,
    permission: 'plugin.run',
    type: '自定义'
  };
}

export function actionLabel(action) {
  return getActionMeta(action).label;
}

export function collectActionPermissions(actions = []) {
  return [...new Set(actions.map((action) => getActionMeta(action).permission))];
}
