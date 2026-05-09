export function createEventBus() {
  const listeners = new Map();

  function on(type, handler) {
    const list = listeners.get(type) || [];
    list.push(handler);
    listeners.set(type, list);
    return () => {
      const next = (listeners.get(type) || []).filter((item) => item !== handler);
      listeners.set(type, next);
    };
  }

  function emit(event) {
    const payload = {
      id: crypto.randomUUID?.() || String(Date.now() + Math.random()),
      timestamp: new Date().toISOString(),
      ...event
    };
    const exact = listeners.get(payload.type) || [];
    const all = listeners.get('*') || [];
    [...exact, ...all].forEach((handler) => handler(payload));
    return payload;
  }

  return { on, emit };
}
