import { useEffect, useState } from 'react';
import { VOICE_STYLE_OPTIONS } from '../runtime/robotProfile';

const ROLE_OPTIONS = [
  { key: 'companion', label: '陪伴模式' },
  { key: 'study_assistant', label: '学习助手' },
  { key: 'developer_helper', label: '开发助手' },
  { key: 'quiet_pet', label: '安静宠物' }
];

export default function RobotProfilePanel({ profile, onSave, onReset }) {
  const [draft, setDraft] = useState(profile);

  useEffect(() => {
    setDraft(profile);
  }, [profile]);

  function updateField(key, value) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function submit(event) {
    event.preventDefault();
    onSave?.(draft);
  }

  return (
    <section className="panel robot-profile-panel">
      <div className="panel-header">
        <div>
          <h2>机器人身份档案</h2>
          <p className="muted">用户可以给机器人命名，但内部绑定、权限和日志仍使用稳定 robot_id。</p>
        </div>
        <span className="tag">profile</span>
      </div>

      <form className="profile-form" onSubmit={submit}>
        <label>
          昵称 display_name
          <input
            value={draft?.displayName || ''}
            maxLength={24}
            placeholder="例如 CloudGenie"
            onChange={(event) => updateField('displayName', event.target.value)}
          />
        </label>
        <label>
          唤醒/称呼名 wake_name
          <input
            value={draft?.wakeName || ''}
            maxLength={24}
            placeholder="例如 小云"
            onChange={(event) => updateField('wakeName', event.target.value)}
          />
        </label>
        <label>
          机器人称呼用户
          <input
            value={draft?.ownerCalling || ''}
            maxLength={24}
            placeholder="例如 主人 / 宇哲"
            onChange={(event) => updateField('ownerCalling', event.target.value)}
          />
        </label>
        <label>
          默认角色
          <select value={draft?.defaultRole || 'companion'} onChange={(event) => updateField('defaultRole', event.target.value)}>
            {ROLE_OPTIONS.map((role) => <option key={role.key} value={role.key}>{role.label}</option>)}
          </select>
        </label>
        <label>
          声音风格
          <select value={draft?.voiceStyle || 'warm_young'} onChange={(event) => updateField('voiceStyle', event.target.value)}>
            {VOICE_STYLE_OPTIONS.map((voice) => <option key={voice.key} value={voice.key}>{voice.label}</option>)}
          </select>
        </label>
        <label>
          性格提示
          <textarea
            value={draft?.personality || ''}
            maxLength={160}
            onChange={(event) => updateField('personality', event.target.value)}
          />
        </label>
        <div className="profile-actions">
          <button type="submit">保存身份档案</button>
          <button type="button" className="secondary-builder-button" onClick={onReset}>重置</button>
        </div>
      </form>
      <div className="profile-identity-note">
        <small>robot_id</small>
        <strong>{profile?.robotId}</strong>
        <p>后期这里会接 Robot Registry，同步到云端账号、实体本体和 App。</p>
      </div>
    </section>
  );
}
