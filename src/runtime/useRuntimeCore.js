import { useMemo, useRef, useState } from 'react';
import { createEventBus } from './eventBus';
import { createLog, initialRobot, matchPlugin } from './mockRuntime';
import { expressionToRobotState, inferExpressionFromEvent, getExpressionFromPlugin } from './expressionEngine';
import { executePluginActions } from './pluginEngine';
import { getAdapterForMode, getNetworkLabel } from './modelAdapters';
import { createPermissionMap, checkPermission, describePermissionStatus } from './permissionEngine';
import { applyProfileToRobot, deleteRobotProfile, readRobotProfile, resetRobotProfile, saveRobotProfile } from './robotProfile';
import { normalizePlugin, summarizeManifest } from './pluginManifest';
import { buildConnectionSnapshot } from './networkManager';
import { getFramePolicy } from './framePolicy';
import { buildRealtimeRoute, createDefaultRealtimeSession } from './realtimeSession';
import { createDefaultRealtimeSessionState, transitionRealtimeSessionState } from './realtimeSessionState';
import { buildOmniInputPacket, summarizeOmniPacket } from './omniPacket';
import { applyMediaAck, applyMediaError, createAudioFrame, createCameraFrame, createDefaultMediaChannels, updateMediaChannelStats } from './omniMediaFrames';
import { applyRealtimeOutputError, applyRealtimeOutputInterrupt, applyRealtimeOutputState, applyReplyAudioFrame, clearRealtimeOutputChannel, createDefaultRealtimeOutputChannel, markReplyAudioFramePlayed } from './realtimeOutputChannel';
import { simulateOmniTurn } from './omniTurnSimulator';
import { routeToolIntents } from './toolIntentRouter';
import { createLocalDevOmniBridge } from './localDevOmniClient';
import { buildRealtimeReadiness } from './realtimeReadiness';
import { getConnectionModeOption } from './connectionModes';
import {
  createLocalDevPreflightState as createLocalDevPreflightSeed,
  getLocalDevEndpointLabel,
  markLocalDevPreflightChecking,
  markLocalDevPreflightConnected,
  markLocalDevPreflightFailed,
  markLocalDevPreflightSkipped,
  shouldRunLocalDevFirstCheck
} from './localDevPreflight';
import { createRobotRegistryItem, findRobotSummary, readActiveRobotId, readRobotRegistry, removeRegistryItem, saveActiveRobotId, saveRobotRegistry, updateRegistryItem } from './robotRegistry';
import { deleteRobotRuntimeConfig, readRobotRuntimeConfig, resetRobotAdapterProfiles, saveRobotAdapterProfiles, saveRobotPermissions, saveRobotPlugins } from './robotRuntimeConfig';

function createRobotFromRegistry(robotId, registry, adapterProfiles) {
  const summary = findRobotSummary(registry, robotId);
  const profile = readRobotProfile(summary.robotId, summary);
  const adapter = getAdapterForMode(summary.mode || 'local_dev', adapterProfiles);
  return {
    ...applyProfileToRobot(initialRobot, profile),
    robotId: summary.robotId,
    online: summary.online,
    mode: summary.mode,
    network: summary.network || getNetworkLabel(summary.mode),
    adapter: adapter.name,
    adapterDetail: adapter,
    role: profile.defaultRole || initialRobot.role,
    state: summary.state || initialRobot.state,
    expression: summary.expression || initialRobot.expression,
    expressionSource: 'robot_registry.selected',
    location: summary.location,
    registryNote: summary.note,
    lastSeen: summary.lastSeen,
    lastSpeech: `你好，我是 ${profile.displayName}。`
  };
}

function createInitialRuntimeSeed() {
  const registry = readRobotRegistry();
  const activeRobotId = readActiveRobotId(registry);
  const activeSummary = findRobotSummary(registry, activeRobotId);
  const runtimeConfig = readRobotRuntimeConfig(activeSummary.robotId);
  const robotProfile = readRobotProfile(activeSummary.robotId, activeSummary);
  return {
    registry,
    activeRobotId: activeSummary.robotId,
    adapterProfiles: runtimeConfig.adapterProfiles,
    permissions: runtimeConfig.permissions,
    plugins: runtimeConfig.plugins,
    runtimeConfig,
    robotProfile,
    robot: createRobotFromRegistry(activeSummary.robotId, registry, runtimeConfig.adapterProfiles)
  };
}

function createTrace(layer, event, detail) {
  return {
    id: crypto.randomUUID?.() || String(Date.now() + Math.random()),
    time: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
    layer,
    event,
    detail
  };
}

function createLocalDevPreflightState(robotId, endpoint) {
  return createLocalDevPreflightSeed(robotId, endpoint);
}

export function useRuntimeCore() {
  const bus = useMemo(() => createEventBus(), []);
  const omniBusyRef = useRef(false);
  const omniSessionIdRef = useRef(0);
  const localDevBridgeRef = useRef(null);
  const mediaSendInFlightRef = useRef({ audio: false, camera: false });
  const initialSeed = useMemo(() => createInitialRuntimeSeed(), []);
  const [robotRegistry, setRobotRegistry] = useState(initialSeed.registry);
  const [activeRobotId, setActiveRobotId] = useState(initialSeed.activeRobotId);
  const [adapterProfiles, setAdapterProfiles] = useState(initialSeed.adapterProfiles);
  const [robotProfile, setRobotProfile] = useState(initialSeed.robotProfile);
  const [robot, setRobot] = useState(initialSeed.robot);
  const [permissions, setPermissions] = useState(initialSeed.permissions);
  const [plugins, setPlugins] = useState(initialSeed.plugins);
  const [logs, setLogs] = useState([
    createLog('info', 'Demo Runtime v1.1.5 已启动', '当前是点击式调试工作台；Realtime Session State Machine、LocalDev Bridge、reply_audio_frame 和 interrupt 链路保持启用。'),
    createLog('info', 'Robot Identity Profile 已启用', '机器人昵称、唤醒名、默认角色、声音风格和称呼方式不再硬编码。'),
    createLog('info', '输入策略已固定', '原始语音流和摄像头关键帧直给 Omni；触摸/NFC 只作为事实事件。'),
    createLog('info', '输出策略已固定', 'reply_audio_frame 是 Omni 输出媒体帧；reply_text 只作为字幕、日志和调试；audio_frame 不会自动触发打断。'),
    createLog('info', '实时会话状态机已启用', '播放时麦克风可以保持监听，但只有显式 omni.interrupt.v1 才能打断当前输出。')
  ]);
  const [runtimeTrace, setRuntimeTrace] = useState([
    createTrace('RuntimeCore', 'boot', '初始化 Event Bus / RobotRegistry / RobotStateStore / ModelAdapterManager / PluginManager / ConnectionManager / OmniSessionBridge。'),
    createTrace('RobotRegistry', 'registry.loaded', '加载多机器人注册表；Web 控制台通过 active_robot_id 选择当前控制对象。'),
    createTrace('RobotProfileStore', 'profile.loaded', '按 robot_id 读取当前机器人身份档案，display_name 只作为展示名。')
  ]);
  const [recentEvents, setRecentEvents] = useState([]);
  const [networkQuality, setNetworkQuality] = useState('stable');
  const [realtimeSession, setRealtimeSession] = useState(createDefaultRealtimeSession);
  const [realtimeSessionState, setRealtimeSessionState] = useState(createDefaultRealtimeSessionState);
  const [omniPacket, setOmniPacket] = useState(null);
  const [lastOmniTurn, setLastOmniTurn] = useState(null);
  const [omniSessionStatus, setOmniSessionStatus] = useState({
    busy: false,
    action: null,
    label: '空闲'
  });
  const [localDevPreflight, setLocalDevPreflight] = useState(() => (
    createLocalDevPreflightState(initialSeed.activeRobotId, initialSeed.robot.adapterDetail?.endpoint)
  ));
  const [mediaChannels, setMediaChannels] = useState(createDefaultMediaChannels);
  const [realtimeOutput, setRealtimeOutput] = useState(createDefaultRealtimeOutputChannel);
  const [localDevBridge, setLocalDevBridge] = useState({
    status: 'idle',
    endpoint: initialSeed.robot.adapterDetail?.endpoint || '未配置',
    detail: 'LocalDev WebSocket 尚未连接。',
    error: null,
    updatedAt: null,
    requestId: null,
    lastPacketId: null,
    lastTurnId: null
  });
  const [cameraStatus, setCameraStatus] = useState({
    cameraActive: false,
    cameraPolicy: '摄像头未开启',
    frameCount: 0,
    lastFrameAt: '未采集',
    frameBufferSummary: []
  });

  const connectionSnapshot = useMemo(() => buildConnectionSnapshot(robot.mode, networkQuality), [robot.mode, networkQuality]);

  const framePolicy = useMemo(() => getFramePolicy({
    mode: robot.mode,
    state: robot.state,
    cameraDemand: robot.cameraDemand,
    connection: connectionSnapshot
  }), [robot.mode, robot.state, robot.cameraDemand, connectionSnapshot]);

  const realtimeRoute = useMemo(() => {
    const permissionMap = createPermissionMap(permissions);
    const voiceCloudGuard = checkPermission(permissionMap, 'voice.cloud_upload');
    return buildRealtimeRoute({
      mode: robot.mode,
      adapter: robot.adapterDetail,
      connection: connectionSnapshot,
      voiceCloudAllowed: voiceCloudGuard.allowed
    });
  }, [permissions, robot.mode, robot.adapterDetail, connectionSnapshot]);

  const realtimeReadiness = useMemo(() => buildRealtimeReadiness({
    robot,
    connection: connectionSnapshot,
    route: realtimeRoute,
    realtimeSession,
    realtimeSessionState,
    localDevPreflight,
    localDevBridge,
    mediaChannels,
    realtimeOutput
  }), [
    robot,
    connectionSnapshot,
    realtimeRoute,
    realtimeSession,
    realtimeSessionState,
    localDevPreflight,
    localDevBridge,
    mediaChannels,
    realtimeOutput
  ]);

  function pushLog(level, message, detail) {
    setLogs((prev) => [createLog(level, message, detail), ...prev].slice(0, 100));
  }

  function pushTrace(layer, event, detail) {
    setRuntimeTrace((prev) => [createTrace(layer, event, detail), ...prev].slice(0, 32));
  }

  function beginOmniSession(action, label) {
    if (omniBusyRef.current) {
      pushLog('warn', 'Omni 会话正忙', `${omniSessionStatus.label} 正在进行中，请等待当前回合结束后再发送新的输入。`);
      pushTrace('OmniSessionBridge', 'session.busy', `${action} blocked; current=${omniSessionStatus.action || 'unknown'}`);
      return false;
    }
    const sessionId = omniSessionIdRef.current + 1;
    omniSessionIdRef.current = sessionId;
    omniBusyRef.current = true;
    setOmniSessionStatus({ busy: true, action, label });
    return sessionId;
  }

  function isActiveOmniSession(sessionId) {
    return omniBusyRef.current && omniSessionIdRef.current === sessionId;
  }

  function endOmniSession(sessionId) {
    if (sessionId && omniSessionIdRef.current !== sessionId) return;
    omniBusyRef.current = false;
    setOmniSessionStatus({ busy: false, action: null, label: '空闲' });
  }

  function cancelOmniSession() {
    omniSessionIdRef.current += 1;
    endOmniSession();
  }

  function resetLocalDevPreflightForRobot(nextRobot, robotId = activeRobotId) {
    localDevBridgeRef.current?.close('robot_or_endpoint_changed');
    setLocalDevPreflight(createLocalDevPreflightState(robotId, nextRobot?.adapterDetail?.endpoint));
    setLocalDevBridge({
      status: 'idle',
      endpoint: nextRobot?.adapterDetail?.endpoint || '未配置',
      detail: 'LocalDev WebSocket 尚未连接。',
      error: null,
      updatedAt: null,
      requestId: null,
      lastPacketId: null,
      lastTurnId: null
    });
  }

  function currentPermissionMap() {
    return createPermissionMap(permissions);
  }

  function syncActiveRobotSummary(patch, robotId = activeRobotId) {
    setRobotRegistry((prev) => updateRegistryItem(prev, robotId, patch));
  }

  function getActiveSummary() {
    return findRobotSummary(robotRegistry, activeRobotId);
  }

  function resetPerRobotDebugState() {
    setRecentEvents([]);
    setOmniPacket(null);
    setLastOmniTurn(null);
    setRealtimeOutput(clearRealtimeOutputChannel());
    setMediaChannels(createDefaultMediaChannels());
    setCameraStatus({
      cameraActive: false,
      cameraPolicy: '摄像头未开启',
      frameCount: 0,
      lastFrameAt: '未采集',
      frameBufferSummary: []
    });
    setRealtimeSession(createDefaultRealtimeSession());
    setRealtimeSessionState(transitionRealtimeSessionState(null, 'RESET'));
    setNetworkQuality('stable');
    cancelOmniSession();
  }

  function loadRobotWorkspace(summary, registry = robotRegistry) {
    const runtimeConfig = readRobotRuntimeConfig(summary.robotId);
    const nextProfile = readRobotProfile(summary.robotId, summary);
    const nextRobot = createRobotFromRegistry(summary.robotId, registry, runtimeConfig.adapterProfiles);
    return { runtimeConfig, nextProfile, nextRobot };
  }

  function createCurrentOmniPacket() {
    return buildOmniInputPacket({
      robot,
      robotProfile,
      realtimeSession,
      realtimeRoute,
      framePolicy,
      cameraStatus,
      recentEvents,
      connection: connectionSnapshot,
      mediaChannels,
      permissions,
      plugins
    });
  }

  function handleOmniPacketBuild() {
    if (omniBusyRef.current) {
      pushLog('warn', '暂不能构建新的 Omni 输入包', `${omniSessionStatus.label} 正在进行中，避免覆盖当前发送中的输入包。`);
      pushTrace('OmniSessionBridge', 'packet.build.blocked', omniSessionStatus.action || 'busy');
      return omniPacket;
    }
    const packet = createCurrentOmniPacket();
    setOmniPacket(packet);
    pushLog('info', '已构建 Omni 输入包', summarizeOmniPacket(packet));
    pushTrace('OmniSessionBridge', 'packet.build', `${packet.packetId} → ${packet.routing.adapter}`);
    bus.emit({ type: 'omni.input_packet.built', packetId: packet.packetId, route: packet.routing.route });
    return packet;
  }

  async function applyOmniOutputTurn(turn, packet, source = 'omni_turn_simulator') {
    const baseRobot = {
      ...robot,
      expression: turn.expression?.expression || robot.expression,
      expressionSource: source,
      state: expressionToRobotState(turn.expression?.expression || robot.expression),
      lastSpeech: turn.reply_text || robot.lastSpeech,
      speechHistory: turn.reply_text ? [
        { id: turn.turnId, text: turn.reply_text, at: turn.createdAt, source },
        ...(robot.speechHistory || [])
      ].slice(0, 10) : robot.speechHistory
    };
    setLastOmniTurn(turn);
    setRobot(baseRobot);
    syncActiveRobotSummary({ expression: baseRobot.expression, state: baseRobot.state, lastSeen: '刚刚' });
    pushLog('success', source === 'local_dev_omni_adapter' ? 'LocalDev Omni 回合完成' : 'Omni 回合模拟完成', `${turn.expression?.expression} · ${turn.tool_intents?.length || 0} 个工具/插件意图 · ${turn.reply_text}`);
    pushTrace('ModelAdapterManager', 'adapter.output', `${turn.adapter} → ${turn.expression?.expression}`);
    if (turn.tool_intents?.length) {
      pushTrace('ToolIntentRouter', 'intent.received', turn.tool_intents.map((item) => item.intent).join(' / '));
      const routing = await routeToolIntents({
        robot: baseRobot,
        plugins,
        intents: turn.tool_intents,
        packet,
        permissionMap: currentPermissionMap()
      });
      setRobot(routing.robot);
      syncActiveRobotSummary({ expression: routing.robot.expression, state: routing.robot.state, lastSeen: '刚刚' });
      const routedText = routing.routed.map((item) => (
        item.pluginName
          ? `${item.intent} → ${item.pluginName}（${item.status}）`
          : `${item.intent} → ${item.reason}`
      )).join(' / ');
      pushLog(routing.guarded ? 'warn' : 'info', 'ToolIntentRouter 已处理 Omni 工具意图', routedText);
      pushTrace('ToolIntentRouter', 'intent.routed', routedText);
      if (routing.executed || routing.guarded) {
        pushTrace('ToolEngine', 'mock.actions', `executed=${routing.executed}; guarded=${routing.guarded}`);
      }
    }
    setRealtimeSessionState((prev) => transitionRealtimeSessionState(prev, 'OUTPUT_TURN_RECEIVED', {
      turnId: turn.turnId,
      requestId: turn.transport?.requestId || turn.requestId || null,
      reason: '已收到 omni.output_turn.v1；reply_text 只作为字幕/日志/调试。'
    }));
    bus.emit({ type: 'omni.output_turn.received', turnId: turn.turnId, expression: turn.expression?.expression });
  }

  async function handleOmniTurnSimulate() {
    const sessionId = beginOmniSession('mock_turn', '模拟 Omni 回合');
    if (!sessionId) return;
    const packet = omniPacket || createCurrentOmniPacket();
    try {
      if (!omniPacket) setOmniPacket(packet);
      const turn = simulateOmniTurn(packet);
      if (!isActiveOmniSession(sessionId)) return;
      await applyOmniOutputTurn(turn, packet, 'omni_turn_simulator');
    } finally {
      endOmniSession(sessionId);
    }
  }

  async function handleLocalDevAdapterTest() {
    const endpoint = robot.adapterDetail?.endpoint;
    const endpointLabel = getLocalDevEndpointLabel(endpoint);
    if (robot.mode !== 'local_dev') {
      setLocalDevPreflight(markLocalDevPreflightSkipped(activeRobotId, endpoint, robot.mode));
      pushLog('warn', 'LocalDev Adapter 测试被跳过', `当前 robot_id=${activeRobotId} 的模式是 ${robot.mode}，请先切换到本地调试。`);
      pushTrace('LocalDevOmniAdapter', 'test.skipped', `${activeRobotId}; mode=${robot.mode}`);
      return;
    }

    setLocalDevPreflight(markLocalDevPreflightChecking(activeRobotId, endpoint));
    pushLog('info', '测试 LocalDev Adapter 连接', `${endpointLabel}；只做 WebSocket 握手，不发送音频、关键帧或输入包。`);
    pushTrace('LocalDevOmniAdapter', 'test.start', `${activeRobotId}; ${endpointLabel}`);

    if (!localDevBridgeRef.current) {
      localDevBridgeRef.current = createLocalDevOmniBridge(handleLocalDevBridgeStatus);
    }

    const result = await localDevBridgeRef.current.connect(endpoint, 5000);
    if (!result.ok) {
      setLocalDevPreflight(markLocalDevPreflightFailed(activeRobotId, endpoint, result.error));
      pushLog('warn', 'LocalDev Adapter 测试失败', result.error);
      pushTrace('LocalDevOmniAdapter', 'test.failed', result.error);
      return;
    }

    setLocalDevPreflight(markLocalDevPreflightConnected(activeRobotId, endpoint, result));
    pushLog('success', 'LocalDev Adapter 测试通过', `${endpointLabel}；${result.reused ? '复用已有连接' : 'WebSocket 握手成功'}。`);
    pushTrace('LocalDevOmniAdapter', result.reused ? 'test.reused' : 'test.connected', `${activeRobotId}; ${endpointLabel}`);
  }

  async function handleLocalDevOmniSend() {
    const sessionId = beginOmniSession('local_dev_send', '发送到 LocalDev Adapter');
    if (!sessionId) return;
    const packet = omniPacket || createCurrentOmniPacket();
    try {
      if (!omniPacket) setOmniPacket(packet);

      if (robot.mode !== 'local_dev') {
        pushLog('warn', 'LocalDev Adapter 发送被阻止', `当前 robot_id=${activeRobotId} 的模式是 ${robot.mode}，请先切换到本地调试模式。`);
        pushTrace('LocalDevOmniAdapter', 'send.blocked', `${activeRobotId}; mode=${robot.mode}`);
        setLocalDevPreflight(markLocalDevPreflightSkipped(activeRobotId, robot.adapterDetail?.endpoint, robot.mode));
        return;
      }

      const endpoint = robot.adapterDetail?.endpoint;
      const endpointLabel = getLocalDevEndpointLabel(endpoint);
      const needsFirstCheck = shouldRunLocalDevFirstCheck(localDevPreflight, { robotId: activeRobotId, endpoint });
      if (needsFirstCheck) {
        setLocalDevPreflight(markLocalDevPreflightChecking(
          activeRobotId,
          endpoint,
          '首次对话正在用真实输入包检查 LocalDev Adapter 连接。'
        ));
      }
      pushLog('info', '发送 Omni 输入包到 LocalDev Adapter', `${packet.packetId} → ${endpoint}`);
      pushTrace('LocalDevOmniAdapter', 'packet.send', `${packet.packetId} → ${endpoint}`);
      setRealtimeSessionState((prev) => transitionRealtimeSessionState(prev, 'INPUT_PACKET_SENT', {
        packetId: packet.packetId,
        reason: '已发送 omni.input_packet.v1，等待 LocalDev Mock 输出状态。'
      }));
      if (!localDevBridgeRef.current) {
        localDevBridgeRef.current = createLocalDevOmniBridge(handleLocalDevBridgeStatus);
      }
      const result = await localDevBridgeRef.current.send(packet, endpoint);
      if (!isActiveOmniSession(sessionId)) return;

      if (!result.ok) {
        setLocalDevPreflight(markLocalDevPreflightFailed(
          activeRobotId,
          endpoint,
          result.error,
          '首次连接检查未通过；后续发送不会额外预检，但真实发送失败仍会更新此状态。'
        ));
        pushLog('warn', 'LocalDev Adapter 未连接', `${result.error}。请确认本地 Qwen-Omni 兼容服务正在监听该 WebSocket。`);
        pushTrace('LocalDevOmniAdapter', 'send.failed', result.error);
        return;
      }

      setLocalDevPreflight(markLocalDevPreflightConnected(
        activeRobotId,
        endpoint,
        result,
        result.reused ? '已复用保持中的 LocalDev WebSocket 会话。' : '首次连接检查已通过；本次输出来自 LocalDev Adapter。'
      ));
      pushTrace('LocalDevOmniAdapter', result.reused ? 'socket.reused' : 'socket.connected', `${result.requestId || 'no_request_id'}; packet=${packet.packetId}`);
      await applyOmniOutputTurn(result.turn, packet, 'local_dev_omni_adapter');
    } finally {
      endOmniSession(sessionId);
    }
  }


  function handleLocalDevOmniDisconnect() {
    if (!localDevBridgeRef.current) {
      setLocalDevBridge((prev) => ({
        ...prev,
        status: 'idle',
        detail: 'LocalDev WebSocket 尚未连接，无需断开。',
        updatedAt: new Date().toLocaleTimeString('zh-CN', { hour12: false })
      }));
      return;
    }
    localDevBridgeRef.current.close('manual_disconnect');
    setRealtimeOutput(clearRealtimeOutputChannel());
    setRealtimeSessionState((prev) => transitionRealtimeSessionState(prev, 'SESSION_CLOSE', { reason: 'LocalDev WebSocket 手动断开。' }));
    pushLog('info', 'LocalDev Adapter 已手动断开', '只断开 WebSocket 调试会话，不影响 Runtime、插件、权限或机器人状态。');
    pushTrace('LocalDevOmniAdapter', 'socket.manual_disconnect', activeRobotId);
  }

  function handleOmniTurnClear() {
    if (omniBusyRef.current) {
      pushLog('warn', '暂不能清空 Omni 回合', `${omniSessionStatus.label} 正在进行中，避免丢失当前回包上下文。`);
      pushTrace('OmniSessionBridge', 'session.clear.blocked', omniSessionStatus.action || 'busy');
      return;
    }
    setOmniPacket(null);
    setLastOmniTurn(null);
    setRealtimeOutput(clearRealtimeOutputChannel());
    setRealtimeSessionState((prev) => transitionRealtimeSessionState(prev, 'RESET', { reason: '清空 Omni 调试回合。' }));
    pushLog('info', 'Omni 调试回合已清空', '仅清除前端调试面板，不影响机器人状态、插件和权限。');
    pushTrace('OmniSessionBridge', 'session.clear', 'clear debug packet/output');
  }

  function handleRobotSelect(robotId) {
    const summary = findRobotSummary(robotRegistry, robotId);
    const { runtimeConfig, nextProfile, nextRobot } = loadRobotWorkspace(summary, robotRegistry);
    setActiveRobotId(summary.robotId);
    saveActiveRobotId(summary.robotId);
    setAdapterProfiles(runtimeConfig.adapterProfiles);
    setPermissions(runtimeConfig.permissions);
    setPlugins(runtimeConfig.plugins);
    setRobotProfile(nextProfile);
    setRobot(nextRobot);
    resetLocalDevPreflightForRobot(nextRobot, summary.robotId);
    resetPerRobotDebugState();
    pushLog('info', `切换控制机器人：${summary.displayName}`, `${summary.robotId} · 加载专属权限/插件/模型配置。`);
    pushTrace('RobotRegistry', 'active_robot.change', `${summary.robotId} → ${summary.displayName}; runtime_config.loaded`);
    bus.emit({ type: 'robot.registry.active_changed', robotId: summary.robotId });
  }

  function handleRobotAdd() {
    const nextItem = createRobotRegistryItem(robotRegistry.length);
    const nextRegistry = saveRobotRegistry([...robotRegistry, nextItem]);
    const runtimeConfig = readRobotRuntimeConfig(nextItem.robotId);
    setRobotRegistry(nextRegistry);
    saveActiveRobotId(nextItem.robotId);
    setActiveRobotId(nextItem.robotId);
    setAdapterProfiles(runtimeConfig.adapterProfiles);
    setPermissions(runtimeConfig.permissions);
    setPlugins(runtimeConfig.plugins);
    const nextRobot = createRobotFromRegistry(nextItem.robotId, nextRegistry, runtimeConfig.adapterProfiles);
    setRobotProfile(readRobotProfile(nextItem.robotId, nextItem));
    setRobot(nextRobot);
    resetLocalDevPreflightForRobot(nextRobot, nextItem.robotId);
    resetPerRobotDebugState();
    pushLog('success', `新增机器人实例：${nextItem.displayName}`, `${nextItem.robotId} 已加入 Robot Registry，并初始化专属 Runtime 配置。`);
    pushTrace('RobotRegistry', 'robot.add', `${nextItem.robotId} created; runtime_config.initialized`);
  }

  function handleRobotDelete(robotId) {
    const target = findRobotSummary(robotRegistry, robotId);
    const result = removeRegistryItem(robotRegistry, robotId);

    if (!result.removed) {
      const message = result.reason === 'last_robot_guard'
        ? '至少需要保留一个机器人实例，不能删除最后一个 robot_id。'
        : '没有找到要删除的机器人实例。';
      pushLog('warn', '删除机器人被阻止', message);
      pushTrace('RobotRegistry', 'robot.delete.blocked', `${robotId}: ${result.reason}`);
      return;
    }

    deleteRobotProfile(result.removed.robotId);
    deleteRobotRuntimeConfig(result.removed.robotId);
    setRobotRegistry(result.registry);

    const deletingActiveRobot = result.removed.robotId === activeRobotId;
    const nextActiveRobotId = deletingActiveRobot ? result.nextActiveRobotId : activeRobotId;
    const nextSummary = findRobotSummary(result.registry, nextActiveRobotId);
    const { runtimeConfig, nextProfile, nextRobot } = loadRobotWorkspace(nextSummary, result.registry);

    saveActiveRobotId(nextSummary.robotId);
    setActiveRobotId(nextSummary.robotId);
    setAdapterProfiles(runtimeConfig.adapterProfiles);
    setPermissions(runtimeConfig.permissions);
    setPlugins(runtimeConfig.plugins);
    setRobotProfile(nextProfile);
    setRobot(nextRobot);
    resetLocalDevPreflightForRobot(nextRobot, nextSummary.robotId);
    resetPerRobotDebugState();

    pushLog('warn', `删除机器人实例：${target.displayName}`, `${result.removed.robotId} 已移除，本地身份档案和 Runtime 配置也已清理；当前 active robot：${nextSummary.displayName}。`);
    pushTrace('RobotRegistry', 'robot.delete', `${result.removed.robotId} removed; runtime_config.deleted; active=${nextSummary.robotId}`);
    bus.emit({ type: 'robot.registry.deleted', robotId: result.removed.robotId, nextActiveRobotId: nextSummary.robotId });
  }

  function handleRobotProfileSave(nextProfile) {
    const saved = saveRobotProfile(nextProfile, activeRobotId);
    setRobotProfile(saved);
    setRobot((prev) => ({
      ...applyProfileToRobot(prev, saved),
      role: saved.defaultRole || prev.role,
      lastSpeech: `你好，我是 ${saved.displayName}。`
    }));
    syncActiveRobotSummary({ displayName: saved.displayName, wakeName: saved.wakeName, lastSeen: '刚刚' });
    pushLog('success', `身份档案已保存：${saved.displayName}`, `robot_id：${activeRobotId}；唤醒名：${saved.wakeName}；声音：${saved.voiceStyle}；称呼用户：${saved.ownerCalling}`);
    pushTrace('RobotProfileStore', 'profile.updated', `${activeRobotId}; display_name=${saved.displayName}; wake_name=${saved.wakeName}`);
    bus.emit({ type: 'robot.profile.updated', robotId: activeRobotId, profile: saved });
  }

  function handleRobotProfileReset() {
    const summary = getActiveSummary();
    const defaults = resetRobotProfile(activeRobotId, summary);
    setRobotProfile(defaults);
    setRobot((prev) => ({
      ...applyProfileToRobot(prev, defaults),
      role: defaults.defaultRole,
      lastSpeech: `你好，我是 ${defaults.displayName}。`
    }));
    syncActiveRobotSummary({ displayName: defaults.displayName, wakeName: defaults.wakeName, lastSeen: '刚刚' });
    pushLog('info', '身份档案已重置', `恢复当前 robot_id=${activeRobotId} 的默认展示身份；内部 robot_id 没有变化。`);
    pushTrace('RobotProfileStore', 'profile.reset', `${activeRobotId}: 重置 display_name / wake_name / voice_style 等可变身份字段。`);
  }

  function handleState(expression, detail) {
    const nextState = expressionToRobotState(expression);
    setRobot((prev) => ({ ...prev, expression, expressionSource: 'manual_test', state: nextState }));
    syncActiveRobotSummary({ expression, state: nextState, lastSeen: '刚刚' });
    pushLog('info', `表情切换：${expression}`, detail);
    pushTrace('ExpressionEngine', 'expression.update', `${expression} ← manual_test`);
    bus.emit({ type: 'expression.update', expression, source: 'manual_test' });
  }

  function handleMode(mode, label) {
    const option = getConnectionModeOption(mode);
    const nextMode = option.adapterMode || option.key;
    const nextLabel = label || option.label;
    const online = option.requiresNetwork !== false;
    const adapter = getAdapterForMode(nextMode, adapterProfiles);
    setRobot((prev) => ({
      ...prev,
      mode: nextMode,
      network: getNetworkLabel(nextMode),
      online,
      adapter: adapter.name,
      adapterDetail: adapter,
      cameraDemand: nextMode === 'offline_pet' ? 'local_only' : prev.cameraDemand
    }));
    resetLocalDevPreflightForRobot({ adapterDetail: adapter }, activeRobotId);
    syncActiveRobotSummary({ mode: nextMode, network: getNetworkLabel(nextMode), adapterName: adapter.name, online, lastSeen: '刚刚' });
    pushLog('warn', `运行模式切换：${nextLabel}`, `${adapter.name} · ${adapter.providerLabel} · ${adapter.endpoint}`);
    pushTrace('RuntimeModeManager', 'mode.change', `${nextMode} → ${adapter.name}`);
    pushTrace('ConnectionManager', 'profile.selected', `${getNetworkLabel(nextMode)} · ${nextMode} · ${option.productScenario}`);
    bus.emit({ type: 'mode.change', mode: nextMode, adapter: adapter.name, connectionMode: option.key });
  }


  function handleNetworkQualityChange(qualityKey) {
    setNetworkQuality(qualityKey);
    const snapshot = buildConnectionSnapshot(robot.mode, qualityKey);
    setRobot((prev) => ({
      ...prev,
      online: snapshot.online,
      cameraDemand: snapshot.status === 'degraded' && prev.cameraDemand === 'idle_buffer' ? 'network_conservative' : prev.cameraDemand
    }));
    syncActiveRobotSummary({ online: snapshot.online, lastSeen: snapshot.online ? '刚刚' : '离线演示' });
    pushLog(snapshot.status === 'offline' ? 'warn' : 'info', `网络质量模拟：${snapshot.qualityLabel}`, snapshot.qualityNote);
    pushTrace('ConnectionManager', 'network.quality', `${snapshot.status} · ${snapshot.label} · packetLoss=${snapshot.packetLoss}%`);
  }

  function handleAutoFallback() {
    const snapshot = buildConnectionSnapshot(robot.mode, networkQuality);
    if (snapshot.status === 'offline') {
      handleMode('offline_pet', '无网络基础宠物模式');
      pushLog('warn', '自动降级到基础宠物模式', 'Connection Manager 检测到断网：保留表情、触摸、NFC、预设动作和基础插件。');
      pushTrace('ConnectionManager', 'fallback.offline_pet', 'offline → OfflinePetEngine');
      return;
    }
    if (snapshot.status === 'degraded') {
      setRobot((prev) => ({ ...prev, cameraDemand: 'network_conservative' }));
      syncActiveRobotSummary({ lastSeen: '刚刚' });
      pushLog('warn', '进入音频优先策略', '网络延迟或丢包偏高：保持原始音频链路，降低关键帧频率。');
      pushTrace('ConnectionManager', 'fallback.audio_first', 'degraded network → low frame cadence');
      return;
    }
    pushLog('success', '连接状态稳定', '无需降级，继续当前 Runtime Mode。');
    pushTrace('ConnectionManager', 'fallback.none', 'connection stable');
  }



  function handleLocalDevBridgeStatus(status) {
    setLocalDevBridge((prev) => ({ ...prev, ...status }));
    if (status.mediaAck) {
      setMediaChannels((prev) => applyMediaAck(prev, status.mediaAck));
      return;
    }

    if (status.interrupt) {
      setRealtimeOutput((prev) => applyRealtimeOutputInterrupt(prev, status.interrupt));
      setRealtimeSessionState((prev) => transitionRealtimeSessionState(prev, 'INTERRUPT_ACK', {
        turnId: status.interrupt.turnId,
        requestId: status.interrupt.requestId,
        reason: status.interrupt.reason || 'interrupt acknowledged'
      }));
      pushTrace('RealtimeOutputChannel', 'interrupt.acknowledged', status.interrupt.interruptId || 'no_interrupt_id');
      return;
    }
    if (status.outputState) {
      setRealtimeOutput((prev) => applyRealtimeOutputState(prev, status.outputState));
      const outputState = status.outputState.state;
      setRealtimeSessionState((prev) => transitionRealtimeSessionState(prev, 'OUTPUT_STATE', {
        outputState: status.outputState,
        turnId: status.outputState.turnId,
        requestId: status.outputState.requestId,
        reason: status.outputState.reason || `output_state=${outputState}`
      }));
      if (outputState === 'thinking' || outputState === 'speaking' || outputState === 'finished' || outputState === 'interrupted') {
        setRobot((prev) => {
          if (outputState === 'thinking') return { ...prev, state: 'thinking', expressionSource: 'local_dev_realtime_output' };
          if (outputState === 'speaking') return { ...prev, state: 'speaking', expressionSource: 'local_dev_realtime_output' };
          if ((outputState === 'finished' || outputState === 'interrupted') && prev.state === 'speaking') return { ...prev, state: 'idle', expressionSource: 'local_dev_realtime_output' };
          return prev;
        });
      }
      pushTrace('RealtimeOutputChannel', 'output.state', `${status.outputState.turnId || 'no_turn'} → ${outputState}`);
      return;
    }
    if (status.replyAudioFrame) {
      setRealtimeOutput((prev) => applyReplyAudioFrame(prev, status.replyAudioFrame));
      setRealtimeSessionState((prev) => transitionRealtimeSessionState(prev, 'REPLY_AUDIO_FRAME_RECEIVED', {
        replyAudioFrame: status.replyAudioFrame,
        turnId: status.replyAudioFrame.turnId,
        requestId: status.replyAudioFrame.requestId,
        reason: `收到 reply_audio_frame seq=${status.replyAudioFrame.sequence ?? 'unknown'}`
      }));
      setRobot((prev) => ({ ...prev, state: 'speaking', expressionSource: 'reply_audio_frame' }));
      syncActiveRobotSummary({ state: 'speaking', lastSeen: '刚刚' });
      pushTrace('RealtimeOutputChannel', 'reply_audio_frame.received', `${status.replyAudioFrame.turnId || 'no_turn'} seq=${status.replyAudioFrame.sequence ?? 'unknown'} bytes=${status.replyAudioFrame.audio?.byteLength || 0}`);
      return;
    }
    if (status.status === 'failed' && status.error) {
      setRealtimeOutput((prev) => applyRealtimeOutputError(prev, status.error));
      setRealtimeSessionState((prev) => transitionRealtimeSessionState(prev, 'ERROR', { reason: status.error }));
    }
  }

  function handleReplyAudioFramePlayed(frameId) {
    if (!frameId) return;
    setRealtimeOutput((prev) => {
      const next = markReplyAudioFramePlayed(prev, frameId);
      if (!next.playbackActive) {
        setRobot((current) => (current.state === 'speaking' ? { ...current, state: 'idle', expressionSource: 'reply_audio_frame.played' } : current));
        syncActiveRobotSummary({ state: 'idle', lastSeen: '刚刚' });
      }
      return next;
    });
    setRealtimeSessionState((prev) => transitionRealtimeSessionState(prev, 'REPLY_AUDIO_FRAME_PLAYED', {
      frameId,
      outputDone: !(realtimeOutput?.queuedAudioFrames || []).some((frame) => frame.frameId !== frameId) && Boolean(realtimeOutput?.finalFrameReceived),
      reason: 'reply_audio_frame 已由 Web Audio 播放器消费。'
    }));
    pushTrace('RealtimeOutputChannel', 'reply_audio_frame.played', frameId);
  }


  async function handleRealtimeOutputInterrupt() {
    const currentOutput = realtimeOutput || createDefaultRealtimeOutputChannel();
    const interruptSeed = {
      turnId: currentOutput.turnId,
      robotId: activeRobotId,
      displayName: robot.name,
      reason: 'user_barge_in',
      source: 'client_runtime_manual_button',
      target: 'current_output'
    };

    setRealtimeOutput((prev) => applyRealtimeOutputInterrupt(prev, interruptSeed));
    setRealtimeSessionState((prev) => transitionRealtimeSessionState(prev, 'INTERRUPT_LOCAL', {
      turnId: interruptSeed.turnId,
      reason: '手动模拟用户插话；清空播放队列并发送 omni.interrupt.v1。'
    }));
    setRobot((prev) => ({
      ...prev,
      state: realtimeSession.active && realtimeSession.micActive ? 'listening' : 'idle',
      expression: realtimeSession.active && realtimeSession.micActive ? 'listening' : prev.expression,
      expressionSource: 'manual_barge_in_interrupt'
    }));
    syncActiveRobotSummary({ state: realtimeSession.active && realtimeSession.micActive ? 'listening' : 'idle', lastSeen: '刚刚' });
    pushLog('warn', '模拟用户插话：已中断当前输出', '发送 omni.interrupt.v1；清空本地 reply_audio_frame 播放队列。audio_frame 仍只是输入媒体，不会自动触发打断。');
    pushTrace('RealtimeOutputChannel', 'interrupt.local', `${interruptSeed.turnId || 'no_turn'} · user_barge_in`);

    const endpoint = robot.adapterDetail?.endpoint;
    const connected = localDevBridgeRef.current?.getStatus?.().connected;
    if (robot.mode === 'local_dev' && endpoint && connected) {
      const result = await localDevBridgeRef.current.sendInterrupt(interruptSeed, endpoint, 5000);
      if (!result.ok) {
        setLocalDevBridge((prev) => ({ ...prev, status: 'failed', detail: 'interrupt 发送失败。', error: result.error, updatedAt: new Date().toLocaleTimeString('zh-CN', { hour12: false }) }));
        setRealtimeOutput((prev) => applyRealtimeOutputError(prev, result.error));
        pushTrace('RealtimeOutputChannel', 'interrupt.send.failed', result.error);
        return;
      }
      pushTrace('RealtimeOutputChannel', 'interrupt.sent', `${result.interrupt?.interruptId || 'no_interrupt_id'} → ${endpoint}`);
      return;
    }

    setLocalDevBridge((prev) => ({
      ...prev,
      status: 'interrupt_local_only',
      detail: '已本地停止播放；LocalDev WebSocket 未连接，因此没有发送 omni.interrupt.v1 到服务端。',
      updatedAt: new Date().toLocaleTimeString('zh-CN', { hour12: false })
    }));
    pushTrace('RealtimeOutputChannel', 'interrupt.local_only', 'no connected LocalDev bridge');
  }

  async function maybeSendMediaFrameToLocalDev(frame) {
    const endpoint = robot.adapterDetail?.endpoint;
    const canSend = robot.mode === 'local_dev' && endpoint && localDevBridgeRef.current && localDevBridgeRef.current.getStatus().connected;
    if (!canSend) return { sent: false, reason: 'local_dev_not_connected' };
    const mediaKind = frame.schema === 'omni.camera_frame.v1' ? 'camera' : 'audio';
    if (mediaSendInFlightRef.current[mediaKind]) {
      pushTrace('LocalDevMediaChannel', 'frame.send.skipped', `${frame.schema} / ${frame.frameId}; previous_${mediaKind}_send_in_flight`);
      return { sent: false, reason: 'media_send_in_flight', skipped: true };
    }
    mediaSendInFlightRef.current[mediaKind] = true;
    try {
      const result = await localDevBridgeRef.current.sendMediaFrame(frame, endpoint, 1500);
      if (!result.ok) {
        setMediaChannels((prev) => applyMediaError(prev, result.error));
        setLocalDevBridge((prev) => ({ ...prev, status: 'failed', detail: '媒体帧发送失败。', error: result.error, updatedAt: new Date().toLocaleTimeString('zh-CN', { hour12: false }) }));
        pushTrace('LocalDevMediaChannel', 'frame.send.failed', `${frame.schema}; ${result.error}`);
        setRealtimeSessionState((prev) => transitionRealtimeSessionState(prev, 'ERROR', { reason: result.error }));
        return { sent: false, reason: result.error };
      }
      pushTrace('LocalDevMediaChannel', 'frame.send', `${frame.schema} / ${frame.frameId}`);
      return { sent: true, result };
    } finally {
      mediaSendInFlightRef.current[mediaKind] = false;
    }
  }

  async function handleAudioFrame(frameSeed) {
    const frame = createAudioFrame({
      robot,
      session: realtimeSession,
      route: realtimeRoute,
      level: frameSeed?.level,
      sequence: frameSeed?.sequence || 0,
      payloadBase64: frameSeed?.payloadBase64 || null,
      byteLength: frameSeed?.byteLength || 0,
      sampleCount: frameSeed?.sampleCount || 0,
      durationMs: frameSeed?.durationMs || 250,
      codec: frameSeed?.codec || 'pcm_float32',
      channels: frameSeed?.channels || 1
    });
    const sent = await maybeSendMediaFrameToLocalDev(frame);
    setMediaChannels((prev) => updateMediaChannelStats(prev, frame, sent.sent ? 'sent' : 'observed'));
    setRealtimeSessionState((prev) => transitionRealtimeSessionState(prev, 'INPUT_AUDIO_FRAME', {
      sent: sent.sent,
      frameId: frame.frameId,
      reason: sent.sent ? '麦克风 PCM 输入帧已发送到 LocalDev。' : '麦克风 PCM 输入帧仅本地 observed。'
    }));
  }

  async function handleCameraFrame(frameSeed) {
    const frame = createCameraFrame({ robot, frame: frameSeed, framePolicy, sequence: frameSeed?.sequence || 0 });
    const sent = await maybeSendMediaFrameToLocalDev(frame);
    setMediaChannels((prev) => updateMediaChannelStats(prev, frame, sent.sent ? 'sent' : 'observed'));
    setRealtimeSessionState((prev) => transitionRealtimeSessionState(prev, 'INPUT_CAMERA_FRAME', {
      sent: sent.sent,
      frameId: frame.frameId,
      reason: sent.sent ? '摄像头 JPEG 关键帧已发送到 LocalDev。' : '摄像头 JPEG 关键帧仅本地 observed。'
    }));
  }

  function handleRealtimeSessionStatus(status) {
    setRealtimeSession((prev) => ({ ...prev, ...status }));
    if (status.guardReason) {
      pushLog('warn', '实时音频启动被阻止', status.guardDetail || status.guardReason);
      pushTrace('RealtimeSession', `audio.guard.${status.guardReason}`, status.guardDetail || activeRobotId);
    }
    setRobot((prev) => {
      const nextState = status.active && status.micActive ? 'listening' : prev.state === 'listening' ? 'idle' : prev.state;
      const nextExpression = status.active && status.micActive ? 'listening' : prev.state === 'listening' ? 'idle' : prev.expression;
      return {
        ...prev,
        state: nextState,
        expression: nextExpression,
        expressionSource: status.active ? 'realtime_audio_stream' : prev.expressionSource,
        cameraDemand: status.active ? 'speaking_context' : prev.cameraDemand
      };
    });
    if (typeof status.active === 'boolean') {
      setRealtimeSessionState((prev) => transitionRealtimeSessionState(prev, status.active ? 'SESSION_OPEN' : 'SESSION_CLOSE', {
        sessionId: status.sessionId,
        reason: status.active ? '实时音频输入已开启；麦克风可在模型输出时继续监听。' : '实时音频输入已停止。'
      }));
      syncActiveRobotSummary({ expression: status.active && status.micActive ? 'listening' : robot.expression, state: status.active && status.micActive ? 'listening' : robot.state, online: true, lastSeen: '刚刚' });
      pushLog(status.active ? 'success' : 'info', status.active ? '实时音频流已开启' : '实时音频流已停止', status.audioInput || 'raw_audio_stream');
      pushTrace('RealtimeSession', status.active ? 'audio.open' : 'audio.close', status.route || realtimeRoute.route);
    }
  }

  function handlePermissionChange(key, status) {
    setPermissions((prev) => {
      const next = prev.map((item) => item.key === key ? { ...item, status } : item);
      saveRobotPermissions(activeRobotId, next);
      return next;
    });
    pushLog('info', `权限变更：${key}`, `robot_id=${activeRobotId}；新状态：${status}`);
    pushTrace('PermissionEngine', 'permission.update', `${activeRobotId}; ${key}=${status}`);
  }

  function handleModelProviderUpdate(key, profile) {
    const nextProfiles = { ...adapterProfiles, [key]: { ...adapterProfiles[key], ...profile } };
    setAdapterProfiles(nextProfiles);
    saveRobotAdapterProfiles(activeRobotId, nextProfiles);
    if (robot.mode === key) {
      const merged = getAdapterForMode(key, nextProfiles);
      setRobot((prev) => ({ ...prev, adapter: merged.name, adapterDetail: merged }));
      resetLocalDevPreflightForRobot({ adapterDetail: merged }, activeRobotId);
    }
    pushLog('success', `保存模型配置：${profile.name}`, `robot_id=${activeRobotId}；${profile.providerLabel} · ${profile.modelId} · ${profile.endpoint}`);
    pushTrace('ModelAdapterManager', 'adapter.saved', `${activeRobotId}; ${key}: ${profile.modelId}`);
  }

  function handleModelProviderReset() {
    const config = resetRobotAdapterProfiles(activeRobotId);
    setAdapterProfiles(config.adapterProfiles);
    const adapter = getAdapterForMode(robot.mode, config.adapterProfiles);
    setRobot((prev) => ({ ...prev, adapter: adapter.name, adapterDetail: adapter }));
    resetLocalDevPreflightForRobot({ adapterDetail: adapter }, activeRobotId);
    pushLog('info', '模型配置已重置', `robot_id=${activeRobotId}；恢复默认 Local / Cloud / SelfHosted / Offline Adapter 占位配置。`);
    pushTrace('ModelAdapterManager', 'adapter.reset', `${activeRobotId}; reset adapter profiles`);
  }

  function handleModelProviderTest(key, profile) {
    pushLog('info', `测试连接：${profile.name}`, `robot_id=${activeRobotId}；Mock 检查通过：${profile.transport}；真实连接将在后端 Runtime / Robot Gateway 实现。`);
    pushTrace('ModelAdapterManager', 'adapter.test', `${activeRobotId}; ${key}: ${profile.endpoint}`);
    bus.emit({ type: 'adapter.test', adapter: key, endpoint: profile.endpoint });
  }

  function handlePluginToggle(id) {
    const plugin = plugins.find((item) => item.id === id);
    setPlugins((prev) => {
      const next = prev.map((item) => item.id === id ? normalizePlugin({ ...item, enabled: !item.enabled }) : item);
      saveRobotPlugins(activeRobotId, next);
      return next;
    });
    pushLog('info', `插件启用状态变更：${plugin?.name || id}`, `robot_id=${activeRobotId}；${plugin?.enabled ? '已关闭插件' : '已启用插件'}`);
    pushTrace('PluginManager', 'plugin.toggle', `${activeRobotId}; ${plugin?.name || id}: ${plugin?.enabled ? 'off' : 'on'}`);
  }

  function handlePluginDelete(id) {
    const plugin = plugins.find((item) => item.id === id);
    setPlugins((prev) => {
      const next = prev.filter((item) => item.id !== id);
      saveRobotPlugins(activeRobotId, next);
      return next;
    });
    pushLog('warn', `删除插件：${plugin?.name || id}`, `插件已从 robot_id=${activeRobotId} 的 Runtime 配置移除。`);
    pushTrace('PluginManager', 'plugin.delete', `${activeRobotId}; ${plugin?.name || id}`);
  }

  async function handlePluginRun(id) {
    const plugin = plugins.find((item) => item.id === id);
    if (!plugin) return;
    const expression = getExpressionFromPlugin(plugin, 'thinking');
    const result = await executePluginActions(
      { ...robot, expression, state: expressionToRobotState(expression), expressionSource: 'plugin_preview' },
      plugin,
      { event: { type: 'manual.test', label: '手动测试插件' }, permissionMap: currentPermissionMap(), robot }
    );
    setRobot(result.robot);
    pushLog(result.skipped.length ? 'warn' : 'success', `插件测试：${plugin.name}`, `robot_id=${activeRobotId}；动作序列：${result.summary}`);
    pushTrace('PluginManager', 'plugin.run', `${activeRobotId}; ${plugin.name}: ${result.skipped.length ? 'guarded' : 'ok'}`);
  }

  function handlePluginAdd(plugin) {
    const normalized = normalizePlugin(plugin);
    setPlugins((prev) => {
      const next = [normalized, ...prev];
      saveRobotPlugins(activeRobotId, next);
      return next;
    });
    pushLog('success', `新增插件：${normalized.name}`, `robot_id=${activeRobotId}；${summarizeManifest(normalized)}`);
    pushTrace('PluginManager', 'plugin.add', `${activeRobotId}; ${normalized.name}: ${normalized.runtime}`);
  }

  function getEventPermission(event) {
    if (event.type === 'touch.event') return 'touch.read';
    if (event.type === 'nfc.detected') return 'nfc.read';
    if (event.type === 'visual.query') return 'camera.read';
    if (event.type === 'voice.intent') return 'voice.input';
    return null;
  }

  async function handleEvent(event) {
    const emitted = bus.emit(event);
    setRecentEvents((prev) => [emitted, ...prev].slice(0, 24));
    pushTrace('EventBus', emitted.type, emitted.label || emitted.intent || emitted.tagId || 'fact_event');

    const eventPermission = getEventPermission(emitted);
    if (eventPermission) {
      const guard = checkPermission(currentPermissionMap(), eventPermission);
      if (!guard.allowed) {
        pushLog('warn', `事实事件被权限中心阻止：${event.label || event.type}`, `${eventPermission}：${describePermissionStatus(guard.status)}`);
        pushTrace('PermissionEngine', 'event.blocked', `${eventPermission}: ${guard.status}`);
        return;
      }
    }

    const plugin = matchPlugin(plugins, emitted);
    const expression = inferExpressionFromEvent(emitted, robot.expression);
    const nextCameraDemand = emitted.type === 'visual.query'
      ? 'high_res_current_plus_recent'
      : emitted.type === 'touch.event' || emitted.type === 'nfc.detected'
        ? 'event_burst'
        : robot.cameraDemand;

    if (!plugin) {
      setRobot((prev) => ({
        ...prev,
        expression,
        expressionSource: 'runtime_event_hint',
        state: expressionToRobotState(expression),
        cameraDemand: nextCameraDemand
      }));
      syncActiveRobotSummary({ expression, state: expressionToRobotState(expression), lastSeen: '刚刚' });
      const detail = emitted.type === 'visual.query'
        ? '进入“高清当前帧 + 最近几帧”策略，但不做视觉情绪摘要。'
        : '未匹配到启用插件，仅更新机器人表情/状态提示，不给用户贴情绪标签。';
      pushLog('warn', `收到事实事件：${event.label || event.type}`, detail);
      return;
    }

    const result = await executePluginActions({
      ...robot,
      expression,
      expressionSource: 'runtime_event_hint',
      state: expressionToRobotState(expression),
      cameraDemand: nextCameraDemand
    }, plugin, { event: emitted, permissionMap: currentPermissionMap(), robot });
    setRobot(result.robot);
    syncActiveRobotSummary({ expression: result.robot.expression, state: result.robot.state, lastSeen: '刚刚' });

    pushLog(result.skipped.length ? 'warn' : 'success', `插件触发：${plugin.name}`, `事件：${event.label || event.type}；动作序列：${result.summary}`);
    pushTrace('PluginEngine', 'plugin.triggered', `${plugin.name}: ${result.skipped.length ? 'partial/blocked' : 'executed'}`);
  }

  return {
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
    adapterProfiles,
    omniPacket,
    lastOmniTurn,
    omniSessionStatus,
    localDevPreflight,
    localDevBridge,
    mediaChannels,
    realtimeOutput,
    setCameraStatus,
    actions: {
      handleRobotSelect,
      handleRobotAdd,
      handleRobotDelete,
      handleRobotProfileSave,
      handleRobotProfileReset,
      handleState,
      handleMode,
      handlePermissionChange,
      handleNetworkQualityChange,
      handleAutoFallback,
      handleRealtimeSessionStatus,
      handleAudioFrame,
      handleCameraFrame,
      handleOmniPacketBuild,
      handleOmniTurnSimulate,
      handleLocalDevAdapterTest,
      handleLocalDevOmniSend,
      handleLocalDevOmniDisconnect,
      handleOmniTurnClear,
      handleReplyAudioFramePlayed,
      handleRealtimeOutputInterrupt,
      handleModelProviderUpdate,
      handleModelProviderReset,
      handleModelProviderTest,
      handlePluginToggle,
      handlePluginDelete,
      handlePluginRun,
      handlePluginAdd,
      handleEvent
    }
  };
}
