import { summarizeOmniPacket } from '../runtime/omniPacket';
import { summarizeMediaChannels } from '../runtime/omniMediaFrames';

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
  media_ack: '媒体帧已确认'
};

function statusClass(status) {
  if (status === 'connected' || status === 'received' || status === 'media_ack') return 'connected';
  if (status === 'connecting' || status === 'sending' || status === 'media_sending') return 'checking';
  if (status === 'failed') return 'failed';
  if (status === 'disconnected') return 'skipped';
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
  onBuild,
  onSimulate,
  onSendLocalDev,
  onDisconnectLocalDev,
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
          <h2>实时 Omni 输入包 / 输出回合预览</h2>
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
          <p>{turn ? `${turn.expression?.expression} · ${turn.tool_intents?.length || 0} tool intents` : '可先构建输入包，再模拟 Omni 输出。'}</p>
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
            <p>请确认 `npm run mock:localdev` 或本地 Qwen2.5-Omni Adapter 正在运行。</p>
          </div>
        )}
      </div>

      <div className="media-channel-grid">
        <div><small>媒体通道摘要</small><strong>{summarizeMediaChannels(mediaChannels)}</strong><p>音频和关键帧现在有独立帧协议，不再只塞进一次性输入包。</p></div>
        <div><small>Audio Frame</small><strong>{mediaChannels?.audio?.lastFrame?.frameId || '暂无'}</strong><p>schema=omni.audio_frame.v1 · observed={mediaChannels?.audio?.observed || 0} · sent={mediaChannels?.audio?.sent || 0} · bytes={mediaChannels?.audio?.lastFrame?.media?.byteLength || 0} · payload={mediaChannels?.audio?.lastFrame?.media?.payloadIncluded ? 'yes' : 'no'}</p></div>
        <div><small>Camera Frame</small><strong>{mediaChannels?.camera?.lastFrame?.frameId || '暂无'}</strong><p>schema=omni.camera_frame.v1 · observed={mediaChannels?.camera?.observed || 0} · sent={mediaChannels?.camera?.sent || 0} · bytes={mediaChannels?.camera?.lastFrame?.media?.byteLength || 0} · payload={mediaChannels?.camera?.lastFrame?.media?.payloadIncluded ? 'yes' : 'no'}</p></div>
        <div><small>LocalDev Media Ack</small><strong>{mediaChannels?.localDev?.lastFrameId || '暂无'}</strong><p>ack={mediaChannels?.localDev?.ackCount || 0} · {mediaChannels?.localDev?.lastFrameSchema || '等待媒体帧确认'}</p></div>
      </div>

      <div className="omni-actions">
        <button type="button" onClick={onBuild} disabled={busy}>构建 Omni 输入包</button>
        <button type="button" onClick={onSimulate} disabled={busy}>{busy && sessionStatus?.action === 'mock_turn' ? '模拟中...' : '模拟 Omni 回合'}</button>
        <button type="button" onClick={onSendLocalDev} disabled={busy}>{busy && sessionStatus?.action === 'local_dev_send' ? '发送中...' : '发送到 LocalDev Adapter'}</button>
        <button type="button" onClick={onDisconnectLocalDev} disabled={busy}>断开 LocalDev</button>
        <button type="button" onClick={onClear} disabled={busy}>清空回合</button>
      </div>
      {busy && <p className="omni-busy-note">{sessionStatus?.label || 'Omni 会话'}正在进行中，已暂时锁定新的输入，避免多重回包覆盖当前机器人状态。</p>}

      <div className="omni-payload-grid">
        <div>
          <h3>发送给 Adapter 的输入包</h3>
          <pre>{prettyJson(packet)}</pre>
        </div>
        <div>
          <h3>Adapter 返回的统一输出</h3>
          <pre>{prettyJson(turn)}</pre>
        </div>
      </div>

      <p className="omni-note">v1.1.0 在真实麦克风 PCM chunk 基础上新增摄像头 JPEG payload：运行 `npm run mock:localdev` 后，Web 会通过保持连接的 WebSocket 发送 omni.input_packet.v1、带 payload 的 omni.audio_frame.v1 与 omni.camera_frame.v1；服务未启动时仍可继续使用 Mock 回合。</p>
    </section>
  );
}
