const statusLabel = {
  enabled: '允许',
  disabled: '关闭',
  confirm_required: '需确认',
  mock_only: '仅模拟'
};

const nextStatus = {
  enabled: 'disabled',
  disabled: 'mock_only',
  mock_only: 'confirm_required',
  confirm_required: 'enabled'
};

export default function PermissionPanel({ permissions, onChange }) {
  const groups = permissions.reduce((acc, permission) => {
    acc[permission.group] = acc[permission.group] || [];
    acc[permission.group].push(permission);
    return acc;
  }, {});

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>权限中心</h2>
        <span className="tag">runtime guard</span>
      </div>
      {Object.entries(groups).map(([group, items]) => (
        <div className="permission-group" key={group}>
          <h3>{group}</h3>
          {items.map((item) => (
            <button
              className={`permission-row ${item.status}`}
              key={item.key}
              onClick={() => onChange(item.key, nextStatus[item.status] || 'enabled')}
            >
              <span>
                <strong>{item.label}</strong>
                <small>{item.key}</small>
              </span>
              <em>{statusLabel[item.status] || item.status}</em>
            </button>
          ))}
        </div>
      ))}
    </section>
  );
}
