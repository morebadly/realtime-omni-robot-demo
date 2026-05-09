const NAV_ITEMS = [
  { id: 'robot-console', label: '机器人控制', desc: '表情、状态、身份' },
  { id: 'audio-io', label: '实时音频/摄像头', desc: '输入与输出通道' },
  { id: 'omni-session', label: 'Omni 会话', desc: '包、帧、状态机' },
  { id: 'visible-context', label: '可见信息', desc: '能看/不能看' },
  { id: 'plugins', label: '插件权限', desc: '权限和动作库' },
  { id: 'logs', label: '行为日志', desc: '调试记录' }
];

export default function DebugNavigation() {
  return (
    <nav className="debug-nav" aria-label="调试导航">
      <div className="debug-nav-copy">
        <p className="eyebrow">Debug Navigator</p>
        <h2>快速跳转调试区</h2>
        <p>页面内容较多时，用这里直接跳到常用模块；顶部不再堆满架构标签。</p>
      </div>
      <div className="debug-nav-actions">
        {NAV_ITEMS.map((item) => (
          <a href={`#${item.id}`} key={item.id}>
            <strong>{item.label}</strong>
            <small>{item.desc}</small>
          </a>
        ))}
        <a href="#top" className="debug-nav-top">
          <strong>回到顶部</strong>
          <small>Top</small>
        </a>
      </div>
    </nav>
  );
}
