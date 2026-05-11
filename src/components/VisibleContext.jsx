import { summarizeRealtimeSessionState } from '../runtime/realtimeSessionState';

function StatusTile({ label, value, detail }) {
  return (
    <div className="context-status-tile">
      <small>{label}</small>
      <strong>{value}</strong>
      {detail && <p>{detail}</p>}
    </div>
  );
}

export default function VisibleContext({ robot, recentEvents, cameraStatus, framePolicy, connection, realtimeSession, realtimeRoute, mediaChannels, realtimeOutput, realtimeSessionState, providerGate, providerHealth, providerHandshake, providerAudioGate }) {
  const cloudMode = robot.mode === 'wifi_cloud' || robot.mode === 'cellular_cloud' || robot.mode === 'self_hosted_cloud';
  const audioObserved = mediaChannels?.audio?.observed || 0;
  const audioSent = mediaChannels?.audio?.sent || 0;
  const cameraObserved = mediaChannels?.camera?.observed || 0;
  const cameraSent = mediaChannels?.camera?.sent || 0;
  const outputReceived = realtimeOutput?.receivedAudioFrames || 0;
  const outputPlayed = realtimeOutput?.playedAudioFrames || 0;

  return (
    <section className="panel context-panel compact-context-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Visible Context</p>
          <h2>机器人可见信息</h2>
        </div>
        <span className="tag">透明面板</span>
      </div>

      <div className="context-status-grid">
        <StatusTile
          label="输入音频"
          value={`${audioSent}/${audioObserved}`}
          detail={`mic=${realtimeSession?.active ? 'open' : 'closed'} · route=${realtimeRoute?.route || 'none'}`}
        />
        <StatusTile
          label="摄像头帧"
          value={`${cameraSent}/${cameraObserved}`}
          detail={`${cameraStatus?.cameraActive ? 'camera on' : 'camera off'} · ${framePolicy?.cadence || 'idle'}`}
        />
        <StatusTile
          label="输出音频"
          value={`${outputReceived}/${outputPlayed}`}
          detail={`state=${realtimeOutput?.state || 'idle'} · playback=${realtimeOutput?.playbackActive ? 'playing' : 'idle'}`}
        />
        <StatusTile
          label="状态机"
          value={realtimeSessionState?.state || 'idle'}
          detail={summarizeRealtimeSessionState(realtimeSessionState)}
        />
        <StatusTile
          label="Provider Gate"
          value={providerGate?.status || 'mock_ready'}
          detail={`${providerGate?.providerId || 'localdev_mock'} / ${providerGate?.mode || 'mock'}`}
        />
        <StatusTile
          label="Provider Health"
          value={providerHealth?.status || 'mock_ready'}
          detail={`audio=${providerHealth?.canSendAudio ? 'yes' : 'no'} / camera=${providerHealth?.canSendCamera ? 'yes' : 'no'} / billing=${providerHealth?.canStartBillingSession ? 'yes' : 'no'}`}
        />
        <StatusTile
          label="Handshake"
          value={providerHandshake?.status || 'blocked'}
          detail={`socket=${providerHandshake?.canOpenRealtimeSocket ? 'yes' : 'no'} / fallback=${providerHandshake?.fallbackProviderId || 'localdev_mock'}`}
        />
        <StatusTile
          label="Audio Dry-run"
          value={providerAudioGate?.status || 'blocked'}
          detail={`real_audio=${providerAudioGate?.canSendRealAudio ? 'yes' : 'no'} / dry_run=${providerAudioGate?.canSendDryRunAudioPayload ? 'yes' : 'no'}`}
        />
      </div>

      <details className="context-details" open>
        <summary>当前能看到 / 正在进入 Runtime 的信息</summary>
        <ul>
          <li>麦克风原始音频流：{realtimeSession?.active ? '已开启实时通道' : '未开启'}。</li>
          <li>音频媒体帧：omni.audio_frame.v1 · observed {audioObserved} · sent {audioSent} · bytes {mediaChannels?.audio?.lastFrame?.media?.byteLength || 0}。</li>
          <li>摄像头画面：{cameraStatus?.cameraActive ? '已开启，可实时预览' : '未开启'}。</li>
          <li>视觉媒体帧：omni.camera_frame.v1 · observed {cameraObserved} · sent {cameraSent} · payload {mediaChannels?.camera?.lastFrame?.media?.payloadIncluded ? 'yes' : 'no'}。</li>
          <li>网络与路由：{connection?.label} · {connection?.status} · {realtimeRoute?.label}。</li>
          <li>当前角色 / 表情 / Adapter：{robot.role} · {robot.expression} · {robot.adapter}。</li>
          <li>插件声明、权限状态、最近触摸/NFC 事实事件。</li>
        </ul>
      </details>

      <details className="context-details">
        <summary>当前不能看到 / 安全边界</summary>
        <ul>
          <li>看不到用户本地文件、真实邮箱内容、真实空调设备或真实机器人硬件。</li>
          <li>当前空调、邮件、动作都是 Mock，不会调用真实外部服务。</li>
          <li>ASR 文本不会作为主输入替代原始音频流。</li>
          <li>reply_text 不会进入 TTS 管线；它只用于字幕、日志和调试。</li>
          <li>麦克风 audio_frame 不会自动触发 barge-in；用户插话必须通过 omni.interrupt.v1 显式表达。</li>
          <li>状态机不会把 reply_audio_frame 回流成用户输入，也不会让 Omni 自己打断自己。</li>
          <li>前端不会把关键帧转换成用户情绪标签再发给模型。</li>
        </ul>
      </details>

      <details className="context-details">
        <summary>Runtime 路由、媒体通道与输出通道详情</summary>
        <div className="context-detail-grid">
          <div>
            <strong>运行模式</strong>
            <p>{robot.mode} · {cloudMode ? `${robot.adapter}：语音/关键帧上传需要用户授权。` : '本地调试/离线模式：当前不上传公网云端。'}</p>
          </div>
          <div>
            <strong>Adapter 输入</strong>
            <p>{robot.adapterDetail?.input} · {robot.adapterDetail?.transport} · {robot.adapterDetail?.upload}</p>
          </div>
          <div>
            <strong>媒体通道</strong>
            <p>Audio sent/observed：{audioSent}/{audioObserved}；Camera sent/observed：{cameraSent}/{cameraObserved}；LocalDev ACK：{mediaChannels?.localDev?.ackCount || 0}。</p>
          </div>
          <div>
            <strong>实时输出通道</strong>
            <p>{realtimeOutput?.protocol || 'omni.realtime_output.v1'}；turn：{realtimeOutput?.turnId || '暂无'}；last_frame：{realtimeOutput?.lastFrameId || '暂无'}；final：{realtimeOutput?.finalFrameReceived ? 'yes' : 'no'}。</p>
          </div>
          <div>
            <strong>Interrupt</strong>
            <p>count={realtimeOutput?.interruptCount || 0}；last_reason={realtimeOutput?.lastInterrupt?.reason || 'none'}。当前只做手动 barge-in Mock，不做自动声音打断。</p>
          </div>
          <div>
            <strong>状态机 Guardrails</strong>
            <p>keep_mic_during_output={realtimeSessionState?.shouldKeepMicOpen ? 'yes' : 'no'}；explicit_interrupt_only={realtimeSessionState?.explicitInterruptOnly ? 'yes' : 'no'}；can_interrupt={realtimeSessionState?.canInterruptOutput ? 'yes' : 'no'}。</p>
          </div>
        </div>
      </details>

      <h3>最近事实事件</h3>
      <div className="event-stack">
        {recentEvents.length === 0 ? <p className="muted">暂无事件。</p> : recentEvents.slice(0, 6).map((event) => (
          <div className="event-pill" key={event.id}>{event.type} · {event.label || event.intent || event.area || event.tagId || 'event'}</div>
        ))}
      </div>
    </section>
  );
}
