export function isSetupAllowedPath(pathname: string, pendingActivation = false) {
  if (pendingActivation && pathname === "/admin/settings/program-end") return false;
  if (pendingActivation && ["/admin/rewards", "/admin/welcome-gifts", "/admin/offers", "/admin/qr", "/admin/staff", "/admin/legal", "/admin/branding", "/admin/loyalty"].includes(pathname)) return true;
  return pathname === "/admin/onboarding" || pathname === "/admin/settings" || pathname.startsWith("/admin/settings/");
}
