export type PublicPortal = "customer" | "staff" | "owner";

export type PasswordRecoveryContext = {
  portal: PublicPortal;
  staffSlug: string | null;
};

export function normalizePublicPortal(value: unknown): PublicPortal;
export function buildPasswordRecoveryPath(portal: PublicPortal, staffSlug?: string | null): string;
export function readPasswordRecoveryContext(searchLike: string | URLSearchParams): PasswordRecoveryContext;
export function recoveryLoginPath(context: PasswordRecoveryContext): string;
export function portalLoginLinks(currentPortal: PublicPortal): Array<{
  portal: PublicPortal;
  label: string;
  path: string;
}>;
