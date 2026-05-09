import { NETWORK_QUALITY_PRESETS } from '../runtime/networkManager';

function metricValue(value, suffix = '') {
  if (value === null || value === undefined) return '—';
  return `${value}${suffix}`;
}

export default function ConnectionManagerPanel({ connection, framePolicy, quality, onQuality, onAutoFallback }) {
  return (
    <section className="panel connection-panel">
      <div className="panel-header">
        <div>
          <h2>Network / Connection Manager</h2>
          <p className="muted">v0.9：把 Wi‑Fi、eSIM/实体 SIM、离线降级和关键帧节流放进 Runtime 状态。</p>
        </div>
        <span className={`tag connection-status-${connection.status}`}>{connection.status}</span>
      </div>

      <div className="connection-grid">
        <div><small>连接方式</small><strong>{connection.label}</strong><span>{connection.transport}</span></div>
        <div><small>延迟</small><strong>{metricValue(connection.latencyMs, 'ms')}</strong><span>jitter {metricValue(connection.jitterMs, 'ms')}</span></div>
        <div><small>丢包</small><strong>{metricValue(connection.packetLoss, '%')}</strong><span>signal {metricValue(connection.signal, '%')}</span></div>
        <div><small>上传预算</small><strong>{connection.uploadBudget}</strong><span>{connection.audioRoute}</span></div>
      </div>

      <div className="connection-note">
        <strong>策略说明：</strong>{connection.description}
        <p>{connection.qualityNote}</p>
      </div>

      <div className="quality-buttons">
        {NETWORK_QUALITY_PRESETS.map((preset) => (
          <button key={preset.key} className={quality === preset.key ? 'active' : ''} onClick={() => onQuality?.(preset.key)}>
            {preset.label}
          </button>
        ))}
        <button className="secondary-provider-button" onClick={onAutoFallback}>执行自动降级策略</button>
      </div>

      <div className="frame-policy-card">
        <div>
          <small>Frame Selector 当前策略</small>
          <strong>{framePolicy.label}</strong>
          <p>{framePolicy.rationale}</p>
        </div>
        <div className="policy-kpis">
          <span>{framePolicy.cadence}</span>
          <span>{framePolicy.captureWidth}px</span>
          <span>{framePolicy.upload}</span>
        </div>
      </div>
    </section>
  );
}
