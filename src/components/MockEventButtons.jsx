export default function MockEventButtons({ onEvent }) {
  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Mock 事实事件</h2>
        <span className="tag">not emotion</span>
      </div>
      <p className="muted">触摸和 NFC 只进入 Runtime 作为事实事件，不在这里判断用户情绪。</p>
      <div className="mock-grid">
        <button onClick={() => onEvent({ type: 'touch.event', area: 'head', gesture: 'tap', label: '摸头' })}>模拟摸头</button>
        <button onClick={() => onEvent({ type: 'touch.event', area: 'tail', gesture: 'tap', label: '摸尾巴' })}>模拟摸尾巴</button>
        <button onClick={() => onEvent({ type: 'nfc.detected', tagId: 'study_card_001', label: 'NFC 学习卡' })}>模拟 NFC 学习卡</button>
        <button onClick={() => onEvent({ type: 'nfc.detected', tagId: 'sleep_card_001', label: 'NFC 睡觉卡' })}>模拟 NFC 睡觉卡</button>
        <button onClick={() => onEvent({ type: 'voice.intent', intent: 'user_feels_hot', label: '用户说热了' })}>模拟“我热了”</button>
        <button onClick={() => onEvent({ type: 'voice.intent', intent: 'create_email_draft', label: '生成邮件草稿' })}>模拟邮件草稿</button>
        <button onClick={() => onEvent({ type: 'visual.query', intent: 'identify_current_view', label: '你看这个是什么' })}>模拟视觉问答</button>
        <button onClick={() => onEvent({ type: 'system.error', label: '工具调用失败' })}>模拟错误</button>
      </div>
    </section>
  );
}
