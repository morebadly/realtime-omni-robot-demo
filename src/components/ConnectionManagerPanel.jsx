import { buildConnectionManagerViewModel } from '../runtime/connectionManagerViewModel';

export default function ConnectionManagerPanel({ connection, framePolicy, quality, onQuality, onAutoFallback }) {
  const view = buildConnectionManagerViewModel({ connection, framePolicy, quality });

  return (
    <section className="panel connection-panel">
      <div className="panel-header">
        <div>
          <h2>{view.title}</h2>
          <p className="muted">{view.subtitle}</p>
        </div>
        <span className={`tag connection-status-${view.status}`}>{view.status}</span>
      </div>

      <div className="connection-grid">
        {view.metrics.map((item) => (
          <div key={item.key}>
            <small>{item.label}</small>
            <strong>{item.value}</strong>
            <span>{item.detail}</span>
          </div>
        ))}
      </div>

      <div className="connection-note">
        <strong>{view.strategy.label}</strong>{view.strategy.description}
        <p>{view.strategy.qualityNote}</p>
      </div>

      <div className="quality-buttons">
        {view.qualityOptions.map((preset) => (
          <button
            key={preset.key}
            className={preset.active ? 'active' : ''}
            onClick={() => onQuality?.(preset.key)}
            title={preset.title}
          >
            {preset.label}
          </button>
        ))}
        <button className="secondary-provider-button" onClick={onAutoFallback} title={view.autoFallbackButton.title}>
          {view.autoFallbackButton.label}
        </button>
      </div>

      <div className="frame-policy-card">
        <div>
          <small>{view.framePolicy.eyebrow}</small>
          <strong>{view.framePolicy.label}</strong>
          <p>{view.framePolicy.rationale}</p>
        </div>
        <div className="policy-kpis">
          {view.framePolicy.kpis.map((item) => <span key={item}>{item}</span>)}
        </div>
      </div>
    </section>
  );
}
