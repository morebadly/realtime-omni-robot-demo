const expressionOutputMap = {
  idle: { label: '机器人当前表情：待机', tone: '中性待命', style: 'neutral' },
  listening: { label: '机器人当前表情：正在听', tone: '专注倾听', style: 'neutral' },
  thinking: { label: '机器人当前表情：思考', tone: '处理上下文', style: 'neutral' },
  speaking: { label: '机器人当前表情：说话', tone: '语音输出', style: 'neutral' },
  happy: { label: '机器人当前表情：开心', tone: '积极回应', style: 'positive' },
  annoyed: { label: '机器人当前表情：傲娇', tone: '轻微抗议', style: 'warn' },
  angry: { label: '机器人当前表情：生气', tone: '强烈拒绝', style: 'danger' },
  sad: { label: '机器人当前表情：难过', tone: '安静陪伴', style: 'warn' },
  shy: { label: '机器人当前表情：害羞', tone: '亲密互动', style: 'positive' },
  sleepy: { label: '机器人当前表情：困倦', tone: '低功耗/休息', style: 'warn' },
  surprised: { label: '机器人当前表情：惊讶', tone: '突发响应', style: 'positive' },
  error: { label: '机器人当前表情：故障', tone: '系统异常', style: 'danger' }
};

const sourceLabel = {
  boot: '启动默认',
  manual_test: '手动测试',
  plugin_preview: '插件测试预览',
  plugin_action: '插件动作',
  code_plugin: '代码插件',
  runtime_event_hint: 'Runtime 事实事件提示',
  omni_output: 'Omni 输出'
};

export default function EmotionInspector({ robot, cameraStatus, recentEvents }) {
  const output = expressionOutputMap[robot.expression] || expressionOutputMap.idle;
  const latestEvent = recentEvents?.[0];
  const cameraReady = cameraStatus?.cameraActive;

  return (
    <section className="emotion-card">
      <div className="emotion-header">
        <div>
          <p className="eyebrow">Omni I/O Inspector</p>
          <h2>实时 Omni 输入/输出策略预览</h2>
        </div>
        <span className={`emotion-badge ${output.style}`}>{robot.expression}</span>
      </div>
      <div className="emotion-main">
        <div>
          <small>Omni 主输入</small>
          <strong>原始音频流，不只传 ASR 文本</strong>
        </div>
        <div>
          <small>视觉输入</small>
          <strong>{cameraReady ? `关键帧直传 · ${cameraStatus.frameCount} 帧` : '摄像头未开启'}</strong>
        </div>
        <div>
          <small>事实事件</small>
          <strong>{latestEvent ? latestEvent.type : '暂无触摸/NFC事件'}</strong>
        </div>
        <div>
          <small>机器人表情输出</small>
          <strong>{output.label}</strong>
        </div>
        <div>
          <small>表情来源</small>
          <strong>{sourceLabel[robot.expressionSource] || robot.expressionSource || 'Runtime'}</strong>
        </div>
        <div>
          <small>状态语气</small>
          <strong>{output.tone}</strong>
        </div>
        <div>
          <small>模型接入</small>
          <strong>{robot.adapter}</strong>
        </div>
        <div>
          <small>ASR 文本用途</small>
          <strong>字幕 / 日志 / 调试 / 插件关键词辅助</strong>
        </div>
      </div>
      <p className="emotion-note">
        v0.7 已移除“情绪置信度百分比”。这里显示的是机器人自己的表情输出和来源，不给用户贴情绪标签；Runtime 只把原始音频、关键帧和事实事件按策略送给 Omni，由 Omni 统一理解上下文。
      </p>
    </section>
  );
}
