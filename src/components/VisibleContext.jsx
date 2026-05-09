export default function VisibleContext({ robot, recentEvents, cameraStatus, framePolicy, connection, realtimeSession, realtimeRoute, mediaChannels, realtimeOutput }) {
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
            <li>Omni 输出状态：{realtimeOutput?.state || 'idle'} · playback {realtimeOutput?.playbackActive ? 'playing' : 'idle'} · interrupted {realtimeOutput?.interruptCount || 0}</li>
            <li>输出音频帧：omni.reply_audio_frame.v1 · received {realtimeOutput?.receivedAudioFrames || 0} · played {realtimeOutput?.playedAudioFrames || 0} · queued {realtimeOutput?.queuedAudioFrames?.length || 0}</li>
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
            <li>reply_text 不会进入 TTS 管线；它只用于字幕、日志和调试</li>
            <li>麦克风 audio_frame 不会自动触发 barge-in；用户插话必须通过 omni.interrupt.v1 显式表达</li>
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

      <div className="cloud-note adapter-note">
        <strong>实时输出通道：</strong>{realtimeOutput?.protocol || 'omni.realtime_output.v1'}
        <p>state：{realtimeOutput?.state || 'idle'}；turn：{realtimeOutput?.turnId || '暂无'}；last_frame：{realtimeOutput?.lastFrameId || '暂无'}；final：{realtimeOutput?.finalFrameReceived ? 'yes' : 'no'}</p>
        <p>Reply audio frames received/played/queued：{realtimeOutput?.receivedAudioFrames || 0}/{realtimeOutput?.playedAudioFrames || 0}/{realtimeOutput?.queuedAudioFrames?.length || 0}。这是 Omni 服务端输出媒体帧，不是 TTS 结果。</p>
        <p>Interrupt：count={realtimeOutput?.interruptCount || 0}；last_reason={realtimeOutput?.lastInterrupt?.reason || 'none'}。v1.1.2 只做手动 barge-in Mock，不做自动声音打断，避免机器人自己的播放声音被麦克风采回后自我打断。</p>
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
