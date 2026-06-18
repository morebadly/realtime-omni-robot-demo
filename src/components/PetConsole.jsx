import RobotFace from './RobotFace';
import PetEyeView from './PetEyeView';
import CareEventButtons from './CareEventButtons';
import CameraPreview from './CameraPreview';

function PetStat({ label, value }) {
  return (
    <div>
      <small>{label}</small>
      <strong>{value}</strong>
    </div>
  );
}

export default function PetConsole({
  robot,
  pet,
  petAction,
  petActions,
  petEyeFrame,
  restReminder,
  cameraStatus,
  framePolicy,
  connectionSnapshot,
  setCameraStatus,
  onCameraFrame,
  onPetEvent
}) {
  return (
    <main className="pet-console">
      <section className="pet-main">
        <div className="pet-console-title">
          <div>
            <p className="eyebrow">CloudGenie Pet Console</p>
            <h2>{robot.name}</h2>
          </div>
          <span className="tag">non-verbal pet</span>
        </div>

        <RobotFace
          expression={petAction?.expression || pet?.expression || 'idle_eyes'}
          state={pet?.petState || 'idle'}
          icon={petAction?.icon || pet?.icon || 'none'}
          speaking={false}
        />

        <div className="pet-state-strip">
          <PetStat label="pet state" value={pet?.petState || 'idle'} />
          <PetStat label="expression" value={petAction?.expression || pet?.expression || 'idle_eyes'} />
          <PetStat label="motion" value={petAction?.motion || pet?.motion || 'none'} />
          <PetStat label="sound" value={petAction?.sound || pet?.sound || 'none'} />
        </div>

        <div className="pet-status-chips">
          <span>speechForbidden=true</span>
          <span>{connectionSnapshot?.status || 'local'}</span>
          <span>{cameraStatus?.cameraActive ? 'camera open' : 'privacy closed'}</span>
          <span>{restReminder?.active ? 'rest expression active' : 'rest idle'}</span>
        </div>
      </section>

      <section className="pet-side">
        <PetEyeView petEyeFrame={petEyeFrame} cameraStatus={cameraStatus} framePolicy={framePolicy} />
        <CareEventButtons onEvent={onPetEvent} />
      </section>

      <section className="pet-debug-local">
        <CameraPreview
          robot={robot}
          framePolicy={framePolicy}
          onStatus={setCameraStatus}
          onFrame={onCameraFrame}
          compact
        />
        <div className="panel pet-action-list">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Pet Actions</p>
              <h2>local behavior tokens</h2>
            </div>
          </div>
          {petActions.length === 0 ? (
            <p className="muted">No care event yet.</p>
          ) : (
            <div className="event-stack">
              {petActions.slice(0, 8).map((action) => (
                <div className="event-pill" key={`${action.createdAt}-${action.reasonCode}`}>
                  {action.reasonCode} / {action.expression} / {action.sound}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
