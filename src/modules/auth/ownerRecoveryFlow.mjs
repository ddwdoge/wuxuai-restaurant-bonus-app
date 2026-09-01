export const OWNER_RECOVERY_MARKER_KEY = "owner_password_recovery_in_progress";
export const OWNER_RECOVERY_MARKER_TTL_MS = 20 * 60 * 1000;

const invalidRecoveryMessage = "Dieser Link zum Zurücksetzen des Passworts ist ungültig oder abgelaufen.";

function invalidRecoveryError() {
  return new Error(invalidRecoveryMessage);
}

function toUrl(urlLike) {
  if (urlLike instanceof globalThis.URL) return urlLike;
  return new globalThis.URL(String(urlLike), "http://localhost");
}

export function parseOwnerRecoveryUrl(urlLike) {
  const url = toUrl(urlLike);
  const search = url.searchParams;
  const hash = new globalThis.URLSearchParams(url.hash.replace(/^#/, ""));

  return {
    accessToken: hash.get("access_token"),
    code: search.get("code"),
    error: search.get("error_code") ?? search.get("error") ?? hash.get("error_code") ?? hash.get("error"),
    flow: search.get("flow"),
    refreshToken: hash.get("refresh_token"),
    type: search.get("type") ?? hash.get("type"),
  };
}

export function hasOwnerRecoveryIntent(urlLike) {
  const url = toUrl(urlLike);
  const payload = parseOwnerRecoveryUrl(urlLike);
  return payload.flow === "recovery"
    || payload.type === "recovery"
    || url.pathname === "/auth/update-password";
}

export function readOwnerRecoveryMarker(storage, now = Date.now()) {
  const raw = storage?.getItem(OWNER_RECOVERY_MARKER_KEY);
  if (!raw) return false;

  try {
    const parsed = JSON.parse(raw);
    const valid = parsed?.version === 1
      && Number.isFinite(parsed.expiresAt)
      && parsed.expiresAt > now
      && parsed.expiresAt <= now + OWNER_RECOVERY_MARKER_TTL_MS;
    if (valid) return true;
  } catch {
    // Invalid markers are removed below.
  }

  storage?.removeItem(OWNER_RECOVERY_MARKER_KEY);
  return false;
}

export function writeOwnerRecoveryMarker(storage, now = Date.now()) {
  storage?.setItem(OWNER_RECOVERY_MARKER_KEY, JSON.stringify({
    expiresAt: now + OWNER_RECOVERY_MARKER_TTL_MS,
    version: 1,
  }));
}

export function clearOwnerRecoveryMarker(storage) {
  storage?.removeItem(OWNER_RECOVERY_MARKER_KEY);
}

function requireSession(result) {
  if (result?.error) throw result.error;
  if (!result?.data?.session?.user) {
    throw invalidRecoveryError();
  }
  return result.data.session;
}

export async function establishOwnerRecoverySessionCore({ auth, now = Date.now(), storage, url }) {
  const payload = parseOwnerRecoveryUrl(url);
  const markerPresent = readOwnerRecoveryMarker(storage, now);

  if (payload.error) {
    clearOwnerRecoveryMarker(storage);
    throw invalidRecoveryError();
  }

  if (payload.code) {
    if (!hasOwnerRecoveryIntent(url)) {
      clearOwnerRecoveryMarker(storage);
      throw invalidRecoveryError();
    }
    const session = requireSession(await auth.exchangeCodeForSession(payload.code));
    writeOwnerRecoveryMarker(storage, now);
    return { flowType: "pkce", session, user: session.user };
  }

  if (payload.accessToken || payload.refreshToken) {
    if (payload.type !== "recovery" || !payload.accessToken || !payload.refreshToken) {
      clearOwnerRecoveryMarker(storage);
      throw invalidRecoveryError();
    }
    const session = requireSession(await auth.setSession({
      access_token: payload.accessToken,
      refresh_token: payload.refreshToken,
    }));
    writeOwnerRecoveryMarker(storage, now);
    return { flowType: "implicit", session, user: session.user };
  }

  if (markerPresent) {
    const session = requireSession(await auth.getSession());
    writeOwnerRecoveryMarker(storage, now);
    return { flowType: "existing", session, user: session.user };
  }

  clearOwnerRecoveryMarker(storage);
  throw invalidRecoveryError();
}

export function createOwnerRecoverySessionEstablisher() {
  let inFlight = null;

  return function establish(options) {
    if (inFlight) return inFlight;
    const operation = establishOwnerRecoverySessionCore(options);
    const trackedOperation = operation.finally(() => {
      if (inFlight === trackedOperation) inFlight = null;
    });
    inFlight = trackedOperation;
    return trackedOperation;
  };
}

export function createOwnerRecoveryLifecycle({ cancel, clearMarker, localSignOut, schedule }) {
  let cleanupStarted = false;
  let cleanupTimer = null;
  let completed = false;
  let consumers = 0;
  let sessionEstablished = false;

  function cancelScheduledCleanup() {
    if (cleanupTimer !== null) {
      cancel(cleanupTimer);
      cleanupTimer = null;
    }
  }

  async function runCleanup() {
    if (cleanupStarted || completed || !sessionEstablished) return;
    cleanupStarted = true;
    clearMarker();
    try {
      await localSignOut();
    } catch {
      // Cleanup errors must not crash a route transition.
    }
  }

  function scheduleCleanup() {
    if (consumers > 0 || cleanupStarted || completed || !sessionEstablished || cleanupTimer !== null) return;
    cleanupTimer = schedule(() => {
      cleanupTimer = null;
      void runCleanup();
    });
  }

  return {
    acquire() {
      if (consumers === 0 && (completed || cleanupStarted)) {
        completed = false;
        cleanupStarted = false;
        sessionEstablished = false;
      }
      consumers += 1;
      cancelScheduledCleanup();
      let released = false;

      return () => {
        if (released) return;
        released = true;
        consumers = Math.max(0, consumers - 1);
        scheduleCleanup();
      };
    },
    async complete() {
      if (completed || cleanupStarted) return;
      completed = true;
      cleanupStarted = true;
      cancelScheduledCleanup();
      clearMarker();
      try {
        await localSignOut();
      } catch {
        // The password update succeeded; cleanup errors remain non-fatal.
      }
    },
    markEstablished() {
      sessionEstablished = true;
      scheduleCleanup();
    },
  };
}
