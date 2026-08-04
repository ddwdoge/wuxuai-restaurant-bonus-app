const AUTH_SESSION_PATH_PREFIXES = Object.freeze([
  "/admin",
  "/customer",
  "/staff/",
  "/platform-admin",
]);

const AUTH_SESSION_EXACT_PATHS = Object.freeze([
  "/auth/callback",
]);

const PUBLIC_CUSTOMER_PATHS = Object.freeze([
  "/customer/login",
  "/customer/register",
  "/customer/auth/callback",
  "/customer/email/confirm",
  "/customer/email/unsubscribe",
]);

export function requiresAuthenticatedSession(pathname) {
  const normalizedPath = typeof pathname === "string" ? pathname.trim() : "";
  if (PUBLIC_CUSTOMER_PATHS.includes(normalizedPath)) return false;
  return AUTH_SESSION_EXACT_PATHS.includes(normalizedPath) || AUTH_SESSION_PATH_PREFIXES.some((prefix) => (
    prefix.endsWith("/")
      ? normalizedPath.startsWith(prefix)
      : normalizedPath === prefix || normalizedPath.startsWith(`${prefix}/`)
  ));
}
