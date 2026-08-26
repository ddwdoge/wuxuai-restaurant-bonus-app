export type DeploymentRecoveryResult = "ignored" | "reload" | "fallback";

export declare const CHUNK_RECOVERY_STORAGE_KEY: string;
export declare const CHUNK_RECOVERY_GUARD_MS: number;
export declare function isStaleChunkError(value: unknown): boolean;
export declare function readChunkRecoveryAttempt(storage: Storage): { attemptedAt: number; buildId: string } | null;
export declare function createDeploymentRecoveryController(options: {
  buildId: string;
  now?: () => number;
  reload: () => void;
  renderFallback: (clearAttempt: () => void) => void;
  storage: Storage;
}): {
  clearAttempt: () => void;
  markCurrentBuildInitialized: () => void;
  recover: (reason: unknown, options?: { force?: boolean }) => DeploymentRecoveryResult;
};
export declare function currentEntryBuildId(documentObject?: Document): string;
export declare function entryBuildIdFromHtml(html: string, baseUrl: string): string | null;
export declare function installDeploymentRecovery(windowObject?: Window): unknown;
