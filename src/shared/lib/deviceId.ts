const deviceStorageKey = "wuxuai-web-device-id";

export function getWebDeviceId() {
  const existing = localStorage.getItem(deviceStorageKey);
  if (existing) return existing;

  const nextDeviceId = globalThis.crypto?.randomUUID?.() ?? `web-${Math.random().toString(36).slice(2)}-${Date.now()}`;
  localStorage.setItem(deviceStorageKey, nextDeviceId);
  return nextDeviceId;
}
