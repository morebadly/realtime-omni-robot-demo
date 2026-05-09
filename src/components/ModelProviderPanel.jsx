import { useEffect, useMemo, useState } from 'react';
import { MODEL_ADAPTERS } from '../runtime/modelAdapters';

const CAPABILITY_OPTIONS = [
  { key: 'audio_in', label: '原始音频输入' },
  { key: 'audio_out', label: '语音输出' },
  { key: 'image_frame', label: '摄像头关键帧' },
  { key: 'low_rate_image_frame', label: '蜂窝低频关键帧' },
  { key: 'video_frame', label: '视频帧' },
  { key: 'tool_intent', label: '工具/插件意图' },
  { key: 'interrupt', label: '实时打断' },
  { key: 'touch_event', label: '触摸事实事件' },
  { key: 'nfc_event', label: 'NFC 事实事件' },
  { key: 'preset_expression', label: '预设表情' },
  { key: 'preset_motion', label: '预设动作' }
];

export default function ModelProviderPanel({ activeMode, profiles, onUpdate, onReset, onTest }) {
  const [selectedKey, setSelectedKey] = useState(activeMode || 'local_dev');
  const selectedProfile = useMemo(() => profiles?.[selectedKey] || MODEL_ADAPTERS.find((item) => item.key === selectedKey), [profiles, selectedKey]);
  const [draft, setDraft] = useState(selectedProfile);

  useEffect(() => {
    setSelectedKey(activeMode || 'local_dev');
  }, [activeMode]);

  useEffect(() => {
    setDraft(selectedProfile);
  }, [selectedProfile]);

  function updateField(key, value) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function toggleCapability(key) {
    setDraft((prev) => {
      const current = new Set(prev.capabilities || []);
      if (current.has(key)) current.delete(key);
      else current.add(key);
      return { ...prev, capabilities: [...current] };
    });
  }

  function save() {
    onUpdate?.(selectedKey, draft);
  }

  return (
    <section className="panel model-provider-panel">
      <div className="panel-header">
        <div>
          <h2>模型接入中心</h2>
          <p className="muted">v0.8：Adapter 配置会保存到浏览器本地，后期可接 Robot Registry / 云端租户配置。</p>
        </div>
        <span className="tag">Model Adapter Registry</span>
      </div>

      <label className="field-stack">
        选择 Adapter
        <select value={selectedKey} onChange={(event) => setSelectedKey(event.target.value)}>
          {MODEL_ADAPTERS.map((adapter) => (
            <option key={adapter.key} value={adapter.key}>{adapter.name} · {adapter.mode}</option>
          ))}
        </select>
      </label>

      <div className="provider-grid">
        <label>
          Provider 名称
          <input disabled={!draft?.editable} value={draft?.providerLabel || ''} onChange={(event) => updateField('providerLabel', event.target.value)} />
        </label>
        <label>
          Model ID
          <input disabled={!draft?.editable} value={draft?.modelId || ''} onChange={(event) => updateField('modelId', event.target.value)} />
        </label>
        <label className="wide-field">
          Endpoint / Realtime 地址
          <input disabled={!draft?.editable} value={draft?.endpoint || ''} onChange={(event) => updateField('endpoint', event.target.value)} />
        </label>
        <label>
          API Key（Demo 不持久化，仅当前页面状态）
          <input disabled={!draft?.editable} type="password" value={draft?.apiKey || ''} onChange={(event) => updateField('apiKey', event.target.value)} placeholder="开发 Demo 可留空" />
        </label>
        <label>
          Transport
          <input disabled={!draft?.editable} value={draft?.transport || ''} onChange={(event) => updateField('transport', event.target.value)} />
        </label>
      </div>

      <div className="capability-box">
        <strong>能力声明</strong>
        <div className="capability-grid">
          {CAPABILITY_OPTIONS.map((capability) => (
            <button
              key={capability.key}
              type="button"
              disabled={!draft?.editable}
              className={draft?.capabilities?.includes(capability.key) ? 'capability-chip active' : 'capability-chip'}
              onClick={() => toggleCapability(capability.key)}
            >
              {capability.label}
            </button>
          ))}
        </div>
      </div>

      <div className="provider-note">
        <strong>当前输入策略：</strong>{draft?.input}
        <p>{draft?.upload}</p>
      </div>

      <div className="provider-actions">
        <button onClick={save} disabled={!draft?.editable}>保存 Adapter 配置</button>
        <button className="secondary-provider-button" onClick={() => onTest?.(selectedKey, draft)}>测试连接（Mock）</button>
        <button className="secondary-provider-button" onClick={onReset}>重置配置</button>
      </div>
    </section>
  );
}
