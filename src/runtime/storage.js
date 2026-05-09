export function safeReadJson(key, fallback = null) {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (error) {
    console.warn(`[runtime/storage] read failed: ${key}`, error);
    return fallback;
  }
}

export function safeWriteJson(key, value) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn(`[runtime/storage] write failed: ${key}`, error);
  }
}

export function safeRemove(key) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(key);
  } catch (error) {
    console.warn(`[runtime/storage] remove failed: ${key}`, error);
  }
}
