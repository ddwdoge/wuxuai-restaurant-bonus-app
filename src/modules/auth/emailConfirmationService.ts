import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "../../shared/lib/supabase";
import {
  createEmailConfirmationSingleFlight,
  emailConfirmationPayloadKey,
  type EmailConfirmationPayload,
} from "./emailConfirmationFlow.mjs";

const confirmationSingleFlight = createEmailConfirmationSingleFlight<Session>();

async function verifyPayload(auth: SupabaseClient["auth"], payload: EmailConfirmationPayload) {
  if (payload.kind === "invalid") {
    throw new Error("invalid_confirmation_payload");
  }

  if (payload.kind === "token_hash") {
    const { data, error } = await auth.verifyOtp({
      token_hash: payload.tokenHash,
      type: "email",
    });
    if (error) throw error;
    if (data.session) return data.session;
  } else if (payload.kind === "pkce") {
    const { data, error } = await auth.exchangeCodeForSession(payload.code);
    if (error) throw error;
    if (data.session) return data.session;
  } else {
    const { data, error } = await auth.setSession({
      access_token: payload.accessToken,
      refresh_token: payload.refreshToken,
    });
    if (error) throw error;
    if (data.session) return data.session;
  }

  const { data, error } = await auth.getSession();
  if (error) throw error;
  if (!data.session) throw new Error("confirmation_session_missing");
  return data.session;
}

export function establishEmailConfirmationSession(payload: EmailConfirmationPayload) {
  if (!supabase) throw new Error("confirmation_service_unavailable");
  const auth = supabase.auth;
  return confirmationSingleFlight.run(
    emailConfirmationPayloadKey(payload),
    () => verifyPayload(auth, payload),
  );
}

export function clearEmailConfirmationUrl(pathname = window.location.pathname) {
  window.history.replaceState({}, document.title, pathname);
}
