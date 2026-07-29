const AUTH_SESSION_PATH_PREFIXES = Object.freeze([
  "/admin",
  "/staff/",
  "/platform-admin",
]);

export function requiresAuthenticatedSession(pathname) {
  const normalizedPath = typeof pathname === "string" ? pathname.trim() : "";
  return AUTH_SESSION_PATH_PREFIXES.some((prefix) => (
    prefix.endsWith("/")
      ? normalizedPath.startsWith(prefix)
      : normalizedPath === prefix || normalizedPath.startsWith(`${prefix}/`)
  ));
}
