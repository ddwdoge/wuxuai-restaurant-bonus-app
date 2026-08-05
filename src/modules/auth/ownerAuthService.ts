import { liveDataUnavailableMessage, ownerRecoverySupabase, supabase } from "../../shared/lib/supabase";
import { establishEmailConfirmationSession } from "./emailConfirmationService";
import type { EmailConfirmationPayload } from "./emailConfirmationFlow.mjs";
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

export async function establishOwnerAuthSession(payload: EmailConfirmationPayload) {
  try {
    return await establishEmailConfirmationSession(payload);
  } catch (error) {
    const mappedError = new Error(ownerAuthErrorMessage(error)) as Error & { cause?: unknown };
    mappedError.cause = error;
    throw mappedError;
  }
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
