import RobotFace from './components/RobotFace';
import StatusControls from './components/StatusControls';
import RobotRegistryPanel from './components/RobotRegistryPanel';
import RobotProfilePanel from './components/RobotProfilePanel';
import PermissionPanel from './components/PermissionPanel';
import PluginCenter from './components/PluginCenter';
import VisibleContext from './components/VisibleContext';
import ActionLog from './components/ActionLog';
import MockEventButtons from './components/MockEventButtons';
import CameraPreview from './components/CameraPreview';
import EmotionInspector from './components/EmotionInspector';
import ModelProviderPanel from './components/ModelProviderPanel';
import RuntimeArchitecturePanel from './components/RuntimeArchitecturePanel';
import ConnectionManagerPanel from './components/ConnectionManagerPanel';
import RealtimeAudioPanel from './components/RealtimeAudioPanel';
import OmniSessionPanel from './components/OmniSessionPanel';
import { useRuntimeCore } from './runtime/useRuntimeCore';
import './styles/app.css';

export default function App() {
  const runtime = useRuntimeCore();
  const {
    robot,
    robotRegistry,
    activeRobotId,
    robotProfile,
    permissions,
    plugins,
    logs,
    runtimeTrace,
    recentEvents,
    cameraStatus,
    framePolicy,
    connectionSnapshot,
    networkQuality,
    realtimeSession,
    realtimeRoute,
    omniPacket,
    lastOmniTurn,
    omniSessionStatus,
    localDevPreflight,
    localDevBridge,
    mediaChannels,
    adapterProfiles,
    setCameraStatus,
    actions
  } = runtime;

  return (
    <div className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">Realtime Omni Robot Demo v1.1.0</p>
          <h1>云端优先、可本地调试的实时 Omni 机器人平台</h1>
          <p className="hero-copy">当前版本新增真实摄像头 JPEG 关键帧 payload：音频 PCM chunk 和视觉关键帧都可通过 LocalDev 媒体通道送达。</p>
        </div>
        <div className="hero-badges">
          <span>RuntimeCore</span>
          <span>Robot Registry</span>
          <span>Delete Guard</span>
          <span>Robot Identity Profile</span>
          <span>Model Adapter Registry</span>
          <span>Plugin Manifest</span>
          <span>Connection Manager</span>
          <span>Frame Policy</span>
          <span>Omni Session Bridge</span>
          <span>Tool Intent Router</span>
          <span>Mock Tool Engine</span>
          <span>Per Robot Config</span>
          <span>LocalDev Adapter Client</span>
          <span>Persistent Roundtrip</span>
          <span>Media Frame Channels</span>
          <span>PCM Audio Chunks</span>
          <span>JPEG Frame Payload</span>
        </div>
      </header>

      <main className="dashboard">
        <aside className="left-column">
          <StatusControls robot={robot} onState={actions.handleState} onMode={actions.handleMode} />
          <RobotProfilePanel profile={robotProfile} onSave={actions.handleRobotProfileSave} onReset={actions.handleRobotProfileReset} />
          <MockEventButtons onEvent={actions.handleEvent} />
        </aside>

        <section className="center-stage">
          <section className="robot-workspace-banner">
            <div>
              <p className="eyebrow">Active Robot Workspace</p>
              <h2>{robot.name} 的专属调控界面</h2>
              <p>当前页面的表情、运行模式、实时音频、关键帧、插件测试和 Omni 输入包都只作用于这台机器人。</p>
            </div>
            <div className="workspace-identity-grid">
              <span><small>robot_id</small><strong>{activeRobotId}</strong></span>
              <span><small>display_name</small><strong>{robot.name}</strong></span>
              <span><small>mode</small><strong>{robot.mode}</strong></span>
              <span><small>adapter</small><strong>{robot.adapter}</strong></span>
              <span><small>permissions</small><strong>{permissions.length} scoped</strong></span>
              <span><small>enabled_plugins</small><strong>{plugins.filter((plugin) => plugin.enabled).length} / {plugins.length}</strong></span>
            </div>
          </section>
          <div className="stage-card">
            <div className="stage-header">
              <div>
                <p className="eyebrow">Robot Face Preview</p>
                <h2>实体屏幕同款 LOOI 风格表情预览</h2>
              </div>
              <span className="tag">{robot.adapter}</span>
            </div>
            <RobotFace expression={robot.expression} state={robot.state} speaking={robot.state === 'speaking'} />
            <div className="speech-motion-strip">
              <div><small>机器人说</small><strong>{robot.lastSpeech || '暂无'}</strong></div>
              <div><small>机器人动作</small><strong>{robot.motion?.name || 'idle'}</strong></div>
              <div><small>身份昵称</small><strong>{robot.name}</strong></div>
              <div><small>Model Adapter</small><strong>{robot.adapter}</strong></div>
            </div>
            <RealtimeAudioPanel robot={robot} session={realtimeSession} route={realtimeRoute} onStatus={actions.handleRealtimeSessionStatus} onAudioFrame={actions.handleAudioFrame} />
            <CameraPreview robot={robot} framePolicy={framePolicy} onStatus={setCameraStatus} onFrame={actions.handleCameraFrame} />
            <EmotionInspector robot={robot} cameraStatus={cameraStatus} recentEvents={recentEvents} />
            <div className="telemetry-grid">
              <div><small>插件动作：空调</small><strong>{robot.ac.power} · {robot.ac.temperature}℃</strong></div>
              <div><small>角色</small><strong>{robot.role}</strong></div>
              <div><small>关键帧策略</small><strong>{framePolicy.cadence}</strong></div>
              <div><small>关键帧缓存</small><strong>{cameraStatus.frameCount}</strong></div>
              <div><small>邮件草稿</small><strong>{robot.emailDrafts.length}</strong></div>
              <div><small>运行模式</small><strong>{robot.mode}</strong></div>
              <div><small>唤醒名</small><strong>{robot.wakeName}</strong></div>
              <div><small>声音风格</small><strong>{robot.voiceStyle}</strong></div>
            </div>
          </div>
          <RuntimeArchitecturePanel trace={runtimeTrace} />
          <ConnectionManagerPanel connection={connectionSnapshot} framePolicy={framePolicy} quality={networkQuality} onQuality={actions.handleNetworkQualityChange} onAutoFallback={actions.handleAutoFallback} />
          <OmniSessionPanel
            packet={omniPacket}
            turn={lastOmniTurn}
            route={realtimeRoute}
            sessionStatus={omniSessionStatus}
            localDevPreflight={localDevPreflight}
            localDevBridge={localDevBridge}
            mediaChannels={mediaChannels}
            onBuild={actions.handleOmniPacketBuild}
            onSimulate={actions.handleOmniTurnSimulate}
            onSendLocalDev={actions.handleLocalDevOmniSend}
            onDisconnectLocalDev={actions.handleLocalDevOmniDisconnect}
            onClear={actions.handleOmniTurnClear}
          />
          <ModelProviderPanel
            activeMode={robot.mode}
            profiles={adapterProfiles}
            onUpdate={actions.handleModelProviderUpdate}
            onReset={actions.handleModelProviderReset}
            onTest={actions.handleModelProviderTest}
          />
          <PluginCenter plugins={plugins} onToggle={actions.handlePluginToggle} onRun={actions.handlePluginRun} onAdd={actions.handlePluginAdd} onDelete={actions.handlePluginDelete} />
        </section>

        <aside className="right-column">
          <RobotRegistryPanel robots={robotRegistry} activeRobotId={activeRobotId} onSelect={actions.handleRobotSelect} onAdd={actions.handleRobotAdd} onDelete={actions.handleRobotDelete} />
          <PermissionPanel permissions={permissions} onChange={actions.handlePermissionChange} />
          <VisibleContext robot={robot} recentEvents={recentEvents} cameraStatus={cameraStatus} framePolicy={framePolicy} connection={connectionSnapshot} realtimeSession={realtimeSession} realtimeRoute={realtimeRoute} mediaChannels={mediaChannels} />
        </aside>
      </main>

      <ActionLog logs={logs} />
    </div>
  );
}
