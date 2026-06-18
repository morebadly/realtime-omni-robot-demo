function StatusTile({ label, value, detail }) {
  return (
    <div className="context-status-tile">
      <small>{label}</small>
      <strong>{value}</strong>
      {detail && <p>{detail}</p>}
    </div>
  );
}

export default function VisibleContext({
  robot,
  pet,
  petAction,
  petEyeFrame,
  recentEvents,
  cameraStatus,
  framePolicy,
  connection,
  mediaChannels,
  providerGate,
  providerHealth,
  providerHandshake,
  providerAudioGate,
  providerCameraGate
}) {
  const cameraObserved = mediaChannels?.camera?.observed || 0;
  const cameraSent = mediaChannels?.camera?.sent || 0;
  const uploadStatus = petEyeFrame?.uploadStatus || 'local_only';

  return (
    <section className="panel context-panel compact-context-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Visible Context</p>
          <h2>瀹犵墿鐜板湪鐪嬪埌浜嗕粈涔?</h2>
        </div>
        <span className="tag">pet facts only</span>
      </div>

      <div className="context-status-grid">
        <StatusTile
          label="pet state"
          value={pet?.petState || 'idle'}
          detail={`${petAction?.expression || pet?.expression || 'idle_eyes'} / ${petAction?.motion || 'none'} / ${petAction?.sound || 'none'}`}
        />
        <StatusTile
          label="鏄惁涓婁紶浜戠"
          value={uploadStatus === 'local_only' ? '鏈笂浼?' : uploadStatus}
          detail={`camera sent/observed=${cameraSent}/${cameraObserved}`}
        />
        <StatusTile
          label="camera"
          value={cameraStatus?.cameraActive ? 'open' : 'closed'}
          detail={`${framePolicy?.cadence || framePolicy?.key || 'local preview'} / ${cameraStatus?.lastFrameAt || 'none'}`}
        />
        <StatusTile
          label="fallback"
          value={providerGate?.fallbackProviderId || 'localdev_mock'}
          detail={`provider=${providerGate?.providerId || 'localdev_mock'} / status=${providerGate?.status || 'mock_ready'}`}
        />
        <StatusTile
          label="realtime socket"
          value={providerHandshake?.canOpenRealtimeSocket ? 'allowed' : 'blocked'}
          detail={`audio=${providerHealth?.canSendAudio ? 'yes' : 'no'} / camera=${providerHealth?.canSendCamera ? 'yes' : 'no'} / billing=${providerHealth?.canStartBillingSession ? 'yes' : 'no'}`}
        />
        <StatusTile
          label="dry-run gates"
          value="locked"
          detail={`audio=${providerAudioGate?.canSendRealAudio ? 'real' : 'no real'} / camera=${providerCameraGate?.canSendRealCamera ? 'real' : 'no real'}`}
        />
      </div>

      <details className="context-details" open>
        <summary>瀹冩牴鎹摢浜涗簨瀹炲仛鍑哄弽搴?</summary>
        <ul>
          <li>Touch/NFC/care events are factual inputs only.</li>
          <li>Pet State Engine outputs behavior tokens: expression, motion, local non-verbal sound label, and icon.</li>
          <li>No pet action contains speech, TTS, reply_text playback, or a human-language utterance.</li>
          <li>Pet-eye frames default to local_only and are not uploaded by the live UI.</li>
          <li>No user emotion diagnosis is inferred or displayed.</li>
        </ul>
      </details>

      <details className="context-details">
        <summary>Safety boundary</summary>
        <ul>
          <li>No real provider socket, real cloud upload, realtime billing, browser-held secret, email, AC, calendar, hardware, or TTS is enabled here.</li>
          <li>Raw provider key values, masked keys, prefixes, lengths, hashes, tokens, secrets, and Authorization values must not enter frontend state, logs, Visible Context, or local storage.</li>
          <li>LocalDev Mock fallback remains required.</li>
        </ul>
      </details>

      <h3>Recent factual events</h3>
      <div className="event-stack">
        {recentEvents.length === 0 ? <p className="muted">No recent events.</p> : recentEvents.slice(0, 8).map((event) => (
          <div className="event-pill" key={event.id || `${event.type}-${event.at || event.label}`}>
            {event.type} / {event.label || event.area || event.tagId || 'event'}
          </div>
        ))}
      </div>

      <p className="cloud-note">
        {robot.name} uses display_name for UI. Internal identity remains robot_id={robot.robotId || 'active'}.
      </p>
    </section>
  );
}
