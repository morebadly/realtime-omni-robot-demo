import { ROBOT_STATES } from '../data/demoConfig';
import { CONNECTION_MODE_OPTIONS } from '../runtime/connectionModes';

export default function StatusControls({ robot, onState, onMode }) {
  return (
    <section className="panel">
      <div className="panel-header">
        <h2>运行状态</h2>
        <span className="tag">{robot.online ? 'online' : 'offline'}</span>
      </div>
      <div className="robot-card-mini">
        <div>
          <strong>{robot.name}</strong>
          <p>{robot.robotId}</p>
        </div>
        <div className="mode-pill">{robot.network}</div>
      </div>
      <div className="identity-summary">
        <div><small>唤醒名</small><strong>{robot.wakeName}</strong></div>
        <div><small>称呼用户</small><strong>{robot.ownerCalling}</strong></div>
      </div>
      <h3>表情/状态测试</h3>
      <div className="state-grid">
        {ROBOT_STATES.map((state) => (
          <button
            key={state.key}
            className={robot.expression === state.key ? 'active' : ''}
            onClick={() => onState(state.key, state.hint)}
            title={state.hint}
          >
            {state.label}
          </button>
        ))}
      </div>
      <h3>运行模式预留</h3>
      <div className="mode-list">
        {CONNECTION_MODE_OPTIONS.map((mode) => (
          <button
            key={mode.key}
            className={robot.mode === mode.key ? 'active mode-button' : 'mode-button'}
            onClick={() => onMode(mode.key, mode.label)}
          >
            <span>{mode.label}</span>
            <small>{mode.description}</small>
          </button>
        ))}
      </div>
    </section>
  );
}
