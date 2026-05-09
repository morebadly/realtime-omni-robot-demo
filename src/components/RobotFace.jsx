import './RobotFace.css';

const labelMap = {
  idle: '待机',
  listening: '正在听',
  thinking: '思考',
  speaking: '说话',
  happy: '开心',
  annoyed: '傲娇',
  angry: '生气',
  sad: '难过',
  shy: '害羞',
  sleepy: '困倦',
  surprised: '惊讶',
  error: '故障'
};

export default function RobotFace({ expression = 'idle', state = 'idle', speaking = false }) {
  const faceClass = `robot-face ${expression} ${speaking || state === 'speaking' ? 'is-speaking' : ''}`;

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
        <div className="symbol anger">╬</div>
        <div className="symbol sparkle">✦</div>
        <div className="symbol zzz">Z</div>
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
