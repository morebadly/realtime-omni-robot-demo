import './RobotFace.css';

const labelMap = {
  idle: 'idle',
  listening: 'listening',
  thinking: 'thinking',
  speaking: 'speaking',
  happy: 'happy',
  annoyed: 'annoyed',
  angry: 'angry',
  sad: 'sad',
  shy: 'shy',
  sleepy: 'sleepy',
  surprised: 'surprised',
  error: 'error',
  idle_eyes: 'idle_eyes',
  happy_eyes: 'happy_eyes',
  soft_worried_eyes: 'soft_worried_eyes',
  sleepy_eyes: 'sleepy_eyes',
  sleeping_eyes: 'sleeping_eyes',
  curious_eyes: 'curious_eyes',
  comforted_eyes: 'comforted_eyes',
  lonely_eyes: 'lonely_eyes',
  hungry_eyes: 'hungry_eyes',
  low_battery_eyes: 'low_battery_eyes',
  sick_eyes: 'sick_eyes',
  focused_eyes: 'focused_eyes',
  privacy_closed_eyes: 'privacy_closed_eyes'
};

const iconMap = {
  none: '',
  water: '水',
  leaf: '叶',
  stretch: '伸',
  food: '饭',
  sleep_hat: '睡',
  privacy_eye_closed: '闭'
};

export default function RobotFace({ expression = 'idle', state = 'idle', speaking = false, icon = 'none' }) {
  const faceClass = `robot-face ${expression} ${speaking || state === 'speaking' ? 'is-speaking' : ''}`;
  const iconLabel = iconMap[icon] || '';

  return (
    <div className="face-shell">
      <div className={faceClass}>
        <div className="screen-glow" />
        <div className="corner-light left" />
        <div className="corner-light right" />
        <div className="eyes">
          <div className="eye left-eye" />
          <div className="eye right-eye" />
        </div>
        <div className="listen-wave left-wave" />
        <div className="listen-wave right-wave" />
        <div className="thought-dots">
          <span />
          <span />
          <span />
        </div>
        <div className="mouth" />
        <div className="symbol anger">!</div>
        <div className="symbol sparkle">*</div>
        <div className="symbol zzz">Z</div>
        <div className={`pet-icon pet-icon-${icon}`}>{iconLabel}</div>
        <div className="symbol blush left-blush" />
        <div className="symbol blush right-blush" />
      </div>
      <div className="face-status">
        <span className="pulse-dot" />
        <span>{labelMap[expression] || expression}</span>
        <small>{state}</small>
      </div>
    </div>
  );
}
