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
import RealtimeAudioOutputPlayer from './components/RealtimeAudioOutputPlayer';
import OmniSessionPanel from './components/OmniSessionPanel';
import DebugNavigation from './components/DebugNavigation';
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
    realtimeSessionState,
    realtimeRoute,
    omniPacket,
    lastOmniTurn,
    omniSessionStatus,
    localDevPreflight,
    localDevBridge,
    mediaChannels,
    realtimeOutput,
    adapterProfiles,
    setCameraStatus,
    actions
  } = runtime;

  return (
    <div className="app-shell" id="top">
      <header className="hero">
        <div>
          <p className="eyebrow">Realtime Omni Robot Demo v1.1.4</p>
          <h1>云端优先、可本地调试的实时 Omni 机器人平台</h1>
          <p className="hero-copy">当前版本优化调试 UI：顶部改为简洁摘要，新增快速跳转导航，压缩可见信息面板并修复窄栏换行混乱。</p>
        </div>
        <div className="hero-overview-card">
          <span><small>当前重点</small><strong>UI 调试可用性</strong></span>
          <span><small>实时核心</small><strong>Realtime Session State Machine</strong></span>
          <span><small>安全边界</small><strong>Mock only · no real TTS/API/hardware</strong></span>
        </div>
      </header>

      <DebugNavigation />

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
          <div className="stage-card anchor-target" id="robot-console">
            <div className="stage-header">
              <div>
                <p className="eyebrow">Robot Face Preview</p>
                <h2>实体屏幕同款 LOOI 风格表情预览</h2>
              </div>
              <span className="tag">{robot.adapter}</span>
            </div>
            <RobotFace expression={robot.expression} state={robot.state} speaking={robot.state === 'speaking' || realtimeOutput?.playbackActive} />
            <div className="speech-motion-strip">
              <div><small>机器人说</small><strong>{robot.lastSpeech || '暂无'}</strong></div>
              <div><small>机器人动作</small><strong>{robot.motion?.name || 'idle'}</strong></div>
              <div><small>身份昵称</small><strong>{robot.name}</strong></div>
              <div><small>Model Adapter</small><strong>{robot.adapter}</strong></div>
            </div>
            <div className="anchor-target" id="audio-io">
              <RealtimeAudioPanel robot={robot} session={realtimeSession} route={realtimeRoute} onStatus={actions.handleRealtimeSessionStatus} onAudioFrame={actions.handleAudioFrame} />
              <RealtimeAudioOutputPlayer output={realtimeOutput} sessionState={realtimeSessionState} onFramePlayed={actions.handleReplyAudioFramePlayed} onInterrupt={actions.handleRealtimeOutputInterrupt} />
              <CameraPreview robot={robot} framePolicy={framePolicy} onStatus={setCameraStatus} onFrame={actions.handleCameraFrame} />
            </div>
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
          <div className="anchor-target" id="runtime-state"><RuntimeArchitecturePanel trace={runtimeTrace} /></div>
          <ConnectionManagerPanel connection={connectionSnapshot} framePolicy={framePolicy} quality={networkQuality} onQuality={actions.handleNetworkQualityChange} onAutoFallback={actions.handleAutoFallback} />
          <div className="anchor-target" id="omni-session">
            <OmniSessionPanel
              packet={omniPacket}
              turn={lastOmniTurn}
              route={realtimeRoute}
              sessionStatus={omniSessionStatus}
              localDevPreflight={localDevPreflight}
              localDevBridge={localDevBridge}
              mediaChannels={mediaChannels}
              realtimeOutput={realtimeOutput}
              realtimeSessionState={realtimeSessionState}
              onBuild={actions.handleOmniPacketBuild}
              onSimulate={actions.handleOmniTurnSimulate}
              onSendLocalDev={actions.handleLocalDevOmniSend}
              onDisconnectLocalDev={actions.handleLocalDevOmniDisconnect}
              onInterrupt={actions.handleRealtimeOutputInterrupt}
              onClear={actions.handleOmniTurnClear}
            />
          </div>
          <ModelProviderPanel
            activeMode={robot.mode}
            profiles={adapterProfiles}
            onUpdate={actions.handleModelProviderUpdate}
            onReset={actions.handleModelProviderReset}
            onTest={actions.handleModelProviderTest}
          />
          <div className="anchor-target" id="plugins"><PluginCenter plugins={plugins} onToggle={actions.handlePluginToggle} onRun={actions.handlePluginRun} onAdd={actions.handlePluginAdd} onDelete={actions.handlePluginDelete} /></div>
        </section>

        <aside className="right-column">
          <RobotRegistryPanel robots={robotRegistry} activeRobotId={activeRobotId} onSelect={actions.handleRobotSelect} onAdd={actions.handleRobotAdd} onDelete={actions.handleRobotDelete} />
          <div className="anchor-target" id="permissions"><PermissionPanel permissions={permissions} onChange={actions.handlePermissionChange} /></div>
          <div className="anchor-target" id="visible-context"><VisibleContext robot={robot} recentEvents={recentEvents} cameraStatus={cameraStatus} framePolicy={framePolicy} connection={connectionSnapshot} realtimeSession={realtimeSession} realtimeRoute={realtimeRoute} mediaChannels={mediaChannels} realtimeOutput={realtimeOutput} realtimeSessionState={realtimeSessionState} /></div>
        </aside>
      </main>

      <div className="anchor-target" id="logs"><ActionLog logs={logs} /></div>
    </div>
  );
}
