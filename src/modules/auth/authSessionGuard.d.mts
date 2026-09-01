import type { Session } from "@supabase/supabase-js";

type StorageLike = Pick<Storage, "removeItem">;
type RefreshResult = {
  data: { session: Session | null };
  error: unknown;
};

export function isInvalidRefreshTokenError(error: unknown): boolean;
export function deriveSupabaseAuthStorageKey(supabaseUrl: string): string | null;
export function clearSupabaseAuthStorage(storage: StorageLike | null | undefined, storageKey: string | null): void;
export function createInvalidRefreshSessionHandler(options: {
  clearStorage: () => void;
  localSignOut: () => Promise<void>;
  onInvalidSession: () => void | Promise<void>;
}): {
  handle(error: unknown): Promise<boolean>;
  reset(): void;
};
export function createAuthRefreshController(options: {
  cancelInterval: (interval: number) => void;
  handleRefreshError: (error: unknown) => Promise<boolean>;
  now?: () => number;
  onSession: (session: Session | null) => void;
  refreshSession: () => Promise<RefreshResult>;
  scheduleInterval: (callback: () => void, delay: number) => number;
  refreshIntervalMs?: number;
  refreshWindowMs?: number;
}): {
  refreshIfNeeded(force?: boolean): Promise<void>;
  start(session: Session | null): void;
  stop(): void;
  update(session: Session | null): void;
};

