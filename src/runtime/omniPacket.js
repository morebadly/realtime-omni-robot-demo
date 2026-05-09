import { summarizeVisualFrameBuffer } from './visualFrameBuffer';

function compactEvent(event = {}) {
  return {
    id: event.id,
    type: event.type,
    label: event.label || null,
    area: event.area || null,
    gesture: event.gesture || null,
    tagId: event.tagId || null,
    intent: event.intent || null,
    timestamp: event.timestamp || event.createdAt || null
  };
}

function summarizePermission(permission = {}) {
  return {
    key: permission.key,
    status: permission.status,
    group: permission.group
  };
}

function summarizePlugin(plugin = {}) {
  return {
    id: plugin.id,
    name: plugin.name,
    enabled: Boolean(plugin.enabled),
    trigger: plugin.trigger,
    runtime: plugin.runtime || 'mock',
    permissions: plugin.permissions || [],
    actions: plugin.runtime === 'code_sandbox' ? ['code_sandbox.returned_actions'] : (plugin.actions || []),
    manifest: plugin.manifest || null
  };
}

function createPacketId() {
  const rand = Math.random().toString(36).slice(2, 8);
  return `omni_${Date.now().toString(36)}_${rand}`;
}

export function buildOmniInputPacket({
  robot,
  robotProfile,
  realtimeSession,
  realtimeRoute,
  framePolicy,
  cameraStatus,
  recentEvents,
  connection,
  mediaChannels,
  permissions,
  plugins
}) {
  const cloudMode = ['wifi_cloud', 'cellular_cloud', 'self_hosted_cloud'].includes(robot?.mode);
  const cameraCloudPermission = permissions?.find((item) => item.key === 'camera.cloud_upload')?.status || 'disabled';
  const visualInput = summarizeVisualFrameBuffer({
    cameraStatus,
    framePolicy,
    cloudMode,
    cameraCloudPermission
  });

  return {
    packetId: createPacketId(),
    schema: 'omni.input_packet.v1',
    createdAt: new Date().toISOString(),
    routing: {
      mode: robot?.mode,
      adapter: robot?.adapter,
      adapterEndpoint: robot?.adapterDetail?.endpoint,
      adapterModel: robot?.adapterDetail?.modelId,
      route: realtimeRoute?.route,
      canStream: Boolean(realtimeRoute?.canStream),
      cloudMode,
      connectionStatus: connection?.status,
      transport: connection?.transport
    },
    identity: {
      robotId: robot?.robotId,
      displayName: robotProfile?.displayName || robot?.name,
      wakeName: robotProfile?.wakeName || robot?.wakeName,
      role: robot?.role,
      defaultRole: robotProfile?.defaultRole,
      voiceStyle: robotProfile?.voiceStyle || robot?.voiceStyle,
      ownerCalling: robotProfile?.ownerCalling || robot?.ownerCalling,
      personalityPrompt: robotProfile?.personalityPrompt || ''
    },
    input: {
      audio: {
        primary: 'raw_audio_stream',
        active: Boolean(realtimeSession?.active && realtimeSession?.micActive),
        route: realtimeRoute?.route,
        sampleRate: realtimeSession?.sampleRate || null,
        level: Number(realtimeSession?.level || 0),
        asrTextUsage: 'subtitles_logs_debug_plugin_keywords_only',
        mediaChannel: {
          schema: 'omni.audio_frame.v1',
          observedFrames: mediaChannels?.audio?.observed || 0,
          sentFrames: mediaChannels?.audio?.sent || 0,
          lastFrameId: mediaChannels?.audio?.lastFrame?.frameId || null,
          payloadPolicy: mediaChannels?.policy || 'metadata_first_payload_ready'
        }
      },
      visual: {
        ...visualInput,
        mediaChannel: {
          schema: 'omni.camera_frame.v1',
          observedFrames: mediaChannels?.camera?.observed || 0,
          sentFrames: mediaChannels?.camera?.sent || 0,
          lastFrameId: mediaChannels?.camera?.lastFrame?.frameId || null,
          payloadPolicy: mediaChannels?.policy || 'metadata_first_payload_ready'
        }
      },
      factEvents: (recentEvents || []).slice(0, 8).map(compactEvent),
      text: {
        directUserText: null,
        reason: 'Demo keeps ASR/text as辅助信息；主输入仍是音频流、关键帧和事实事件。'
      }
    },
    runtimeContext: {
      expression: robot?.expression,
      expressionSource: robot?.expressionSource,
      state: robot?.state,
      motion: robot?.motion,
      framePolicy: {
        key: framePolicy?.key,
        label: framePolicy?.label,
        cadence: framePolicy?.cadence,
        intervalMs: framePolicy?.intervalMs,
        rationale: framePolicy?.rationale
      },
      connection: {
        label: connection?.label,
        latencyMs: connection?.latencyMs,
        jitterMs: connection?.jitterMs,
        packetLoss: connection?.packetLoss,
        signal: connection?.signal,
        uploadBudget: connection?.uploadBudget,
        audioRoute: connection?.audioRoute
      },
      mediaChannels: {
        protocol: mediaChannels?.protocol || 'omni.media_channel.v1',
        audio: { observed: mediaChannels?.audio?.observed || 0, sent: mediaChannels?.audio?.sent || 0, lastFrameId: mediaChannels?.audio?.lastFrame?.frameId || null },
        camera: { observed: mediaChannels?.camera?.observed || 0, sent: mediaChannels?.camera?.sent || 0, lastFrameId: mediaChannels?.camera?.lastFrame?.frameId || null },
        localDevAckCount: mediaChannels?.localDev?.ackCount || 0
      },
      permissions: (permissions || []).map(summarizePermission),
      enabledPlugins: (plugins || []).filter((plugin) => plugin.enabled).map(summarizePlugin)
    },
    guardrails: {
      noFrontendEmotionSummary: true,
      touchAndNfcAreFactEventsOnly: true,
      toolExecutionMustPassPermissionEngine: true,
      userCodeMustReturnActionIntentOnly: true
    }
  };
}

export function summarizeOmniPacket(packet) {
  if (!packet) return '尚未构建 Omni 输入包';
  const eventCount = packet.input?.factEvents?.length || 0;
  const pluginCount = packet.runtimeContext?.enabledPlugins?.length || 0;
  const audio = packet.input?.audio?.active ? '音频流已开启' : '音频流未开启';
  const visual = packet.input?.visual?.available ? `${packet.input.visual.uploadPlan} · ${packet.input.visual.countInBuffer} frames` : '摄像头未开启';
  const media = packet.runtimeContext?.mediaChannels;
  const mediaSummary = media ? ` · media a${media.audio?.sent || 0}/${media.audio?.observed || 0} c${media.camera?.sent || 0}/${media.camera?.observed || 0}` : '';
  return `${packet.routing?.adapter} · ${audio} · ${visual} · ${eventCount} 个事实事件 · ${pluginCount} 个启用插件${mediaSummary}`;
}
