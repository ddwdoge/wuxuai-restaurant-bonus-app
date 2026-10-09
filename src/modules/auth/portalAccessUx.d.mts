export type PortalKind = "customer" | "staff" | "owner" | "platform";

export type PortalAccess = {
  authenticated: boolean;
  customer_access: boolean;
  owner_access: boolean;
  staff_access: boolean;
  platform_access: boolean;
  preferred_staff_slug: string | null;
  platform_terms_status: "AUTH_REQUIRED" | "UNAVAILABLE" | "ACCEPTANCE_REQUIRED" | "ACCEPTED";
  customer_account_exists: boolean;
  platform_test_account_setup_allowed?: boolean;
};

export const emptyPortalAccess: Readonly<PortalAccess>;
export function portalDestination(portal: PortalKind, access: PortalAccess): { path: string; label: string } | null;
export function wrongPortalCopy(portal: PortalKind, access: PortalAccess): string;
export function isConfirmedStaffAccountSwitch(access: PortalAccess): boolean;
export function portalLoginPath(portal: PortalKind, staffSlug?: string | null): string;
