export default function VisibleContext({ robot, recentEvents, cameraStatus, framePolicy, connection, realtimeSession, realtimeRoute, mediaChannels }) {
  const cloudMode = robot.mode === 'wifi_cloud' || robot.mode === 'cellular_cloud' || robot.mode === 'self_hosted_cloud';
  return (
    <section className="panel context-panel">
      <div className="panel-header">
        <h2>机器人可见信息</h2>
        <span className="tag">透明面板</span>
      </div>
      <div className="context-grid">
        <div className="context-box ok">
          <h3>当前能看到</h3>
          <ul>
            <li>麦克风原始音频流：{realtimeSession?.active ? '已开启实时通道' : '未开启'}</li>
            <li>实时音频路由：{realtimeRoute?.route}</li>
            <li>音频媒体帧：omni.audio_frame.v1 · observed {mediaChannels?.audio?.observed || 0} · sent {mediaChannels?.audio?.sent || 0} · bytes {mediaChannels?.audio?.lastFrame?.media?.byteLength || 0}</li>
            <li>摄像头画面：{cameraStatus?.cameraActive ? '已开启，可实时预览' : '未开启'}</li>
            <li>摄像头关键帧：{framePolicy?.label || cameraStatus?.cameraPolicy || robot.cameraPolicy}</li>
            <li>视觉媒体帧：omni.camera_frame.v1 · observed {mediaChannels?.camera?.observed || 0} · sent {mediaChannels?.camera?.sent || 0} · bytes {mediaChannels?.camera?.lastFrame?.media?.byteLength || 0} · payload {mediaChannels?.camera?.lastFrame?.media?.payloadIncluded ? 'yes' : 'no'}</li>
            <li>当前网络：{connection?.label} · {connection?.status}</li>
            <li>当前角色：{robot.role}</li>
            <li>当前 Model Adapter：{robot.adapter}</li>
            <li>Adapter Endpoint：{robot.adapterDetail?.endpoint}</li>
            <li>当前启用插件、动作序列和代码插件声明</li>
            <li>最近触摸/NFC 事实事件</li>
            <li>当前表情：{robot.expression}</li>
            <li>最近关键帧时间：{cameraStatus?.lastFrameAt || '未采集'}</li>
          </ul>
        </div>
        <div className="context-box warn">
          <h3>当前不能看到</h3>
          <ul>
            <li>用户本地文件</li>
            <li>真实邮箱内容</li>
            <li>真实空调设备，当前为 Mock 动作</li>
            <li>长期复杂记忆，当前仅架构预留</li>
            <li>真实机器人硬件摄像头，当前使用浏览器摄像头模拟</li>
            <li>前端生成的“视觉情绪摘要”，v0.9 不采用这种输入</li>
            <li>ASR 文本不会作为主输入替代原始音频流</li>
            <li>前端不会把关键帧转换成情绪标签再发给模型</li>
          </ul>
        </div>
      </div>
      <div className="cloud-note">
        <strong>当前运行模式：</strong>{robot.mode}
        <p>{cloudMode ? `${robot.adapter}：语音/关键帧上传需要用户授权，蜂窝模式会降低关键帧频率。` : '本地调试/离线模式：当前不上传公网云端。'}</p>
      </div>
      <div className="cloud-note adapter-note">
        <strong>Adapter 输入：</strong>{robot.adapterDetail?.input}
        <p>{robot.adapterDetail?.transport} · {robot.adapterDetail?.upload}</p>
        <p>能力声明：{robot.adapterDetail?.capabilities?.join(' / ')}</p>
      </div>
      <div className="cloud-note adapter-note">
        <strong>Runtime 路由：</strong>{realtimeRoute?.label}
        <p>{realtimeRoute?.detail}</p>
        <p>FramePolicy：{framePolicy?.cadence} · {framePolicy?.upload} · {framePolicy?.captureWidth}px</p>
      </div>
      <div className="cloud-note adapter-note">
        <strong>媒体通道：</strong>{mediaChannels?.protocol || 'omni.media_channel.v1'}
        <p>Audio sent/observed：{mediaChannels?.audio?.sent || 0}/{mediaChannels?.audio?.observed || 0}；最近音频 bytes：{mediaChannels?.audio?.lastFrame?.media?.byteLength || 0}；payload：{mediaChannels?.audio?.lastFrame?.media?.payloadIncluded ? 'yes' : 'no'}；Camera sent/observed：{mediaChannels?.camera?.sent || 0}/{mediaChannels?.camera?.observed || 0}；最近视觉 bytes：{mediaChannels?.camera?.lastFrame?.media?.byteLength || 0}；payload：{mediaChannels?.camera?.lastFrame?.media?.payloadIncluded ? 'yes' : 'no'}</p>
        <p>LocalDev ACK：{mediaChannels?.localDev?.ackCount || 0} · {mediaChannels?.localDev?.lastFrameSchema || '暂无媒体帧确认'}</p>
      </div>
      <h3>最近事实事件</h3>
      <div className="event-stack">
        {recentEvents.length === 0 ? <p className="muted">暂无事件。</p> : recentEvents.slice(0, 6).map((event) => (
          <div className="event-pill" key={event.id}>{event.type} · {event.label || event.intent || event.area || event.tagId || 'event'}</div>
        ))}
      </div>
    </section>
  );
}
