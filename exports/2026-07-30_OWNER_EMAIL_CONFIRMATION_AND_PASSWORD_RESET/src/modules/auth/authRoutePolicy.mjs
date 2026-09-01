const AUTH_SESSION_PATH_PREFIXES = Object.freeze([
  "/admin",
  "/staff/",
  "/platform-admin",
]);

const AUTH_SESSION_EXACT_PATHS = Object.freeze([
  "/auth/callback",
  "/auth/update-password",
]);

export function requiresAuthenticatedSession(pathname) {
  const normalizedPath = typeof pathname === "string" ? pathname.trim() : "";
  return AUTH_SESSION_EXACT_PATHS.includes(normalizedPath) || AUTH_SESSION_PATH_PREFIXES.some((prefix) => (
    prefix.endsWith("/")
      ? normalizedPath.startsWith(prefix)
      : normalizedPath === prefix || normalizedPath.startsWith(`${prefix}/`)
  ));
}
