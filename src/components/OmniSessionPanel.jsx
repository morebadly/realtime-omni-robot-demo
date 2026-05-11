import { summarizeOmniPacket } from '../runtime/omniPacket';
import { summarizeMediaChannels } from '../runtime/omniMediaFrames';
import { summarizeRealtimeOutputChannel } from '../runtime/realtimeOutputChannel';
import { summarizeRealtimeSessionState, getRealtimeSessionStateLabel } from '../runtime/realtimeSessionState';

function prettyJson(value) {
  if (!value) return '暂无';
  return JSON.stringify(value, null, 2);
}

const preflightLabels = {
  pending: '待首次检查',
  checking: '检查中',
  connected: '已连接',
  failed: '未连接',
  skipped: '已跳过'
};

const bridgeLabels = {
  idle: '未连接',
  connecting: '连接中',
  connected: '已保持连接',
  sending: '发送中',
  received: '已收到回合',
  failed: '连接失败',
  disconnected: '已断开',
  media_sending: '发送媒体帧',
  media_ack: '媒体帧已确认',
  output_state: '输出状态',
  reply_audio_frame: '收到输出音频帧',
  interrupt_sending: '发送打断',
  interrupt_sent: '已发送打断',
  interrupt_local_only: '本地打断'
};

function statusClass(status) {
  if (status === 'connected' || status === 'received' || status === 'media_ack' || status === 'reply_audio_frame' || status === 'interrupt_sent') return 'connected';
  if (status === 'connecting' || status === 'sending' || status === 'media_sending' || status === 'output_state' || status === 'interrupt_sending') return 'checking';
  if (status === 'failed') return 'failed';
  if (status === 'disconnected' || status === 'interrupt_local_only') return 'skipped';
  return 'pending';
}

export default function OmniSessionPanel({
  packet,
  turn,
  route,
  sessionStatus,
  localDevPreflight,
  localDevBridge,
  mediaChannels,
  realtimeOutput,
  realtimeSessionState,
  providerGate,
  providerHealth,
  providerHandshake,
  providerAudioGate,
  onBuild,
  onSimulate,
  onSendLocalDev,
  onDisconnectLocalDev,
  onInterrupt,
  onClear
}) {
  const busy = Boolean(sessionStatus?.busy);
  const preflightStatus = localDevPreflight?.status || 'pending';
  const bridgeStatus = localDevBridge?.status || 'idle';

  return (
    <section className="panel omni-session-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Omni Session Bridge</p>
          <h2>实时 Omni 双向会话预览</h2>
        </div>
        <span className={`tag ${route?.canStream ? 'connection-status-connected' : 'connection-status-degraded'}`}>{route?.route || 'not_connected'}</span>
      </div>

      <div className="omni-summary-grid">
        <div>
          <small>当前路由</small>
          <strong>{route?.label || '未连接'}</strong>
          <p>{route?.detail}</p>
        </div>
        <div>
          <small>输入包摘要</small>
          <strong>{packet ? packet.packetId : '未构建'}</strong>
          <p>{summarizeOmniPacket(packet)}</p>
        </div>
        <div>
          <small>最近模型回合</small>
          <strong>{turn ? turn.turnId : '暂无'}</strong>
          <p>{turn ? `${turn.expression?.expression} · ${turn.tool_intents?.length || 0} tool intents` : '可先构建输入包，再模拟 Omni 输出。reply_text 只作字幕/日志。'}</p>
        </div>
      </div>

      <div className={`localdev-preflight localdev-preflight-${preflightStatus}`}>
        <div>
          <small>LocalDev Adapter 首轮连接检查</small>
          <strong>{preflightLabels[preflightStatus] || preflightStatus}</strong>
          <p>{localDevPreflight?.detail || '首次发送到 LocalDev Adapter 时检查一次连接状态。'}</p>
        </div>
        <div>
          <small>endpoint</small>
          <strong>{localDevPreflight?.endpoint || '未配置'}</strong>
          <p>{localDevPreflight?.checkedAt ? `checked_at: ${localDevPreflight.checkedAt}` : '尚未执行首次对话检查'}</p>
        </div>
        {localDevPreflight?.error && (
          <div>
            <small>last_error</small>
            <strong>{localDevPreflight.error}</strong>
            <p>后续真实发送会继续更新连接结果，但不会额外增加预检请求。</p>
          </div>
        )}
      </div>

      <div className={`localdev-bridge localdev-bridge-${statusClass(bridgeStatus)}`}>
        <div>
          <small>LocalDev WebSocket 实时会话</small>
          <strong>{bridgeLabels[bridgeStatus] || bridgeStatus}</strong>
          <p>{localDevBridge?.detail || '发送到 LocalDev Adapter 后会建立并保持 WebSocket 调试会话。'}</p>
        </div>
        <div>
          <small>request / packet / turn</small>
          <strong>{localDevBridge?.requestId || '暂无 requestId'}</strong>
          <p>{localDevBridge?.lastPacketId ? `packet=${localDevBridge.lastPacketId}` : '尚未发送输入包'}{localDevBridge?.lastTurnId ? ` · turn=${localDevBridge.lastTurnId}` : ''}</p>
        </div>
        {localDevBridge?.error && (
          <div>
            <small>bridge_error</small>
            <strong>{localDevBridge.error}</strong>
            <p>请确认 `npm run mock:localdev` 或本地 Qwen-Omni 兼容 Adapter 正在运行。</p>
          </div>
        )}
      </div>

      <div className="media-channel-grid">
        <div><small>媒体通道摘要</small><strong>{summarizeMediaChannels(mediaChannels)}</strong><p>音频和关键帧现在有独立帧协议，不再只塞进一次性输入包。</p></div>
        <div><small>Audio Frame</small><strong>{mediaChannels?.audio?.lastFrame?.frameId || '暂无'}</strong><p>schema=omni.audio_frame.v1 · observed={mediaChannels?.audio?.observed || 0} · sent={mediaChannels?.audio?.sent || 0} · bytes={mediaChannels?.audio?.lastFrame?.media?.byteLength || 0} · payload={mediaChannels?.audio?.lastFrame?.media?.payloadIncluded ? 'yes' : 'no'}</p></div>
        <div><small>Camera Frame</small><strong>{mediaChannels?.camera?.lastFrame?.frameId || '暂无'}</strong><p>schema=omni.camera_frame.v1 · observed={mediaChannels?.camera?.observed || 0} · sent={mediaChannels?.camera?.sent || 0} · bytes={mediaChannels?.camera?.lastFrame?.media?.byteLength || 0} · payload={mediaChannels?.camera?.lastFrame?.media?.payloadIncluded ? 'yes' : 'no'}</p></div>
        <div><small>LocalDev Media Ack</small><strong>{mediaChannels?.localDev?.lastFrameId || '暂无'}</strong><p>ack={mediaChannels?.localDev?.ackCount || 0} · {mediaChannels?.localDev?.lastFrameSchema || '等待媒体帧确认'}</p></div>
      </div>


      <div className="realtime-output-grid">
        <div><small>Provider Handshake</small><strong>{providerHandshake?.status || providerHealth?.status || providerGate?.status || 'blocked'}</strong><p>provider={providerHandshake?.providerId || providerHealth?.providerId || providerGate?.providerId || 'localdev_mock'} / mode={providerHandshake?.mode || providerHealth?.mode || providerGate?.mode || 'mock'} / socket={providerHandshake?.canOpenRealtimeSocket ? 'yes' : 'no'} / media_upload=no</p></div>
        <div><small>Audio Dry-run Gate</small><strong>{providerAudioGate?.status || 'blocked'}</strong><p>real_audio={providerAudioGate?.canSendRealAudio ? 'yes' : 'no'} / dry_run={providerAudioGate?.canSendDryRunAudioPayload ? 'yes' : 'no'} / camera=no / billing=no</p></div>
        <div><small>Session State Machine</small><strong>{summarizeRealtimeSessionState(realtimeSessionState)}</strong><p>session={realtimeSessionState?.sessionId || '暂无'} · last={realtimeSessionState?.lastTransition || 'none'}</p></div>
        <div><small>Current Lifecycle</small><strong>{getRealtimeSessionStateLabel(realtimeSessionState?.state)}</strong><p>turn={realtimeSessionState?.currentTurnId || '暂无'} · request={realtimeSessionState?.currentRequestId || '暂无'}</p></div>
        <div><small>Input Channels</small><strong>A {realtimeSessionState?.inputAudioFramesSent || 0}/{realtimeSessionState?.inputAudioFramesObserved || 0} · C {realtimeSessionState?.inputCameraFramesSent || 0}/{realtimeSessionState?.inputCameraFramesObserved || 0}</strong><p>model_speaking 时仍可监听；audio_frame 不会自动变成 interrupt。</p></div>
        <div><small>Output / Interrupt</small><strong>O {realtimeSessionState?.outputAudioFramesReceived || 0}/{realtimeSessionState?.outputAudioFramesPlayed || 0} · I {realtimeSessionState?.interruptCount || 0}</strong><p>can_interrupt={realtimeSessionState?.canInterruptOutput ? 'yes' : 'no'} · keep_mic={realtimeSessionState?.shouldKeepMicOpen ? 'yes' : 'no'}</p></div>
        <div><small>输出通道摘要</small><strong>{summarizeRealtimeOutputChannel(realtimeOutput)}</strong><p>{realtimeOutput?.guardrail || 'reply_audio_frame 是 Omni 输出媒体帧。'}</p></div>
        <div><small>Output State</small><strong>{realtimeOutput?.state || 'idle'}</strong><p>turn={realtimeOutput?.turnId || '暂无'} · reason={realtimeOutput?.lastStateReason || '暂无状态事件'}</p></div>
        <div><small>Reply Audio Frames</small><strong>{realtimeOutput?.lastFrameId || '暂无'}</strong><p>received={realtimeOutput?.receivedAudioFrames || 0} · played={realtimeOutput?.playedAudioFrames || 0} · queued={realtimeOutput?.queuedAudioFrames?.length || 0} · seq={realtimeOutput?.lastSequence ?? 'n/a'}</p></div>
        <div><small>Playback</small><strong>{realtimeOutput?.playbackActive ? 'playing' : 'idle'}</strong><p>final={realtimeOutput?.finalFrameReceived ? 'yes' : 'no'} · interrupted={realtimeOutput?.interruptCount || 0} · error={realtimeOutput?.lastError || 'none'}</p></div>
      </div>

      <div className="omni-actions">
        <button type="button" onClick={onBuild} disabled={busy}>构建 Omni 输入包</button>
        <button type="button" onClick={onSimulate} disabled={busy}>{busy && sessionStatus?.action === 'mock_turn' ? '模拟中...' : '模拟 Omni 回合'}</button>
        <button type="button" onClick={onSendLocalDev} disabled={busy}>{busy && sessionStatus?.action === 'local_dev_send' ? '发送中...' : '发送到 LocalDev Adapter'}</button>
        <button type="button" onClick={onDisconnectLocalDev} disabled={busy}>断开 LocalDev</button>
        <button type="button" className="danger-button" onClick={onInterrupt} disabled={!(realtimeOutput?.playbackActive || realtimeOutput?.queuedAudioFrames?.length || realtimeOutput?.state === 'speaking')}>模拟用户插话 / Interrupt</button>
        <button type="button" onClick={onClear} disabled={busy}>清空回合</button>
      </div>
      {busy && <p className="omni-busy-note">{sessionStatus?.label || 'Omni 会话'}正在进行中，已暂时锁定新的输入，避免多重回包覆盖当前机器人状态。</p>}

      <div className="omni-payload-grid">
        <div>
          <h3>发送给 Adapter 的输入包</h3>
          <pre>{prettyJson(packet)}</pre>
        </div>
        <div>
          <h3>Adapter 返回的统一输出 / 字幕</h3>
          <pre>{prettyJson(turn)}</pre>
        </div>
      </div>

      <p className="omni-note">v1.1.3 是 Mock Realtime Omni 双向媒体通道 + 手动 barge-in 控制 + 实时会话状态机：运行 `npm run mock:localdev` 后，Web 会在同一个 WebSocket session 中发送 omni.input_packet.v1 / omni.audio_frame.v1 / omni.camera_frame.v1，并接收 omni.output_state.v1 / omni.reply_audio_frame.v1；用户插话通过 omni.interrupt.v1 手动表达；Session State Machine 统一记录 listening / model_thinking / model_speaking / interrupted / recovering。reply_text 只作为字幕、日志和调试，不是 TTS 输入。</p>
    </section>
  );
}
