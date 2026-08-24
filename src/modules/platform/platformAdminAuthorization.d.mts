import type { PlatformRole } from "../../shared/types/domain";

export const PLATFORM_ADMIN_ROLES: readonly PlatformRole[];
export const PLATFORM_ADMIN_WRITE_ROLES: readonly PlatformRole[];

export function isPlatformAdminRole(role: unknown): role is PlatformRole;
export function canAccessPlatformAdmin(role: unknown): role is PlatformRole;
export function canWritePlatformAdmin(role: unknown): boolean;
