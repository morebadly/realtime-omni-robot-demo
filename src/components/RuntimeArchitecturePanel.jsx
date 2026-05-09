const MODULES = [
  ['RuntimeCore', '统一承接事件、状态、插件、权限、网络和 Adapter 变更。'],
  ['RealtimeSession', '管理原始音频流通道，ASR 仅作为字幕/日志/调试副产物。'],
  ['ConnectionManager', '管理 Wi‑Fi、eSIM/实体 SIM、自建云和离线降级策略。'],
  ['FramePolicyEngine', '根据模式、网络、说话状态和视觉询问决定关键帧频率。'],
  ['OmniSessionBridge', '把音频流、关键帧、事实事件、身份、权限和插件打包给 Adapter。'],
  ['ToolIntentRouter', '把 Omni 输出的工具意图路由回插件触发器，而不是绕过插件中心。'],
  ['ToolEngine', '执行 Mock 空调、邮件、表情、动作和角色切换，后续替换真实 Adapter。'],
  ['RobotProfileStore', '管理 display_name / wake_name / voice_style 等可变身份。'],
  ['ModelAdapterManager', '保存 Local / Cloud / SelfHosted / Offline Provider 配置。'],
  ['PluginManager', '加载 manifest、启停插件、执行模板或代码沙箱。'],
  ['PermissionEngine', '所有事实事件与工具动作执行前都经过 Runtime Guard。']
];

export default function RuntimeArchitecturePanel({ trace = [] }) {
  return (
    <section className="panel runtime-architecture-panel">
      <div className="panel-header">
        <div>
          <h2>Runtime 架构进度</h2>
          <p className="muted">v1.0.3 继续把 Web 控制台从“大脑”降级为客户端，Omni 工具意图、插件权限和 Mock 工具执行都收敛到 Runtime。</p>
        </div>
        <span className="tag">runtime core</span>
      </div>
      <div className="runtime-module-grid">
        {MODULES.map(([name, description]) => (
          <div className="runtime-module-card" key={name}>
            <strong>{name}</strong>
            <small>{description}</small>
          </div>
        ))}
      </div>
      <div className="runtime-trace-box">
        <strong>Runtime Trace</strong>
        <div className="runtime-trace-list">
          {trace.slice(0, 8).map((item) => (
            <div className="runtime-trace-row" key={item.id}>
              <span>{item.time}</span>
              <b>{item.layer}</b>
              <small>{item.event} · {item.detail}</small>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
