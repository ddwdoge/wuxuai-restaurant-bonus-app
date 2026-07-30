import type { Session } from "@supabase/supabase-js";
import { liveDataUnavailableMessage, ownerRecoverySupabase, supabase } from "../../shared/lib/supabase";
import {
  buildOwnerAuthRedirect,
  OWNER_AUTH_PATHS,
  ownerAuthErrorMessage,
} from "./ownerAuthFlow.mjs";
import {
  clearOwnerRecoveryMarker,
  createOwnerRecoveryLifecycle,
  createOwnerRecoverySessionEstablisher,
} from "./ownerRecoveryFlow.mjs";

function requireAuthClient() {
  if (!supabase) throw new Error(liveDataUnavailableMessage);
  return supabase.auth;
}

function requireRecoveryAuthClient() {
  if (!ownerRecoverySupabase) throw new Error(liveDataUnavailableMessage);
  return ownerRecoverySupabase.auth;
}

const establishRecoveryOnce = createOwnerRecoverySessionEstablisher();
const recoveryLifecycle = createOwnerRecoveryLifecycle({
  cancel: (timer) => window.clearTimeout(timer),
  clearMarker: () => clearOwnerRecoveryMarker(window.sessionStorage),
  localSignOut: async () => {
    const { error } = await requireRecoveryAuthClient().signOut({ scope: "local" });
    if (error) throw error;
  },
  schedule: (callback) => window.setTimeout(callback, 0),
});

export async function resendOwnerConfirmation(email: string) {
  const auth = requireAuthClient();
  const { error } = await auth.resend({
    type: "signup",
    email: email.trim().toLowerCase(),
    options: {
      emailRedirectTo: buildOwnerAuthRedirect(window.location.origin, OWNER_AUTH_PATHS.callback),
    },
  });

  if (error) throw new Error(ownerAuthErrorMessage(error));
}

export async function requestOwnerPasswordReset(email: string) {
  const auth = requireAuthClient();
  const recoveryRedirect = new URL(buildOwnerAuthRedirect(window.location.origin, OWNER_AUTH_PATHS.updatePassword));
  recoveryRedirect.searchParams.set("flow", "recovery");
  const { error } = await auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo: recoveryRedirect.toString(),
  });

  if (error) throw new Error(ownerAuthErrorMessage(error, "recovery"));
}

async function readSessionWithRetry(auth = requireAuthClient(), retries = 4): Promise<Session | null> {

  for (let attempt = 0; attempt < retries; attempt += 1) {
    let timeoutId = 0;
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = window.setTimeout(() => reject(new Error("session_timeout")), 4000);
    });
    let result: Awaited<ReturnType<typeof auth.getSession>>;
    try {
      result = await Promise.race([auth.getSession(), timeout]);
    } catch {
      throw new Error("Die Verbindung konnte nicht hergestellt werden. Bitte versuche es erneut.");
    } finally {
      window.clearTimeout(timeoutId);
    }
    const { data, error } = result;
    if (error) throw new Error(ownerAuthErrorMessage(error));
    if (data.session) return data.session;
    if (attempt < retries - 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 350));
    }
  }

  return null;
}

export async function establishOwnerAuthSession(): Promise<Session | null> {
  const auth = requireAuthClient();
  const url = new URL(window.location.href);
  const code = url.searchParams.get("code");
  const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
  const callbackError = url.searchParams.get("error_code")
    ?? url.searchParams.get("error")
    ?? hash.get("error_code")
    ?? hash.get("error");

  if (callbackError) {
    throw new Error("Dieser Bestätigungslink ist ungültig oder abgelaufen.");
  }

  if (code) {
    const { data, error } = await auth.exchangeCodeForSession(code);
    if (!error && data.session) return data.session;
    if (error) throw new Error(ownerAuthErrorMessage(error));
  }

  const accessToken = hash.get("access_token");
  const refreshToken = hash.get("refresh_token");
  if (accessToken || refreshToken) {
    if (!accessToken || !refreshToken) {
      throw new Error("Dieser Bestätigungslink ist ungültig oder abgelaufen.");
    }
    const { data, error } = await auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (error) throw new Error(ownerAuthErrorMessage(error));
    if (data.session?.user) return data.session;
  }

  return readSessionWithRetry(auth);
}

export function acquireOwnerRecoveryLifecycle() {
  return recoveryLifecycle.acquire();
}

export async function establishOwnerRecoverySession(url = new URL(window.location.href)) {
  const auth = requireRecoveryAuthClient();
  try {
    const result = await establishRecoveryOnce({
      auth,
      storage: window.sessionStorage,
      url,
    });
    recoveryLifecycle.markEstablished();
    return result;
  } catch (error) {
    clearOwnerRecoveryMarker(window.sessionStorage);
    try {
      await auth.signOut({ scope: "local" });
    } catch {
      // An invalid recovery attempt must still end in a controlled UI state.
    }
    const mappedError = new Error(ownerAuthErrorMessage(error, "recovery")) as Error & { cause?: unknown };
    mappedError.cause = error;
    throw mappedError;
  }
}

export function clearSensitiveAuthUrl() {
  window.history.replaceState({}, document.title, window.location.pathname);
}

export async function updateOwnerPassword(password: string) {
  const auth = requireRecoveryAuthClient();
  const { error } = await auth.updateUser({ password });
  if (error) throw new Error(ownerAuthErrorMessage(error, "recovery"));
  await recoveryLifecycle.complete();
}
