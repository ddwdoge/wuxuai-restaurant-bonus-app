export type PortalKind = "customer" | "staff" | "owner" | "platform";

export type PortalAccess = {
  authenticated: boolean;
  customer_access: boolean;
  owner_access: boolean;
  staff_access: boolean;
  platform_access: boolean;
  preferred_staff_slug: string | null;
};

export const emptyPortalAccess: Readonly<PortalAccess>;
export function portalDestination(portal: PortalKind, access: PortalAccess): { path: string; label: string } | null;
export function wrongPortalCopy(portal: PortalKind, access: PortalAccess): string;
export function portalLoginPath(portal: PortalKind, staffSlug?: string | null): string;
