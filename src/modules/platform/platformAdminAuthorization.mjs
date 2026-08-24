export const PLATFORM_ADMIN_ROLES = Object.freeze([
  "platform_owner",
  "platform_admin",
  "app_admin",
  "super_admin",
  "wuxuai_admin",
  "support",
  "billing_admin",
  "security_admin",
  "viewer",
]);

export const PLATFORM_ADMIN_WRITE_ROLES = Object.freeze([
  "platform_owner",
  "platform_admin",
  "app_admin",
  "super_admin",
  "wuxuai_admin",
  "billing_admin",
]);

export function isPlatformAdminRole(role) {
  return typeof role === "string" && PLATFORM_ADMIN_ROLES.includes(role);
}

export function canAccessPlatformAdmin(role) {
  return isPlatformAdminRole(role);
}

export function canWritePlatformAdmin(role) {
  return typeof role === "string" && PLATFORM_ADMIN_WRITE_ROLES.includes(role);
}
