import { useState } from 'react';
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
import RobotConnectionStatusPanel from './components/RobotConnectionStatusPanel';
import RealtimeAudioPanel from './components/RealtimeAudioPanel';
import RealtimeAudioOutputPlayer from './components/RealtimeAudioOutputPlayer';
import OmniSessionPanel from './components/OmniSessionPanel';
import DebugNavigation from './components/DebugNavigation';
import { useRuntimeCore } from './runtime/useRuntimeCore';
import './styles/app.css';

export default function App() {
  const [activeDebugView, setActiveDebugView] = useState('live');
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
    realtimeReadiness,
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

  const workspaceBanner = (
    <section className="robot-workspace-banner compact-workspace-banner">
      <div>
        <p className="eyebrow">Active Robot Workspace</p>
        <h2>{robot.name} 的专属调控界面</h2>
        <p>当前视图只作用于这台机器人。切换顶部调试视图不会改变 robot_id、权限、插件或 LocalDev 会话。</p>
      </div>
      <div className="workspace-identity-grid">
        <span><small>robot_id</small><strong>{activeRobotId}</strong></span>
        <span><small>display_name</small><strong>{robot.name}</strong></span>
        <span><small>mode</small><strong>{robot.mode}</strong></span>
        <span><small>adapter</small><strong>{robot.adapter}</strong></span>
      </div>
    </section>
  );

  function renderLiveView() {
    return (
      <main className="dashboard dashboard-live">
        <aside className="left-column">
          <StatusControls robot={robot} onState={actions.handleState} onMode={actions.handleMode} />
          <RobotProfilePanel profile={robotProfile} onSave={actions.handleRobotProfileSave} onReset={actions.handleRobotProfileReset} />
          <MockEventButtons onEvent={actions.handleEvent} />
        </aside>

        <section className="center-stage">
          {workspaceBanner}
          <div className="stage-card" id="robot-console">
            <div className="stage-header">
              <div>
                <p className="eyebrow">Robot Face Preview</p>
                <h2>实时控制台</h2>
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
            <RealtimeAudioPanel
              robot={robot}
              session={realtimeSession}
              route={realtimeRoute}
              localDevPreflight={localDevPreflight}
              localDevBridge={localDevBridge}
              onStatus={actions.handleRealtimeSessionStatus}
              onAudioFrame={actions.handleAudioFrame}
              onAdapterTest={actions.handleLocalDevAdapterTest}
            />
            <RealtimeAudioOutputPlayer output={realtimeOutput} sessionState={realtimeSessionState} onFramePlayed={actions.handleReplyAudioFramePlayed} onInterrupt={actions.handleRealtimeOutputInterrupt} />
            <CameraPreview robot={robot} framePolicy={framePolicy} onStatus={setCameraStatus} onFrame={actions.handleCameraFrame} />
            <EmotionInspector robot={robot} cameraStatus={cameraStatus} recentEvents={recentEvents} />
            <div className="telemetry-grid">
              <div><small>插件动作：空调</small><strong>{robot.ac.power} · {robot.ac.temperature}℃</strong></div>
              <div><small>角色</small><strong>{robot.role}</strong></div>
              <div><small>关键帧策略</small><strong>{framePolicy.cadence}</strong></div>
              <div><small>关键帧缓存</small><strong>{cameraStatus.frameCount}</strong></div>
              <div><small>邮件草稿</small><strong>{robot.emailDrafts.length}</strong></div>
              <div><small>运行模式</small><strong>{robot.mode}</strong></div>
            </div>
          </div>
        </section>

        <aside className="right-column">
          <RobotConnectionStatusPanel
            robot={robot}
            connection={connectionSnapshot}
            route={realtimeRoute}
            realtimeSession={realtimeSession}
            realtimeSessionState={realtimeSessionState}
            localDevPreflight={localDevPreflight}
            localDevBridge={localDevBridge}
            mediaChannels={mediaChannels}
            realtimeOutput={realtimeOutput}
            readiness={realtimeReadiness}
            onConnectionMode={actions.handleMode}
            onAdapterTest={actions.handleLocalDevAdapterTest}
            onAdapterDisconnect={actions.handleLocalDevOmniDisconnect}
          />
          <RobotRegistryPanel robots={robotRegistry} activeRobotId={activeRobotId} onSelect={actions.handleRobotSelect} onAdd={actions.handleRobotAdd} onDelete={actions.handleRobotDelete} />
          <VisibleContext robot={robot} recentEvents={recentEvents} cameraStatus={cameraStatus} framePolicy={framePolicy} connection={connectionSnapshot} realtimeSession={realtimeSession} realtimeRoute={realtimeRoute} mediaChannels={mediaChannels} realtimeOutput={realtimeOutput} realtimeSessionState={realtimeSessionState} />
        </aside>
      </main>
    );
  }

  function renderOmniView() {
    return (
      <main className="dashboard dashboard-single">
        <section className="center-stage">
          {workspaceBanner}
          <section className="debug-view-banner">
            <p className="eyebrow">Omni Session Debug</p>
            <h2>实时会话、状态机和 LocalDev Adapter</h2>
            <p>这里集中调试 input packet、audio/camera frame、reply_audio_frame、interrupt 和 Model Adapter 配置。</p>
          </section>
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
            realtimeOutput={realtimeOutput}
            realtimeSessionState={realtimeSessionState}
            onBuild={actions.handleOmniPacketBuild}
            onSimulate={actions.handleOmniTurnSimulate}
            onSendLocalDev={actions.handleLocalDevOmniSend}
            onDisconnectLocalDev={actions.handleLocalDevOmniDisconnect}
            onInterrupt={actions.handleRealtimeOutputInterrupt}
            onClear={actions.handleOmniTurnClear}
          />
          <ModelProviderPanel
            activeMode={robot.mode}
            profiles={adapterProfiles}
            onUpdate={actions.handleModelProviderUpdate}
            onReset={actions.handleModelProviderReset}
            onTest={actions.handleModelProviderTest}
          />
        </section>
      </main>
    );
  }

  function renderPluginView() {
    return (
      <main className="dashboard dashboard-single">
        <section className="center-stage">
          {workspaceBanner}
          <section className="debug-view-banner">
            <p className="eyebrow">Plugin Workbench</p>
            <h2>插件中心已独立成点击视图</h2>
            <p>插件列表、动作库、无代码插件和代码插件不再挤在主页面；进入本视图后再用插件中心内部标签切换。</p>
          </section>
          <PluginCenter plugins={plugins} onToggle={actions.handlePluginToggle} onRun={actions.handlePluginRun} onAdd={actions.handlePluginAdd} onDelete={actions.handlePluginDelete} />
        </section>
      </main>
    );
  }

  function renderPermissionView() {
    return (
      <main className="dashboard dashboard-split">
        <section className="center-stage">
          {workspaceBanner}
          <PermissionPanel permissions={permissions} onChange={actions.handlePermissionChange} />
        </section>
        <aside className="right-column">
          <RobotRegistryPanel robots={robotRegistry} activeRobotId={activeRobotId} onSelect={actions.handleRobotSelect} onAdd={actions.handleRobotAdd} onDelete={actions.handleRobotDelete} />
          <section className="panel">
            <div className="panel-header">
              <h2>权限说明</h2>
              <span className="tag">Runtime Guard</span>
            </div>
            <p className="muted">插件、Tool Engine 和用户代码插件都必须经过权限检查；当前仍是 Mock only，不接真实邮箱、空调、硬件或 secrets。</p>
          </section>
        </aside>
      </main>
    );
  }

  function renderContextView() {
    return (
      <main className="dashboard dashboard-split">
        <section className="center-stage">
          {workspaceBanner}
          <VisibleContext robot={robot} recentEvents={recentEvents} cameraStatus={cameraStatus} framePolicy={framePolicy} connection={connectionSnapshot} realtimeSession={realtimeSession} realtimeRoute={realtimeRoute} mediaChannels={mediaChannels} realtimeOutput={realtimeOutput} realtimeSessionState={realtimeSessionState} />
        </section>
        <aside className="right-column">
          <RobotConnectionStatusPanel
            robot={robot}
            connection={connectionSnapshot}
            route={realtimeRoute}
            realtimeSession={realtimeSession}
            realtimeSessionState={realtimeSessionState}
            localDevPreflight={localDevPreflight}
            localDevBridge={localDevBridge}
            mediaChannels={mediaChannels}
            realtimeOutput={realtimeOutput}
            readiness={realtimeReadiness}
            onConnectionMode={actions.handleMode}
            onAdapterTest={actions.handleLocalDevAdapterTest}
            onAdapterDisconnect={actions.handleLocalDevOmniDisconnect}
          />
          <RobotRegistryPanel robots={robotRegistry} activeRobotId={activeRobotId} onSelect={actions.handleRobotSelect} onAdd={actions.handleRobotAdd} onDelete={actions.handleRobotDelete} />
          <ConnectionManagerPanel connection={connectionSnapshot} framePolicy={framePolicy} quality={networkQuality} onQuality={actions.handleNetworkQualityChange} onAutoFallback={actions.handleAutoFallback} />
        </aside>
      </main>
    );
  }

  function renderLogsView() {
    return (
      <main className="dashboard dashboard-single">
        <section className="center-stage">
          {workspaceBanner}
          <section className="debug-view-banner">
            <p className="eyebrow">Action Log</p>
            <h2>行为日志独立调试视图</h2>
            <p>插件执行、权限检查、LocalDev 输出、interrupt 和状态机转移会记录在这里。</p>
          </section>
          <ActionLog logs={logs} />
        </section>
      </main>
    );
  }

  const viewRenderers = {
    live: renderLiveView,
    omni: renderOmniView,
    plugins: renderPluginView,
    permissions: renderPermissionView,
    context: renderContextView,
    logs: renderLogsView
  };

  return (
    <div className="app-shell" id="top">
      <header className="hero">
        <div>
          <p className="eyebrow">Realtime Omni Robot Demo v1.1.5</p>
          <h1>云端优先、可本地调试的实时 Omni 机器人平台</h1>
          <p className="hero-copy">当前版本把长页面改成点击式调试工作台：插件中心、权限、可见信息、日志和 Omni 会话都作为独立视图切换。</p>
        </div>
        <div className="hero-overview-card">
          <span><small>当前重点</small><strong>点击式调试工作台</strong></span>
          <span><small>实时核心</small><strong>Realtime Session State Machine</strong></span>
          <span><small>安全边界</small><strong>Mock only · no real TTS/API/hardware</strong></span>
        </div>
      </header>

      <DebugNavigation activeView={activeDebugView} onSelect={setActiveDebugView} />
      {viewRenderers[activeDebugView]?.() || renderLiveView()}
    </div>
  );
}
