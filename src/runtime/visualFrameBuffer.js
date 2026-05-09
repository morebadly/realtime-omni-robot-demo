export function summarizeVisualFrameBuffer({ cameraStatus, framePolicy, cloudMode, cameraCloudPermission }) {
  const active = Boolean(cameraStatus?.cameraActive);
  const recentFrames = (cameraStatus?.frameBufferSummary || []).slice(0, 4).map((frame, index) => ({
    index,
    capturedAt: frame.capturedAt,
    width: frame.width,
    height: frame.height,
    policy: frame.policy || framePolicy?.key,
    source: 'browser_camera_mock'
  }));

  if (!active) {
    return {
      available: false,
      countInBuffer: 0,
      lastFrameAt: 'camera_off',
      selectorPolicy: framePolicy?.key,
      uploadPlan: 'none',
      sendToCloud: false,
      selectedFrames: [],
      bufferSummary: {
        source: 'browser_camera_mock',
        strategy: 'camera_off',
        retainedFrames: 0
      }
    };
  }

  return {
    available: true,
    countInBuffer: cameraStatus.frameCount || 0,
    retainedFrames: cameraStatus.bufferedFrames || recentFrames.length,
    lastFrameAt: cameraStatus.lastFrameAt || 'unknown',
    selectorPolicy: framePolicy?.key,
    uploadPlan: framePolicy?.upload,
    captureWidth: framePolicy?.captureWidth,
    jpegQuality: framePolicy?.jpegQuality,
    sendToCloud: Boolean(cloudMode && framePolicy?.cloudAllowed && cameraCloudPermission !== 'disabled'),
    selectedFrames: recentFrames,
    bufferSummary: {
      source: 'browser_camera_mock',
      strategy: framePolicy?.label,
      retainedFrames: cameraStatus.bufferedFrames || recentFrames.length,
      selectorRationale: framePolicy?.rationale
    }
  };
}
