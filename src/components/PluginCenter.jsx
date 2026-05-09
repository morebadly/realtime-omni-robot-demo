import { useState } from 'react';
import { ACTION_LIBRARY, TRIGGER_LIBRARY, actionLabel, collectActionPermissions } from '../runtime/actionLibrary';
import { defaultCodePluginSource } from '../runtime/codePluginSandbox';
import { createPluginManifest } from '../runtime/pluginManifest';

function createPluginDraft() {
  return {
    name: '摸头后开心回应',
    trigger: 'touch.event:head:tap',
    selectedAction: 'robot.expression:happy',
    actions: ['robot.expression:happy', 'robot.say:嘿嘿，摸头好舒服呀。', 'robot.motion:tail_wag']
  };
}

function createCodeDraft() {
  return {
    name: '代码插件：摸头回应',
    trigger: 'touch.event:head:tap',
    permissions: ['plugin.run', 'touch.read', 'robot.expression.write', 'voice.output', 'robot.motion.write'],
    sourceCode: defaultCodePluginSource()
  };
}

function moveItem(list, index, direction) {
  const next = [...list];
  const target = index + direction;
  if (target < 0 || target >= next.length) return next;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

const PLUGIN_TABS = [
  { id: 'installed', label: '已安装插件', desc: '启用、测试、删除' },
  { id: 'template', label: '新增无代码插件', desc: 'Trigger + 动作序列' },
  { id: 'code', label: '新增代码插件', desc: '只返回 action intents' },
  { id: 'library', label: '动作库', desc: 'Tool Engine 能力' }
];

export default function PluginCenter({ plugins, onToggle, onRun, onAdd, onDelete }) {
  const [activeTab, setActiveTab] = useState('installed');
  const [draft, setDraft] = useState(createPluginDraft());
  const [codeDraft, setCodeDraft] = useState(createCodeDraft());
  const permissionOptions = [...new Set(ACTION_LIBRARY.map((item) => item.permission).concat(['touch.read', 'nfc.read', 'plugin.run']))];
  const enabledPlugins = plugins.filter((plugin) => plugin.enabled).length;
  const codePlugins = plugins.filter((plugin) => plugin.runtime === 'code_sandbox').length;

  function addAction() {
    if (!draft.selectedAction || draft.actions.includes(draft.selectedAction)) return;
    setDraft((prev) => ({ ...prev, actions: [...prev.actions, prev.selectedAction] }));
  }

  function removeAction(action) {
    setDraft((prev) => ({ ...prev, actions: prev.actions.filter((item) => item !== action) }));
  }

  function moveAction(index, direction) {
    setDraft((prev) => ({ ...prev, actions: moveItem(prev.actions, index, direction) }));
  }

  function submitPlugin(event) {
    event.preventDefault();
    const actions = draft.actions.length > 0 ? draft.actions : [draft.selectedAction];
    onAdd?.({
      id: `custom_${Date.now()}`,
      name: draft.name.trim() || '未命名插件',
      enabled: true,
      trigger: draft.trigger,
      permissions: collectActionPermissions(actions),
      actions,
      runtime: 'template_orchestration'
    });
    setDraft(createPluginDraft());
    setActiveTab('installed');
  }

  function toggleCodePermission(permission) {
    setCodeDraft((prev) => {
      const current = new Set(prev.permissions || []);
      if (current.has(permission)) current.delete(permission);
      else current.add(permission);
      return { ...prev, permissions: [...current] };
    });
  }

  function submitCodePlugin(event) {
    event.preventDefault();
    onAdd?.({
      id: `code_${Date.now()}`,
      name: codeDraft.name.trim() || '未命名代码插件',
      enabled: true,
      trigger: codeDraft.trigger,
      permissions: codeDraft.permissions,
      actions: [],
      runtime: 'code_sandbox',
      sourceCode: codeDraft.sourceCode,
      sandbox: {
        version: 'demo-worker-v1',
        timeoutMs: 900,
        network: 'blocked',
        directHardwareAccess: 'blocked'
      }
    });
    setCodeDraft(createCodeDraft());
    setActiveTab('installed');
  }

  return (
    <section className="panel plugin-panel plugin-workbench">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Plugin Workbench</p>
          <h2>插件中心</h2>
        </div>
        <span className="tag">Manifest + Runtime Guard</span>
      </div>
      <p className="muted">插件中心现在是独立工作台，并且内部用标签切换；主页面不再直接展开所有插件表单和 manifest。</p>

      <div className="plugin-center-summary">
        <div><small>已安装</small><strong>{plugins.length}</strong><p>{enabledPlugins} 个启用</p></div>
        <div><small>代码插件</small><strong>{codePlugins}</strong><p>Demo Worker 沙箱</p></div>
        <div><small>动作库</small><strong>{ACTION_LIBRARY.length}</strong><p>Tool Engine mock 能力</p></div>
        <div><small>权限守卫</small><strong>enabled</strong><p>插件执行前检查</p></div>
      </div>

      <div className="plugin-section-tabs" role="tablist" aria-label="插件中心标签">
        {PLUGIN_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={activeTab === tab.id ? 'active' : ''}
            onClick={() => setActiveTab(tab.id)}
          >
            <strong>{tab.label}</strong>
            <small>{tab.desc}</small>
          </button>
        ))}
      </div>

      {activeTab === 'library' && (
        <div className="plugin-tab-panel">
          <div className="tool-action-library compact-library">
            <div>
              <strong>插件动作库</strong>
              <small>这里替代原来的“工具入口”。Tool Engine 只负责执行，用户入口留在插件中心。</small>
            </div>
            <div className="tool-chip-row">
              {ACTION_LIBRARY.map((item) => (
                <span key={item.value}>{item.type} · {item.label}</span>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'template' && (
        <form className="plugin-builder orchestration-builder plugin-tab-panel" onSubmit={submitPlugin}>
          <div className="builder-title">
            <strong>新增无代码插件</strong>
            <small>支持多动作编排，例如：摸头 → 开心表情 + 说一句话 + 摇尾巴。</small>
          </div>
          <label>
            插件名称
            <input
              value={draft.name}
              onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
              placeholder="例如：摸头后开心回应"
            />
          </label>
          <label>
            触发器
            <select value={draft.trigger} onChange={(event) => setDraft((prev) => ({ ...prev, trigger: event.target.value }))}>
              {TRIGGER_LIBRARY.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          <label>
            添加动作
            <select value={draft.selectedAction} onChange={(event) => setDraft((prev) => ({ ...prev, selectedAction: event.target.value }))}>
              {ACTION_LIBRARY.map((item) => <option key={item.value} value={item.value}>{item.type} · {item.label}</option>)}
            </select>
          </label>
          <button className="secondary-builder-button" type="button" onClick={addAction}>加入序列</button>

          <div className="action-sequence">
            <strong>动作序列</strong>
            {draft.actions.length === 0 ? <p className="muted">还没有动作，至少加入一个动作。</p> : draft.actions.map((action, index) => (
              <div className="sequence-row" key={action}>
                <span>{index + 1}</span>
                <strong>{actionLabel(action)}</strong>
                <div>
                  <button type="button" onClick={() => moveAction(index, -1)} disabled={index === 0}>上移</button>
                  <button type="button" onClick={() => moveAction(index, 1)} disabled={index === draft.actions.length - 1}>下移</button>
                  <button type="button" className="danger-link" onClick={() => removeAction(action)}>移除</button>
                </div>
              </div>
            ))}
          </div>
          <button className="add-plugin-button" type="submit" disabled={draft.actions.length === 0}>添加插件</button>
        </form>
      )}

      {activeTab === 'code' && (
        <form className="code-plugin-builder plugin-tab-panel" onSubmit={submitCodePlugin}>
          <div className="builder-title">
            <strong>新增代码插件（Demo Worker 沙箱）</strong>
            <small>用户写 JS 函数体，只返回动作意图；Runtime 再做权限检查和 Tool Engine 执行。</small>
          </div>
          <div className="code-builder-grid">
            <label>
              插件名称
              <input value={codeDraft.name} onChange={(event) => setCodeDraft((prev) => ({ ...prev, name: event.target.value }))} />
            </label>
            <label>
              触发器
              <select value={codeDraft.trigger} onChange={(event) => setCodeDraft((prev) => ({ ...prev, trigger: event.target.value }))}>
                {TRIGGER_LIBRARY.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
          </div>
          <label className="code-editor-label">
            代码
            <textarea
              spellCheck="false"
              value={codeDraft.sourceCode}
              onChange={(event) => setCodeDraft((prev) => ({ ...prev, sourceCode: event.target.value }))}
            />
          </label>
          <div className="code-permissions">
            <strong>权限声明</strong>
            <div className="permission-chip-grid">
              {permissionOptions.map((permission) => (
                <button
                  key={permission}
                  type="button"
                  className={codeDraft.permissions.includes(permission) ? 'permission-chip active' : 'permission-chip'}
                  onClick={() => toggleCodePermission(permission)}
                >
                  {permission}
                </button>
              ))}
            </div>
          </div>
          <p className="sandbox-note">当前是浏览器 Demo 沙箱：使用 Web Worker、900ms 超时、阻断 DOM/直接硬件访问；正式产品还需要服务端/设备端更强隔离。</p>
          <button className="add-plugin-button" type="submit">添加代码插件</button>
        </form>
      )}

      {activeTab === 'installed' && (
        <div className="plugin-list plugin-tab-panel">
          {plugins.map((plugin) => (
            <article className="plugin-card" key={plugin.id}>
              <div className="plugin-card-top">
                <div>
                  <h3>{plugin.name}</h3>
                  <p>{plugin.trigger}</p>
                </div>
                <button className={plugin.enabled ? 'switch on' : 'switch'} onClick={() => onToggle(plugin.id)}>
                  {plugin.enabled ? '启用' : '关闭'}
                </button>
              </div>
              <details className="plugin-manifest-details">
                <summary>查看 manifest</summary>
                <div className="plugin-manifest-box">
                  <small>manifest</small>
                  <code>{JSON.stringify(plugin.manifest || createPluginManifest(plugin), null, 2)}</code>
                </div>
              </details>
              <div className="chip-row">
                {(plugin.permissions || []).map((permission) => <span key={permission}>{permission}</span>)}
              </div>
              {plugin.runtime === 'code_sandbox' ? (
                <details className="plugin-code-details">
                  <summary>查看代码插件源码</summary>
                  <pre className="code-plugin-preview">{plugin.sourceCode}</pre>
                </details>
              ) : (
                <div className="chip-row action-chip-row">
                  {plugin.actions.map((action, index) => <span key={`${plugin.id}_${action}_${index}`}>{index + 1}. {actionLabel(action)}</span>)}
                </div>
              )}
              <div className="plugin-actions">
                <small>runtime: {plugin.runtime}</small>
                <div className="plugin-action-buttons">
                  <button onClick={() => onRun(plugin.id)}>测试运行</button>
                  <button className="danger-button" onClick={() => onDelete(plugin.id)}>删除</button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
