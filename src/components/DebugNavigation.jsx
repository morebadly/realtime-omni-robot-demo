const NAV_ITEMS = [
  { id: 'live', label: 'Pet Console', desc: 'non-verbal live view' },
  { id: 'omni', label: 'Omni Debug', desc: 'packets and provider gates' },
  { id: 'plugins', label: 'Plugins', desc: 'actions and manifests' },
  { id: 'permissions', label: 'Permissions', desc: 'runtime guards' },
  { id: 'context', label: 'Visible Context', desc: 'pet facts and boundaries' },
  { id: 'debug', label: 'Legacy Debug', desc: 'camera and mock events' },
  { id: 'logs', label: 'Logs', desc: 'debug records' }
];

export default function DebugNavigation({ activeView = 'live', onSelect }) {
  return (
    <nav className="debug-nav" aria-label="debug navigation">
      <div className="debug-nav-copy">
        <p className="eyebrow">Debug Navigator</p>
        <h2>Live pet first, tools behind tabs</h2>
        <p>The default surface is the pet console. Provider, audio, plugin, context, and log tooling stays available here for development.</p>
      </div>
      <div className="debug-nav-actions" role="tablist" aria-label="debug views">
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
