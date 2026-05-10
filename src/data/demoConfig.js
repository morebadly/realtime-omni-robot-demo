export const ROBOT_STATES = [
  { key: 'idle', label: '待机', hint: '机器人保持待机表情，等待用户互动。' },
  { key: 'listening', label: '正在听', hint: '用户正在说话，Omni 会话接收原始音频流。' },
  { key: 'thinking', label: '思考中', hint: '模型正在结合原始语音、关键帧、上下文和事实事件。' },
  { key: 'speaking', label: '正在说', hint: '机器人语音回复，屏幕嘴巴动画开启。' },
  { key: 'happy', label: '开心', hint: '插件或模型触发开心表情。' },
  { key: 'annoyed', label: '傲娇', hint: 'LOOI 风格斜切半月眼，避免横向拉扁。' },
  { key: 'angry', label: '生气', hint: '更明显的强烈拒绝/不满表情，包含红粉光效和怒气符号。' },
  { key: 'sad', label: '难过', hint: '用户低落或机器人安静陪伴场景。' },
  { key: 'shy', label: '害羞', hint: '亲密互动或夸奖机器人时使用。' },
  { key: 'surprised', label: '惊讶', hint: '被打断、NFC 触发或意外事件时使用。' },
  { key: 'sleepy', label: '困倦', hint: '无网络基础宠物模式或休眠场景。' },
  { key: 'error', label: '故障', hint: '网络、权限或工具调用失败。' }
];

export const DEFAULT_PERMISSIONS = [
  { key: 'voice.input', label: '麦克风输入', status: 'enabled', group: '语音' },
  { key: 'voice.output', label: '语音输出', status: 'enabled', group: '语音' },
  { key: 'voice.cloud_upload', label: '语音上传云端', status: 'disabled', group: '云端隐私' },
  { key: 'camera.read', label: '摄像头读取', status: 'enabled', group: '视觉' },
  { key: 'camera.cloud_upload', label: '摄像头关键帧上传云端', status: 'disabled', group: '云端隐私' },
  { key: 'touch.read', label: '触摸事件读取', status: 'mock_only', group: '事实事件' },
  { key: 'nfc.read', label: 'NFC 事件读取', status: 'mock_only', group: '事实事件' },
  { key: 'home.ac.write', label: '空调控制动作', status: 'mock_only', group: '插件动作权限' },
  { key: 'email.draft', label: '邮件草稿动作', status: 'mock_only', group: '插件动作权限' },
  { key: 'email.send', label: '真实发送邮件', status: 'confirm_required', group: '高风险' },
  { key: 'robot.expression.write', label: '表情切换动作', status: 'enabled', group: '插件动作权限' },
  { key: 'robot.motion.write', label: '机器人动作控制', status: 'mock_only', group: '插件动作权限' },
  { key: 'role.change', label: '角色切换动作', status: 'enabled', group: '插件动作权限' },
  { key: 'plugin.run', label: '插件运行', status: 'enabled', group: '插件' },
  { key: 'plugin.device_control', label: '插件控制设备', status: 'mock_only', group: '插件' }
];

export const DEFAULT_PLUGINS = [
  {
    id: 'auto_ac_cooling',
    name: '我热了自动调空调',
    enabled: true,
    trigger: 'voice.intent:user_feels_hot',
    permissions: ['home.ac.write', 'robot.expression.write', 'voice.output'],
    actions: ['device.set_temperature:living_room_ac:24', 'robot.expression:happy', 'robot.say:空调已调到 24℃，我先帮你降温。'],
    runtime: 'mock'
  },
  {
    id: 'touch_head_cute',
    name: '摸头撒娇组合动作',
    enabled: true,
    trigger: 'touch.event:head:tap',
    permissions: ['touch.read', 'voice.output', 'robot.expression.write', 'robot.motion.write'],
    actions: ['robot.expression:happy', 'robot.say:嘿嘿，摸头好舒服呀。', 'robot.motion:tail_wag'],
    runtime: 'mock'
  },
  {
    id: 'nfc_study_card',
    name: 'NFC 学习卡组合动作',
    enabled: true,
    trigger: 'nfc.detected:study_card_001',
    permissions: ['nfc.read', 'role.change', 'voice.output', 'robot.expression.write'],
    actions: ['robot.set_role:study_assistant', 'robot.expression:thinking', 'robot.say:学习助手已开启，我会陪你一步步做题。'],
    runtime: 'mock'
  },
  {
    id: 'touch_tail_angry',
    name: '摸尾巴生气提醒',
    enabled: true,
    trigger: 'touch.event:tail:tap',
    permissions: ['touch.read', 'robot.expression.write', 'voice.output'],
    actions: ['robot.expression:angry', 'robot.say:哼，不许乱摸尾巴。'],
    runtime: 'mock'
  },
  {
    id: 'nfc_sleep_card',
    name: 'NFC 睡觉卡',
    enabled: true,
    trigger: 'nfc.detected:sleep_card_001',
    permissions: ['nfc.read', 'robot.expression.write', 'voice.output'],
    actions: ['robot.expression:sleepy', 'robot.say:我先进入基础宠物休息模式。'],
    runtime: 'mock'
  },
  {
    id: 'email_draft_teacher',
    name: '生成邮件草稿',
    enabled: false,
    trigger: 'voice.intent:create_email_draft',
    permissions: ['email.draft', 'robot.expression.write'],
    actions: ['robot.expression:thinking', 'email.create_draft:mock'],
    runtime: 'mock'
  }
];

export const RUNTIME_MODES = [
  { key: 'local_dev', label: '本地调试', description: '本地 Qwen-Omni 兼容服务 / LocalDevOmniAdapter，用于 Demo 调试。' },
  { key: 'wifi_cloud', label: 'Wi‑Fi 云端', description: '成熟产品主体验：Wi‑Fi 连接第三方云端 Omni。' },
  { key: 'cellular_cloud', label: 'eSIM/实体卡云端', description: '出门场景：蜂窝网络连接云端 Omni，音频优先。' },
  { key: 'self_hosted_cloud', label: '自建云 Omni', description: '后期自建 SelfHostedCloudOmniAdapter 服务。' },
  { key: 'offline_pet', label: '基础宠物', description: '无网络：触摸、NFC、表情、预设动作和基础插件可用。' }
];
