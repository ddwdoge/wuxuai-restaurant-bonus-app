export function isSetupAllowedPath(pathname: string) {
  return pathname === "/admin/onboarding" || pathname === "/admin/settings" || pathname.startsWith("/admin/settings/");
}
