export default function RobotRegistryPanel({ robots, activeRobotId, onSelect, onAdd, onDelete }) {
  return (
    <section className="panel robot-registry-panel">
      <div className="panel-header">
        <div>
          <h2>Robot Registry</h2>
          <p className="muted">一个 Web/App 控制台可以管理多个机器人实例；真正绑定靠稳定 robot_id，不靠昵称。</p>
        </div>
        <span className="tag">{robots.length} robots</span>
      </div>

      <div className="registry-list">
        {robots.map((item) => {
          const isActive = item.robotId === activeRobotId;
          const canDelete = robots.length > 1;
          return (
            <div
              key={item.robotId}
              className={isActive ? 'registry-card active' : 'registry-card'}
              role="button"
              tabIndex={0}
              onClick={() => onSelect(item.robotId)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onSelect(item.robotId);
                }
              }}
            >
              <div className="registry-card-top">
                <div>
                  <strong>{item.displayName}</strong>
                  <button
                    type="button"
                    className="registry-id-button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelect(item.robotId);
                    }}
                    title="进入这台机器人的专属调控界面"
                  >
                    {item.robotId}
                  </button>
                </div>
                <div className="registry-card-actions">
                  <em className={item.online ? 'online' : 'offline'}>{item.online ? 'online' : 'offline'}</em>
                  <button
                    type="button"
                    className="registry-delete-button"
                    disabled={!canDelete}
                    title={canDelete ? '删除这个机器人实例' : '至少保留一个机器人实例'}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (!canDelete) return;
                      const ok = window.confirm(`确定删除「${item.displayName}」吗？\n\n会移除这个 robot_id 的本地身份档案和当前 Demo 注册信息。`);
                      if (ok) onDelete(item.robotId);
                    }}
                  >
                    删除
                  </button>
                </div>
              </div>
              <div className="registry-meta-grid">
                <span>{item.location}</span>
                <span>{item.mode}</span>
                <span>{item.network}</span>
                <span>{item.expression}</span>
              </div>
              <p>{item.note}</p>
            </div>
          );
        })}
      </div>

      <button className="registry-add-button" onClick={onAdd}>新增机器人占位</button>
      <p className="registry-note">删除只是移除当前 Demo 的本地注册占位；成熟产品里会由云端 Robot Registry 处理解绑、转让、设备证书吊销和数据保留策略。</p>
    </section>
  );
}
