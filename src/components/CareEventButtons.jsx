const CARE_EVENTS = [
  { label: '鎽告懜澶?', event: { type: 'touch.event', area: 'head', label: '鎽告懜澶?' } },
  { label: '鎹忔崗鑴?', event: { type: 'touch.event', area: 'face', label: '鎹忔崗鑴?' } },
  { label: '鎷嶆媿鑳?', event: { type: 'touch.event', area: 'back', label: '鎷嶆媿鑳?' } },
  { label: '鍠傚皬楗洟', event: { type: 'nfc.detected', label: 'food', tagId: 'food' } },
  { label: '鎴寸潯甯?', event: { type: 'nfc.detected', label: 'sleep_hat', tagId: 'sleep_hat' } },
  { label: '鎴村洿宸?', event: { type: 'nfc.detected', label: 'scarf', tagId: 'scarf' } },
  { label: '宸ヤ綔澶箙', event: { type: 'pet.work_session.long', label: '宸ヤ綔澶箙' } },
  { label: '鐢甸噺浣庝簡', event: { type: 'pet.battery.low', label: '鐢甸噺浣庝簡' } },
  { label: '闂溂闅愮', event: { type: 'pet.camera.closed', label: '闂溂闅愮' } },
  { label: '鐢ㄦ埛鍥炴潵浜?', event: { type: 'pet.user.returned', label: '鐢ㄦ埛鍥炴潵浜?' } }
];

export default function CareEventButtons({ onEvent }) {
  return (
    <section className="panel care-event-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Care Events</p>
          <h2>touch / NFC / care simulation</h2>
        </div>
      </div>
      <div className="care-event-grid">
        {CARE_EVENTS.map((item) => (
          <button type="button" key={item.label} onClick={() => onEvent?.(item.event)}>
            {item.label}
          </button>
        ))}
      </div>
    </section>
  );
}
