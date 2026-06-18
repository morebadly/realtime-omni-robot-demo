import { useEffect, useRef, useState } from 'react';

const DEFAULT_FRAME_POLICY = {
  label: 'local preview 1fps',
  intervalMs: 1000,
  captureWidth: 640,
  jpegQuality: 0.84,
  upload: 'local_debug_only',
  rationale: 'Local preview keeps a short keyframe cache and does not infer emotion.'
};

export default function CameraPreview({ framePolicy = DEFAULT_FRAME_POLICY, onStatus, onFrame, compact = false }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const frameBufferRef = useRef([]);
  const frameSeqRef = useRef(0);
  const [enabled, setEnabled] = useState(false);
  const [error, setError] = useState('');
  const [frameCount, setFrameCount] = useState(0);
  const [lastFrameAt, setLastFrameAt] = useState('not captured');
  const [thumb, setThumb] = useState('');

  useEffect(() => {
    onStatus?.({
      cameraActive: enabled,
      cameraPolicy: enabled ? framePolicy.label : 'camera closed',
      framePolicy,
      frameCount,
      lastFrameAt,
      bufferedFrames: frameBufferRef.current.length,
      frameBufferSummary: frameBufferRef.current.map(({ capturedAt, width, height, policy, uploadStatus }) => ({
        capturedAt,
        width,
        height,
        policy,
        uploadStatus
      }))
    });
  }, [enabled, framePolicy, frameCount, lastFrameAt, onStatus]);

  useEffect(() => {
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    const timer = window.setInterval(() => captureFrame(), framePolicy.intervalMs || 1000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, framePolicy.intervalMs, framePolicy.captureWidth, framePolicy.jpegQuality]);

  function emitPetEyeFrame(seed) {
    onFrame?.({
      schema: 'cloudgenie.pet_eye_frame.v1',
      frameId: seed.frameId || `pet-eye-${Date.now()}`,
      capturedAt: seed.capturedAt || new Date().toISOString(),
      width: seed.width || 0,
      height: seed.height || 0,
      policy: seed.policy || framePolicy.key || framePolicy.cadence || 'local_preview',
      localPreviewDataUrl: seed.localPreviewDataUrl || '',
      rawDataUrl: seed.rawDataUrl || '',
      dataUrl: seed.rawDataUrl || '',
      uploadStatus: seed.uploadStatus || 'local_only',
      cameraActive: seed.cameraActive,
      debugOmniFrameAllowed: false,
      sequence: seed.sequence || 0
    });
  }

  async function startCamera() {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user'
        },
        audio: false
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setEnabled(true);
      emitPetEyeFrame({ cameraActive: true, frameId: `pet-eye-open-${Date.now()}` });
      setTimeout(() => captureFrame(), 350);
    } catch (err) {
      setError('Unable to open camera preview. Check browser camera permission.');
      setEnabled(false);
      emitPetEyeFrame({ cameraActive: false, frameId: `pet-eye-error-${Date.now()}` });
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setEnabled(false);
    emitPetEyeFrame({ cameraActive: false, frameId: `pet-eye-closed-${Date.now()}` });
  }

  function captureFrame() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) return;

    const width = framePolicy.captureWidth || 640;
    const height = Math.round((video.videoHeight / video.videoWidth) * width) || 720;
    const quality = framePolicy.jpegQuality || 0.84;

    const rawCanvas = document.createElement('canvas');
    rawCanvas.width = width;
    rawCanvas.height = height;
    rawCanvas.getContext('2d').drawImage(video, 0, 0, width, height);

    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.save();
    ctx.scale(-1, 1);
    ctx.drawImage(video, -width, 0, width, height);
    ctx.restore();

    const rawDataUrl = rawCanvas.toDataURL('image/jpeg', quality);
    const localPreviewDataUrl = canvas.toDataURL('image/jpeg', quality);
    const capturedAt = new Date().toISOString();
    frameSeqRef.current += 1;
    const frame = {
      schema: 'cloudgenie.pet_eye_frame.v1',
      frameId: `pet-eye-${frameSeqRef.current}`,
      capturedAt,
      width,
      height,
      policy: framePolicy.key || framePolicy.cadence || 'local_preview',
      localPreviewDataUrl,
      rawDataUrl,
      dataUrl: rawDataUrl,
      uploadStatus: compact ? 'local_only' : 'cloud_allowed_but_not_sent',
      cameraActive: true,
      debugOmniFrameAllowed: !compact,
      sequence: frameSeqRef.current
    };
    frameBufferRef.current = [frame, ...frameBufferRef.current].slice(0, 8);
    onFrame?.(frame);
    setThumb(localPreviewDataUrl);
    setFrameCount((count) => count + 1);
    setLastFrameAt(capturedAt);
  }

  return (
    <section className={`camera-card ${compact ? 'camera-card-compact' : ''}`}>
      <div className="camera-header">
        <div>
          <p className="eyebrow">{compact ? 'Pet Camera' : 'Visual Frame Buffer'}</p>
          <h2>{compact ? 'pet-eye local preview control' : 'Debug camera keyframe capture'}</h2>
        </div>
        <span className={enabled ? 'tag camera-live' : 'tag'}>{enabled ? 'camera live' : 'camera off'}</span>
      </div>

      <div className="camera-body">
        <div className="camera-video-wrap">
          <video ref={videoRef} className="camera-video" playsInline muted />
          {!enabled && (
            <div className="camera-placeholder">
              {compact
                ? 'Open local preview to refresh the pet-eye window. Upload remains local_only by default.'
                : 'Open camera preview to capture local keyframes. This does not infer emotion.'}
            </div>
          )}
        </div>
        <div className="frame-panel">
          <div className="frame-thumb">
            {thumb ? <img src={thumb} alt="latest local preview frame" /> : <span>No keyframe</span>}
          </div>
          <small>latest keyframe</small>
          <strong>{lastFrameAt}</strong>
        </div>
      </div>

      <div className="camera-actions">
        {enabled ? (
          <button type="button" onClick={stopCamera}>Close camera</button>
        ) : (
          <button type="button" onClick={startCamera}>Open local preview</button>
        )}
        <button type="button" onClick={captureFrame} disabled={!enabled}>Capture keyframe</button>
      </div>

      <div className="camera-meta">
        <div><small>frame policy</small><strong>{framePolicy.label}</strong></div>
        <div><small>buffered frames</small><strong>{frameCount}</strong></div>
        <div><small>latest cache</small><strong>{frameBufferRef.current.length} / 8</strong></div>
        <div><small>upload status</small><strong>local_only</strong></div>
        <div><small>pet-eye schema</small><strong>cloudgenie.pet_eye_frame.v1</strong></div>
      </div>
      <p className="camera-policy-note">{framePolicy.rationale}</p>
      {error && <p className="camera-error">{error}</p>}
      <canvas ref={canvasRef} className="hidden-canvas" />
    </section>
  );
}
