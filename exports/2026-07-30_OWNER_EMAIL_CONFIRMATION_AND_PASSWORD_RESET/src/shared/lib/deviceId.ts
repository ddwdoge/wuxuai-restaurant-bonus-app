const deviceStorageKey = "wuxuai-web-device-id";
let inMemoryDeviceId: string | null = null;

export function getWebDeviceId() {
  if (inMemoryDeviceId) return inMemoryDeviceId;
  try {
    const existing = localStorage.getItem(deviceStorageKey);
    if (existing) {
      inMemoryDeviceId = existing;
      return existing;
    }
  } catch {
    // Safari kann lokalen Speicher blockieren; die Tab-Sitzung bleibt trotzdem stabil.
  }

  const nextDeviceId = globalThis.crypto?.randomUUID?.() ?? `web-${Math.random().toString(36).slice(2)}-${Date.now()}`;
  inMemoryDeviceId = nextDeviceId;
  try {
    localStorage.setItem(deviceStorageKey, nextDeviceId);
  } catch {
    // Die Registrierung meldet separat, wenn der Kundenzugang nicht gespeichert werden kann.
  }
  return nextDeviceId;
}
