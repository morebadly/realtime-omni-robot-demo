import { useEffect, useRef, useState } from 'react';

const DEFAULT_FRAME_POLICY = {
  label: '本地调试：待机 1fps / 关键帧缓存开启',
  intervalMs: 1000,
  captureWidth: 640,
  jpegQuality: 0.84,
  upload: 'local_debug_only',
  rationale: '待机时只维护最近几秒缓存，减少无意义上传。'
};

export default function CameraPreview({ robot, framePolicy = DEFAULT_FRAME_POLICY, onStatus, onFrame }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const frameBufferRef = useRef([]);
  const frameSeqRef = useRef(0);
  const [enabled, setEnabled] = useState(false);
  const [error, setError] = useState('');
  const [frameCount, setFrameCount] = useState(0);
  const [lastFrameAt, setLastFrameAt] = useState('未采集');
  const [thumb, setThumb] = useState('');

  useEffect(() => {
    onStatus?.({
      cameraActive: enabled,
      cameraPolicy: enabled ? framePolicy.label : '摄像头未开启',
      framePolicy,
      frameCount,
      lastFrameAt,
      bufferedFrames: frameBufferRef.current.length,
      frameBufferSummary: frameBufferRef.current.map(({ capturedAt, width, height, policy }) => ({
        capturedAt,
        width,
        height,
        policy
      }))
    });
  }, [enabled, framePolicy, frameCount, lastFrameAt, onStatus]);

  useEffect(() => {
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const timer = window.setInterval(() => captureFrame(), framePolicy.intervalMs || 1000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, framePolicy.intervalMs, framePolicy.captureWidth, framePolicy.jpegQuality]);

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
      setTimeout(() => captureFrame(), 350);
    } catch (err) {
      setError('无法打开摄像头。请检查浏览器权限，或确认摄像头没有被其他软件占用。');
      setEnabled(false);
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setEnabled(false);
  }

  function captureFrame() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) return;

    const width = framePolicy.captureWidth || 640;
    const height = Math.round((video.videoHeight / video.videoWidth) * width) || 720;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.save();
    ctx.scale(-1, 1);
    ctx.drawImage(video, -width, 0, width, height);
    ctx.restore();

    const dataUrl = canvas.toDataURL('image/jpeg', framePolicy.jpegQuality || 0.84);
    const capturedAt = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    frameSeqRef.current += 1;
    const frame = { dataUrl, capturedAt, width, height, policy: framePolicy.key, sequence: frameSeqRef.current };
    frameBufferRef.current = [frame, ...frameBufferRef.current].slice(0, 8);
    onFrame?.(frame);
    setThumb(dataUrl);
    setFrameCount((count) => count + 1);
    setLastFrameAt(capturedAt);
  }

  return (
    <section className="camera-card">
      <div className="camera-header">
        <div>
          <p className="eyebrow">Visual Frame Buffer</p>
          <h2>机器人摄像头关键帧策略，当前用浏览器摄像头模拟</h2>
        </div>
        <span className={enabled ? 'tag camera-live' : 'tag'}>{enabled ? 'camera live' : 'camera off'}</span>
      </div>

      <div className="camera-body">
        <div className="camera-video-wrap">
          <video ref={videoRef} className="camera-video" playsInline muted />
          {!enabled && <div className="camera-placeholder">点击“开启摄像头预览”后，这里会显示机器人看到的画面。关键帧由 Runtime 的 FramePolicyEngine 决定，不先做情绪摘要。</div>}
        </div>
        <div className="frame-panel">
          <div className="frame-thumb">
            {thumb ? <img src={thumb} alt="最近关键帧" /> : <span>暂无关键帧</span>}
          </div>
          <small>最近关键帧</small>
          <strong>{lastFrameAt}</strong>
        </div>
      </div>

      <div className="camera-actions">
        {enabled ? (
          <button onClick={stopCamera}>关闭摄像头</button>
        ) : (
          <button onClick={startCamera}>开启摄像头预览</button>
        )}
        <button onClick={captureFrame} disabled={!enabled}>手动抓取关键帧</button>
      </div>

      <div className="camera-meta">
        <div><small>关键帧策略</small><strong>{framePolicy.label}</strong></div>
        <div><small>已缓存帧数</small><strong>{frameCount}</strong></div>
        <div><small>最近帧缓存</small><strong>{frameBufferRef.current.length} / 8</strong></div>
        <div><small>上传策略</small><strong>{framePolicy.upload}</strong></div>
        <div><small>媒体帧协议</small><strong>omni.camera_frame.v1</strong></div>
      </div>
      <p className="camera-policy-note">{framePolicy.rationale}</p>
      {error && <p className="camera-error">{error}</p>}
      <canvas ref={canvasRef} className="hidden-canvas" />
    </section>
  );
}
