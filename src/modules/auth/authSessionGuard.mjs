const invalidRefreshTokenCodes = new Set([
  "refresh_token_not_found",
  "refresh_token_already_used",
  "invalid_refresh_token",
  "refresh_token_expired",
  "refresh_token_revoked",
  "refresh_token_reuse_detected",
]);

const invalidRefreshTokenMessages = [
  "refresh token not found",
  "refresh token already used",
  "invalid refresh token",
  "refresh token has expired",
  "refresh token expired",
  "refresh token revoked",
  "refresh token reuse detected",
];

export function isInvalidRefreshTokenError(error) {
  if (!error || typeof error !== "object") return false;

  const code = typeof error.code === "string" ? error.code.trim().toLowerCase() : "";
  if (invalidRefreshTokenCodes.has(code)) return true;

  const message = typeof error.message === "string" ? error.message.trim().toLowerCase() : "";
  return invalidRefreshTokenMessages.some((candidate) => message.includes(candidate));
}

export function deriveSupabaseAuthStorageKey(supabaseUrl) {
  try {
    const projectRef = new globalThis.URL(supabaseUrl).hostname.split(".")[0]?.trim();
    return projectRef ? `sb-${projectRef}-auth-token` : null;
  } catch {
    return null;
  }
}

export function clearSupabaseAuthStorage(storage, storageKey) {
  if (!storage || !storageKey) return;
  storage.removeItem(storageKey);
  storage.removeItem(`${storageKey}-code-verifier`);
}

export function createInvalidRefreshSessionHandler({
  clearStorage,
  localSignOut,
  onInvalidSession,
}) {
  let cleanupPromise = null;
  let handled = false;

  return {
    async handle(error) {
      if (!isInvalidRefreshTokenError(error)) return false;
      if (handled) return true;

      if (!cleanupPromise) {
        cleanupPromise = (async () => {
          try {
            await localSignOut();
          } catch {
            // Storage cleanup remains authoritative when the local logout cannot finish.
          }
          clearStorage();
          await onInvalidSession();
          handled = true;
        })();
      }

      await cleanupPromise;
      return true;
    },
    reset() {
      if (cleanupPromise && !handled) return;
      cleanupPromise = null;
      handled = false;
    },
  };
}

const DEFAULT_REFRESH_INTERVAL_MS = 30_000;
const DEFAULT_REFRESH_WINDOW_MS = 90_000;

export function createAuthRefreshController({
  cancelInterval,
  handleRefreshError,
  now = () => Date.now(),
  onSession,
  refreshSession,
  scheduleInterval,
  refreshIntervalMs = DEFAULT_REFRESH_INTERVAL_MS,
  refreshWindowMs = DEFAULT_REFRESH_WINDOW_MS,
}) {
  let active = false;
  let interval = null;
  let currentSession = null;
  let refreshPromise = null;

  async function refreshIfNeeded(force = false) {
    if (!active || !currentSession) return;
    const expiresAt = Number(currentSession.expires_at ?? 0) * 1000;
    if (!force && expiresAt > now() + refreshWindowMs) return;
    if (refreshPromise) return refreshPromise;

    refreshPromise = (async () => {
      let result;
      try {
        result = await refreshSession();
      } catch (error) {
        const invalid = await handleRefreshError(error);
        if (invalid) stop();
        return;
      }

      if (result.error) {
        const invalid = await handleRefreshError(result.error);
        if (invalid) stop();
        return;
      }

      currentSession = result.data?.session ?? null;
      onSession(currentSession);
    })().finally(() => {
      refreshPromise = null;
    });

    return refreshPromise;
  }

  function start(session) {
    currentSession = session ?? null;
    if (!currentSession || active) return;
    active = true;
    interval = scheduleInterval(() => {
      void refreshIfNeeded();
    }, refreshIntervalMs);
  }

  function update(session) {
    currentSession = session ?? null;
  }

  function stop() {
    active = false;
    currentSession = null;
    if (interval !== null) {
      cancelInterval(interval);
      interval = null;
    }
  }

  return {
    refreshIfNeeded,
    start,
    stop,
    update,
  };
}
