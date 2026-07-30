import type { Session, SupabaseClient, User } from "@supabase/supabase-js";

export const OWNER_RECOVERY_MARKER_KEY: "owner_password_recovery_in_progress";
export const OWNER_RECOVERY_MARKER_TTL_MS: number;

export type OwnerRecoveryFlowType = "pkce" | "implicit" | "existing";
export type OwnerRecoverySessionResult = {
  flowType: OwnerRecoveryFlowType;
  session: Session;
  user: User;
};

export function parseOwnerRecoveryUrl(urlLike: URL | string): {
  accessToken: string | null;
  code: string | null;
  error: string | null;
  flow: string | null;
  refreshToken: string | null;
  type: string | null;
};
export function hasOwnerRecoveryIntent(urlLike: URL | string): boolean;
export function readOwnerRecoveryMarker(storage: Storage, now?: number): boolean;
export function writeOwnerRecoveryMarker(storage: Storage, now?: number): void;
export function clearOwnerRecoveryMarker(storage: Storage): void;
export function establishOwnerRecoverySessionCore(options: {
  auth: SupabaseClient["auth"];
  now?: number;
  storage: Storage;
  url: URL | string;
}): Promise<OwnerRecoverySessionResult>;
export function createOwnerRecoverySessionEstablisher(): typeof establishOwnerRecoverySessionCore;
export function createOwnerRecoveryLifecycle(options: {
  cancel: (timer: number) => void;
  clearMarker: () => void;
  localSignOut: () => Promise<unknown>;
  schedule: (callback: () => void) => number;
}): {
  acquire: () => () => void;
  complete: () => Promise<void>;
  markEstablished: () => void;
};
