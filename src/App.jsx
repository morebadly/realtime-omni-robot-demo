import { useState } from 'react';
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
import PetConsole from './components/PetConsole';
import StatusControls from './components/StatusControls';
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
    providerGate,
    providerHealth,
    providerHandshake,
    providerAudioGate,
    providerCameraGate,
    providerAdapterDescriptor,
    providerSocketSandbox,
    providerProxyDiagnostics,
    providerProxyServerContract,
    providerProxyHandshakeSandbox,
    providerProxyHandshakeDryRun,
    providerSpecificHandshakeDiagnostics,
    providerRealHandshakePreflightDiagnostics,
    omniPacket,
    lastOmniTurn,
    omniSessionStatus,
    localDevPreflight,
    localDevBridge,
    mediaChannels,
    realtimeOutput,
    realtimeMux,
    sessionCorrelation,
    adapterProfiles,
    pet,
    petAction,
    petActions,
    petEyeFrame,
    restReminder,
    setCameraStatus,
    actions
  } = runtime;

  const workspaceBanner = (
    <section className="robot-workspace-banner compact-workspace-banner">
      <div>
        <p className="eyebrow">Active Pet Workspace</p>
        <h2>{robot.name} pet runtime</h2>
        <p>Live mode is local-first pet behavior. Provider, audio, plugin, permission, and packet tools remain available from debug views.</p>
      </div>
      <div className="workspace-identity-grid">
        <span><small>robot_id</small><strong>{activeRobotId}</strong></span>
        <span><small>display_name</small><strong>{robot.name}</strong></span>
        <span><small>pet_state</small><strong>{pet?.petState || 'idle'}</strong></span>
        <span><small>fallback</small><strong>localdev_mock</strong></span>
      </div>
    </section>
  );

  function renderLiveView() {
    return (
      <PetConsole
        robot={robot}
        pet={pet}
        petAction={petAction}
        petActions={petActions}
        petEyeFrame={petEyeFrame}
        restReminder={restReminder}
        cameraStatus={cameraStatus}
        framePolicy={framePolicy}
        connectionSnapshot={connectionSnapshot}
        setCameraStatus={setCameraStatus}
        onCameraFrame={actions.handleCameraFrame}
        onPetEvent={actions.dispatchPetEvent}
      />
    );
  }

  function renderOmniView() {
    return (
      <main className="dashboard dashboard-single">
        <section className="center-stage">
          {workspaceBanner}
          <section className="debug-view-banner">
            <p className="eyebrow">Omni Session Debug</p>
            <h2>Realtime/provider debug workbench</h2>
            <p>Debug only. The first-gen live product remains a non-verbal pet and does not route reply_text to speech playback.</p>
          </section>
          <RuntimeArchitecturePanel trace={runtimeTrace} />
          <ConnectionManagerPanel connection={connectionSnapshot} framePolicy={framePolicy} quality={networkQuality} onQuality={actions.handleNetworkQualityChange} onAutoFallback={actions.handleAutoFallback} />
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
            realtimeMux={realtimeMux}
            sessionCorrelation={sessionCorrelation}
            providerGate={providerGate}
            providerHealth={providerHealth}
            providerHandshake={providerHandshake}
            providerAudioGate={providerAudioGate}
            providerCameraGate={providerCameraGate}
            providerAdapterDescriptor={providerAdapterDescriptor}
            providerSocketSandbox={providerSocketSandbox}
            providerProxyDiagnostics={providerProxyDiagnostics}
            providerProxyServerContract={providerProxyServerContract}
            providerProxyHandshakeSandbox={providerProxyHandshakeSandbox}
            providerProxyHandshakeDryRun={providerProxyHandshakeDryRun}
            providerSpecificHandshakeDiagnostics={providerSpecificHandshakeDiagnostics}
            providerRealHandshakePreflightDiagnostics={providerRealHandshakePreflightDiagnostics}
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
            providerGate={providerGate}
            providerHealth={providerHealth}
            providerHandshake={providerHandshake}
            providerAudioGate={providerAudioGate}
            providerCameraGate={providerCameraGate}
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
          <RobotProfilePanel profile={robotProfile} onSave={actions.handleRobotProfileSave} onReset={actions.handleRobotProfileReset} />
        </aside>
      </main>
    );
  }

  function renderContextView() {
    return (
      <main className="dashboard dashboard-split">
        <section className="center-stage">
          {workspaceBanner}
          <VisibleContext
            robot={robot}
            pet={pet}
            petAction={petAction}
            petEyeFrame={petEyeFrame}
            recentEvents={recentEvents}
            cameraStatus={cameraStatus}
            framePolicy={framePolicy}
            connection={connectionSnapshot}
            realtimeSession={realtimeSession}
            realtimeRoute={realtimeRoute}
            mediaChannels={mediaChannels}
            realtimeOutput={realtimeOutput}
            realtimeSessionState={realtimeSessionState}
            providerGate={providerGate}
            providerHealth={providerHealth}
            providerHandshake={providerHandshake}
            providerAudioGate={providerAudioGate}
            providerCameraGate={providerCameraGate}
          />
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
        </aside>
      </main>
    );
  }

  function renderDebugView() {
    return (
      <main className="dashboard dashboard-split">
        <section className="center-stage">
          {workspaceBanner}
          <CameraPreview robot={robot} framePolicy={framePolicy} onStatus={setCameraStatus} onFrame={actions.handleCameraFrame} />
          <EmotionInspector robot={robot} cameraStatus={cameraStatus} recentEvents={recentEvents} />
          <MockEventButtons onEvent={actions.handleEvent} />
          <StatusControls robot={robot} onState={actions.handleState} onMode={actions.handleMode} />
        </section>
        <aside className="right-column">
          <RobotProfilePanel profile={robotProfile} onSave={actions.handleRobotProfileSave} onReset={actions.handleRobotProfileReset} />
          <RobotRegistryPanel robots={robotRegistry} activeRobotId={activeRobotId} onSelect={actions.handleRobotSelect} onAdd={actions.handleRobotAdd} onDelete={actions.handleRobotDelete} />
        </aside>
      </main>
    );
  }

  function renderLogsView() {
    return (
      <main className="dashboard dashboard-single">
        <section className="center-stage">
          {workspaceBanner}
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
    debug: renderDebugView,
    logs: renderLogsView
  };

  return (
    <div className="app-shell" id="top">
      <header className="hero pet-hero">
        <div>
          <p className="eyebrow">CloudGenie Pet Console</p>
          <h1>CloudGenie Pet Console</h1>
          <p className="hero-copy">涓嶄細璇磋瘽鐨勬瘺缁?AI 妗岄潰灏忓疇鐗?</p>
          <p className="hero-copy">鐢ㄧ溂绁炪€佽Е鎽搞€佸懠鍣溿€佽交寰姩浣滃拰鎹㈣琛ㄨ揪</p>
        </div>
        <div className="hero-overview-card">
          <span><small>voice</small><strong>human speech off</strong></span>
          <span><small>pet protocol</small><strong>cloudgenie.pet_action.v1</strong></span>
          <span><small>camera</small><strong>local preview / local_only</strong></span>
        </div>
      </header>

      <DebugNavigation activeView={activeDebugView} onSelect={setActiveDebugView} />
      {viewRenderers[activeDebugView]?.() || renderLiveView()}
    </div>
  );
}
