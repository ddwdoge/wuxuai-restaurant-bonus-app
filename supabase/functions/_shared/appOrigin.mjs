const REMOTE_APP_ORIGINS = new Set([
  "https://app.bonus.wuxuaisbi.com",
  "https://staging-app.bonus.wuxuaisbi.com",
]);

const LOCAL_DEVELOPMENT_ORIGINS = Object.freeze([
  "http://127.0.0.1:5173",
  "http://127.0.0.1:4192",
]);

export function configuredAppOrigin(value) {
  const input = typeof value === "string" ? value.trim() : "";
  if (!input) return null;

  try {
    const url = new URL(input);
    if (
      url.origin !== input.replace(/\/$/, "")
      || url.username
      || url.password
      || url.search
      || url.hash
      || !REMOTE_APP_ORIGINS.has(url.origin)
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

export function allowedAppOrigins(value) {
  const origins = new Set(LOCAL_DEVELOPMENT_ORIGINS);
  const configuredOrigin = configuredAppOrigin(value);
  if (configuredOrigin) origins.add(configuredOrigin);
  return origins;
}
