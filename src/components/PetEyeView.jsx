export default function PetEyeView({ petEyeFrame, cameraStatus, framePolicy }) {
  const cameraOpen = Boolean(cameraStatus?.cameraActive);
  const preview = petEyeFrame?.localPreviewDataUrl;
  const capturedAt = petEyeFrame?.capturedAt || cameraStatus?.lastFrameAt || '鏈噰闆?';
  const uploadStatus = petEyeFrame?.uploadStatus || 'local_only';
  const receipt = petEyeFrame?.uploadReceipt || null;

  return (
    <section className="pet-eye-view">
      <div className="pet-section-header">
        <div>
          <p className="eyebrow">Pet Eye View</p>
          <h2>瀹犵墿鐪间腑鐨勪綘</h2>
        </div>
        <span className={cameraOpen ? 'tag camera-live' : 'tag'}>{cameraOpen ? 'camera open' : 'camera closed'}</span>
      </div>

      <div className="pet-eye-frame">
        {cameraOpen && preview ? (
          <img src={preview} alt="鏈€杩戝叧閿抚" />
        ) : (
          <div className="pet-eye-placeholder">
            <span />
            <strong>privacy closed</strong>
          </div>
        )}
      </div>

      <div className="pet-eye-meta">
        <div><small>鏈湴棰勮</small><strong>{preview ? 'ready' : 'empty'}</strong></div>
        <div><small>鏄惁涓婁紶浜戠</small><strong>{uploadStatus === 'local_only' ? '鏈笂浼?' : uploadStatus}</strong></div>
        <div><small>last captured</small><strong>{capturedAt}</strong></div>
        <div><small>frame policy</small><strong>{framePolicy?.cadence || framePolicy?.key || 'local_preview'}</strong></div>
      </div>

      <div className="pet-upload-receipt">
        <small>upload receipt</small>
        {receipt ? (
          <strong>{receipt.provider} / {receipt.frameId || 'no_frame'} / {receipt.uploaded ? 'sent' : 'not_sent'} / {receipt.reason}</strong>
        ) : (
          <strong>no frame sent</strong>
        )}
      </div>
    </section>
  );
}
