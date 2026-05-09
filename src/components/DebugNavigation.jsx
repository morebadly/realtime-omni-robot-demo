const NAV_ITEMS = [
  { id: 'live', label: '实时控制', desc: '脸、音频、摄像头' },
  { id: 'omni', label: 'Omni 会话', desc: '包、帧、状态机' },
  { id: 'plugins', label: '插件中心', desc: '动作库与插件' },
  { id: 'permissions', label: '权限中心', desc: '权限开关' },
  { id: 'context', label: '可见信息', desc: '透明面板' },
  { id: 'logs', label: '行为日志', desc: '调试记录' }
];

export default function DebugNavigation({ activeView = 'live', onSelect }) {
  return (
    <nav className="debug-nav" aria-label="调试导航">
      <div className="debug-nav-copy">
        <p className="eyebrow">Debug Navigator</p>
        <h2>点击切换调试视图</h2>
        <p>不再把所有模块铺成长页面；只显示当前选中的工作区，插件中心也会独立打开。</p>
      </div>
      <div className="debug-nav-actions" role="tablist" aria-label="调试视图">
        {NAV_ITEMS.map((item) => (
          <button
            type="button"
            role="tab"
            aria-selected={activeView === item.id}
            className={activeView === item.id ? 'active' : ''}
            key={item.id}
            onClick={() => onSelect?.(item.id)}
          >
            <strong>{item.label}</strong>
            <small>{item.desc}</small>
          </button>
        ))}
      </div>
    </nav>
  );
}
