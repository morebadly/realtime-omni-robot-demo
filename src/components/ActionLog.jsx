export default function ActionLog({ logs }) {
  return (
    <section className="panel log-panel">
      <div className="panel-header">
        <h2>行为日志</h2>
        <span className="tag">audit trail</span>
      </div>
      <div className="logs">
        {logs.map((log) => (
          <div className={`log-row ${log.level}`} key={log.id}>
            <span>{log.time}</span>
            <strong>{log.message}</strong>
            {log.detail && <small>{log.detail}</small>}
          </div>
        ))}
      </div>
    </section>
  );
}
