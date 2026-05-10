import { buildRobotConnectionStatusViewModel } from '../runtime/connectionStatusViewModel';

function HealthRow({ tone = 'idle', label, value, detail }) {
  return (
    <div className={`robot-connection-row robot-connection-row-${tone}`}>
      <span className={`robot-connection-dot robot-connection-dot-${tone}`} />
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
        {detail ? <p>{detail}</p> : null}
      </div>
    </div>
  );
}

function ChecklistItem({ tone = 'idle', label, detail }) {
  return (
    <div className={`robot-call-check-item robot-call-check-item-${tone}`}>
      <span className={`robot-connection-dot robot-connection-dot-${tone}`} />
      <div>
        <strong>{label}</strong>
        <small>{detail}</small>
      </div>
    </div>
  );
}

function NextAction({ action, onConnectionMode, onAdapterTest }) {
  if (!action) return null;
  const handlers = {
    switch_local_dev: () => onConnectionMode?.('local_dev', '本地调试'),
    test_adapter: onAdapterTest,
    retest_adapter: onAdapterTest
  };
  const onClick = handlers[action.kind];
  return (
    <div className={`robot-next-action robot-next-action-${action.tone}`}>
      <div>
        <small>建议下一步</small>
        <strong>{action.title}</strong>
        <p>{action.detail}</p>
      </div>
      {action.buttonLabel && onClick && (
        <button type="button" onClick={onClick} disabled={action.disabled}>
          {action.buttonLabel}
        </button>
      )}
    </div>
  );
}

export default function RobotConnectionStatusPanel({
  robot,
  connection,
  route,
  realtimeSession,
  realtimeSessionState,
  localDevPreflight,
  localDevBridge,
  realtimeOutput,
  readiness,
  onConnectionMode,
  onAdapterTest,
  onAdapterDisconnect
}) {
  const view = buildRobotConnectionStatusViewModel({
    robot,
    connection,
    route,
    realtimeSession,
    realtimeSessionState,
    localDevPreflight,
    localDevBridge,
    realtimeOutput,
    readiness
  });

  return (
    <section className={`panel robot-connection-panel robot-connection-panel-${readiness.overallTone}`}>
      <div className="panel-header">
        <div>
          <h2>机器人连接状态</h2>
          <p className="muted">日常使用视图，只展示 Runtime 已知状态，不主动轮询。</p>
        </div>
        <span className={`tag robot-connection-tag robot-connection-tag-${readiness.overallTone}`}>{view.statusLabel}</span>
      </div>

      <div className="robot-connection-summary">
        {view.summary.map((item) => (
          <div key={item.key}>
            <small>{item.label}</small>
            <strong>{item.value}</strong>
            <span>{item.detail}</span>
          </div>
        ))}
      </div>

      <div className="robot-connection-mode-picker" aria-label="选择连接方式">
        {view.modeOptions.map((option) => (
          <button
            key={option.key}
            type="button"
            className={robot?.mode === option.key ? 'active' : ''}
            onClick={() => onConnectionMode?.(option.key, option.label)}
            title={option.description}
          >
            <strong>{option.label}</strong>
            <small>{option.description}</small>
          </button>
        ))}
      </div>

      <div className="robot-connection-actions">
        <button
          type="button"
          onClick={onAdapterTest}
          disabled={view.adapterTestButton.disabled}
          title={view.adapterTestButton.title}
        >
          {view.adapterTestButton.label}
        </button>
        <button
          type="button"
          className="secondary"
          onClick={onAdapterDisconnect}
          disabled={view.disconnectButton.disabled}
          title={view.disconnectButton.title}
        >
          {view.disconnectButton.label}
        </button>
        <span title={view.preflightDetail}>{view.preflightLabel}</span>
      </div>

      <NextAction action={readiness.nextAction} onConnectionMode={onConnectionMode} onAdapterTest={onAdapterTest} />

      <div className="robot-connection-health">
        {view.healthRows.map((row) => (
          <HealthRow key={row.key} tone={row.tone} label={row.label} value={row.value} detail={row.detail} />
        ))}
      </div>

      <div className={`robot-call-checklist robot-call-checklist-${readiness.checklist.tone}`}>
        <div className="robot-call-checklist-header">
          <div>
            <small>实时通话准备度</small>
            <strong>{readiness.checklist.label}</strong>
          </div>
          <span>{readiness.checklist.blockedCount} blocked / {readiness.checklist.warningCount} warning</span>
        </div>
        <div className="robot-call-checklist-grid">
          {readiness.checklist.items.map((item) => (
            <ChecklistItem key={item.key} tone={item.tone} label={item.label} detail={item.detail} />
          ))}
        </div>
      </div>

      {view.flowAlert && (
        <div className={`robot-connection-flow-alert ${view.flowAlert.tone}`}>
          <strong>{view.flowAlert.title}</strong>
          <p>{view.flowAlert.detail}</p>
          {view.flowAlert.lastAck ? <span>{view.flowAlert.lastAck}</span> : null}
        </div>
      )}

      <div className="robot-connection-foot">
        {view.footerItems.map((item) => <span key={item}>{item}</span>)}
      </div>
      <div className="robot-realtime-policy">
        <small>{view.realtimePolicy.label}</small>
        <strong>{view.realtimePolicy.title}</strong>
        <p>{view.realtimePolicy.detail}</p>
      </div>
      <div className="robot-connection-diagnostics">
        <small>Adapter endpoint</small>
        <strong>{readiness.endpoint || '-'}</strong>
        <p>{readiness.diagnosticsText}</p>
      </div>
      <p className="robot-connection-note">{readiness.modelServiceDetail}</p>
    </section>
  );
}
