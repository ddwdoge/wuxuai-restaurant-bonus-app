import type { Session } from "@supabase/supabase-js";
import { liveDataUnavailableMessage, supabase } from "../../shared/lib/supabase";
import {
  buildOwnerAuthRedirect,
  OWNER_AUTH_PATHS,
  ownerAuthErrorMessage,
} from "./ownerAuthFlow.mjs";

function requireAuthClient() {
  if (!supabase) throw new Error(liveDataUnavailableMessage);
  return supabase.auth;
}

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

async function readSessionWithRetry(retries = 4): Promise<Session | null> {
  const auth = requireAuthClient();

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

  if (code) {
    const { data, error } = await auth.exchangeCodeForSession(code);
    if (!error && data.session) return data.session;

    const existingSession = await readSessionWithRetry(2);
    if (existingSession) return existingSession;
    if (error) throw new Error(ownerAuthErrorMessage(error));
  }

  return readSessionWithRetry();
}

export function clearSensitiveAuthUrl() {
  window.history.replaceState({}, document.title, window.location.pathname);
}

export async function updateOwnerPassword(password: string) {
  const auth = requireAuthClient();
  const { error } = await auth.updateUser({ password });
  if (error) throw new Error(ownerAuthErrorMessage(error, "recovery"));
  await auth.signOut({ scope: "local" });
}
