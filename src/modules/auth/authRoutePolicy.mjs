const AUTH_SESSION_PATH_PREFIXES = Object.freeze([
  "/admin",
  "/customer",
  "/staff",
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

const OPTIONAL_AUTH_SESSION_PATHS = Object.freeze([
  "/register",
  "/customer/login",
  "/customer/register",
]);

const PUBLIC_REFERRAL_PATH = /^\/r\/[a-z0-9]+(?:-[a-z0-9]+)*\/[A-Za-z0-9_-]{20,256}$/;

export function isPublicReferralPath(pathname) {
  const normalizedPath = typeof pathname === "string" ? pathname.trim() : "";
  return PUBLIC_REFERRAL_PATH.test(normalizedPath);
}

export function requiresAuthenticatedSession(pathname) {
  const normalizedPath = typeof pathname === "string" ? pathname.trim() : "";
  if (PUBLIC_CUSTOMER_PATHS.includes(normalizedPath)) return false;
  return AUTH_SESSION_EXACT_PATHS.includes(normalizedPath) || AUTH_SESSION_PATH_PREFIXES.some((prefix) => (
    prefix.endsWith("/")
      ? normalizedPath.startsWith(prefix)
      : normalizedPath === prefix || normalizedPath.startsWith(`${prefix}/`)
  ));
}

export function shouldHydrateAuthSession(pathname) {
  const normalizedPath = typeof pathname === "string" ? pathname.trim() : "";
  return requiresAuthenticatedSession(normalizedPath)
    || OPTIONAL_AUTH_SESSION_PATHS.includes(normalizedPath)
    || isPublicReferralPath(normalizedPath);
}
