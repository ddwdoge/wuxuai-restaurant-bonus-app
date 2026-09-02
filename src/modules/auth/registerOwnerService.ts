import type { User } from "@supabase/supabase-js";
import { browserEmailLanguage } from "../../shared/emailLanguage.mjs";
import { liveDataUnavailableMessage, supabase, supabaseAuthStorageKey } from "../../shared/lib/supabase";
import {
  buildOwnerAuthRedirect,
  classifyOwnerSignUpResult,
  isOwnerEmailConfirmed,
  OWNER_AUTH_PATHS,
  ownerAuthErrorMessage,
} from "./ownerAuthFlow.mjs";
import { clearSupabaseAuthStorage, createInvalidRefreshSessionHandler } from "./authSessionGuard.mjs";

export type RegisterOwnerInput = {
  ownerName: string;
  email: string;
  password: string;
  restaurantName: string;
  phone: string;
};

export type RegisterOwnerResult = {
  requiresEmailConfirmation: boolean;
  requiresAuthentication: boolean;
};

const pendingRegistrationKey = "wuxuai-pending-owner-registration";
const pendingRegistrationRetryMessage = "Deine Registrierung wird noch vorbereitet. Bitte versuche es in wenigen Sekunden erneut.";
let invalidOwnerSessionHandler: ReturnType<typeof createInvalidRefreshSessionHandler> | null = null;

function getInvalidOwnerSessionHandler() {
  if (!invalidOwnerSessionHandler) {
    invalidOwnerSessionHandler = createInvalidRefreshSessionHandler({
      clearStorage: () => clearSupabaseAuthStorage(window.localStorage, supabaseAuthStorageKey),
      localSignOut: async () => {
        if (!supabase) return;
        const { error } = await supabase.auth.signOut({ scope: "local" });
        if (error && error.name !== "AuthSessionMissingError") throw error;
      },
      onInvalidSession: () => window.location.replace("/restaurant/login"),
    });
  }
  return invalidOwnerSessionHandler;
}

async function throwOwnerSessionError(error: unknown): Promise<never> {
  const invalid = await getInvalidOwnerSessionHandler().handle(error);
  if (invalid) {
    throw new Error("Deine Anmeldung ist abgelaufen. Bitte melde dich erneut an.");
  }
  throw new Error(registrationErrorMessage(error));
}

async function refreshOwnerSession() {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.refreshSession();
  if (error) await throwOwnerSessionError(error);
  return data.session;
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function storePendingRegistration(input: RegisterOwnerInput) {
  localStorage.setItem(
    pendingRegistrationKey,
    JSON.stringify({
      ownerName: input.ownerName.trim(),
      email: input.email.trim().toLowerCase(),
      restaurantName: input.restaurantName.trim(),
      phone: input.phone.trim(),
    }),
  );
}

function readPendingRegistration(email: string): RegisterOwnerInput | null {
  const raw = localStorage.getItem(pendingRegistrationKey);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as RegisterOwnerInput;
    return parsed.email.toLowerCase() === email.trim().toLowerCase() ? parsed : null;
  } catch {
    localStorage.removeItem(pendingRegistrationKey);
    return null;
  }
}

export function readPendingOwnerEmail(): string {
  const raw = localStorage.getItem(pendingRegistrationKey);
  if (!raw) return "";

  try {
    const parsed = JSON.parse(raw) as Partial<RegisterOwnerInput>;
    return typeof parsed.email === "string" ? parsed.email.trim().toLowerCase() : "";
  } catch {
    localStorage.removeItem(pendingRegistrationKey);
    return "";
  }
}

export function clearPendingOwnerRegistration() {
  localStorage.removeItem(pendingRegistrationKey);
}

async function waitForReadySession(retries = 1) {
  if (!supabase) {
    return null;
  }

  for (let attempt = 0; attempt < retries; attempt += 1) {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      await throwOwnerSessionError(sessionError);
    }

    if (sessionData.session?.user) {
      return sessionData.session;
    }

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError && attempt === retries - 1) {
      await throwOwnerSessionError(userError);
    }

    if (userData.user) {
      const refreshedSession = await refreshOwnerSession();
      if (refreshedSession?.user) {
        return refreshedSession;
      }
    }

    if (attempt < retries - 1) {
      await wait(600);
    }
  }

  return null;
}

async function startOwnerTrial(input: RegisterOwnerInput, sessionRetries = 1) {
  if (!supabase) {
    return;
  }

  const session = await waitForReadySession(sessionRetries);

  if (!session?.user) {
    throw new Error(pendingRegistrationRetryMessage);
  }

  const { error: trialError } = await supabase.rpc("start_restaurant_owner_trial", {
    input_owner_name: input.ownerName.trim(),
    input_restaurant_name: input.restaurantName.trim(),
    input_phone: input.phone.trim() || null,
  });

  if (trialError) {
    throw new Error(registrationErrorMessage(trialError));
  }

  await refreshOwnerSession();
}

function registrationErrorMessage(error: unknown): string {
  const status = typeof error === "object" && error && "status" in error ? Number(error.status) : null;
  const rawMessage =
    typeof error === "object" && error && "message" in error && typeof error.message === "string"
      ? error.message
      : "Registrierung fehlgeschlagen.";
  const message = rawMessage.toLowerCase();

  if (
    message.includes("already registered") ||
    message.includes("already been registered") ||
    message.includes("already exists") ||
    message.includes("email_exists") ||
    message.includes("user already")
  ) {
    return "Die Registrierung konnte nicht abgeschlossen werden. Bitte prüfe deine Angaben oder melde dich an.";
  }

  if (message.includes("weak password") || message.includes("password should") || message.includes("password")) {
    return "Bitte wähle ein stärkeres Passwort mit mindestens 8 Zeichen.";
  }

  if (status === 422) {
    return "Diese Registrierung konnte nicht angenommen werden. Bitte prüfe E-Mail und Passwort.";
  }

  if (message.includes("start_restaurant_owner_trial") || message.includes("404") || message.includes("not found")) {
    return "Restaurant-Registrierung ist noch nicht bereit. Bitte versuche es gleich erneut.";
  }

  if (message.includes("not authenticated") || message.includes("session") || message.includes("jwt")) {
    return pendingRegistrationRetryMessage;
  }

  return ownerAuthErrorMessage(error);
}

export async function registerRestaurantOwner(input: RegisterOwnerInput): Promise<RegisterOwnerResult> {
  if (!supabase) {
    throw new Error(liveDataUnavailableMessage);
  }

  const { data, error } = await supabase.auth.signUp({
    email: input.email.trim(),
    password: input.password,
    options: {
      data: {
        app_language: browserEmailLanguage(),
        full_name: input.ownerName.trim(),
        restaurant_name: input.restaurantName.trim(),
        phone: input.phone.trim() || null,
      },
      emailRedirectTo: buildOwnerAuthRedirect(window.location.origin, OWNER_AUTH_PATHS.callback),
    },
  });

  if (error) {
    throw new Error(registrationErrorMessage(error));
  }

  storePendingRegistration(input);

  const signUpResult = classifyOwnerSignUpResult(data);

  if (signUpResult === "existing_or_obfuscated") {
    return { requiresEmailConfirmation: false, requiresAuthentication: true };
  }

  if (data.session) {
    await supabase.auth.signOut({ scope: "local" });
    throw new Error("Die sichere E-Mail-Bestätigung ist noch nicht verfügbar. Bitte versuche es später erneut.");
  }

  if (signUpResult !== "confirmation_required") {
    clearPendingOwnerRegistration();
    throw new Error("Die Registrierung konnte nicht abgeschlossen werden. Bitte versuche es erneut.");
  }

  return { requiresEmailConfirmation: true, requiresAuthentication: false };
}

export async function activateRestaurantOwnerForCurrentUser(input: Omit<RegisterOwnerInput, "email" | "password">) {
  if (!supabase) throw new Error(liveDataUnavailableMessage);
  const session = await waitForReadySession(2);
  if (!session?.user || !isOwnerEmailConfirmed(session.user)) {
    throw new Error("Bitte bestätige zuerst deine E-Mail-Adresse.");
  }
  await startOwnerTrial({ ...input, email: session.user.email ?? "", password: "" }, 2);
}

export async function completePendingOwnerRegistration(email: string): Promise<boolean> {
  if (!supabase) {
    throw new Error(liveDataUnavailableMessage);
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user || !isOwnerEmailConfirmed(userData.user)) {
    throw new Error("Bitte bestätige zuerst deine E-Mail-Adresse.");
  }

  const pendingRegistration = readPendingRegistration(email);
  if (!pendingRegistration) {
    return false;
  }

  await startOwnerTrial(pendingRegistration, 3);
  localStorage.removeItem(pendingRegistrationKey);
  return true;
}

export async function completeConfirmedOwnerRegistration(user: User): Promise<boolean> {
  if (!isOwnerEmailConfirmed(user) || !user.email) {
    throw new Error("Bitte bestätige zuerst deine E-Mail-Adresse.");
  }

  const pendingRegistration = readPendingRegistration(user.email);
  const metadata = user.user_metadata ?? {};
  const metadataRegistration: RegisterOwnerInput | null =
    typeof metadata.full_name === "string"
    && typeof metadata.restaurant_name === "string"
    && metadata.full_name.trim()
    && metadata.restaurant_name.trim()
      ? {
          ownerName: metadata.full_name,
          email: user.email,
          password: "",
          restaurantName: metadata.restaurant_name,
          phone: typeof metadata.phone === "string" ? metadata.phone : "",
        }
      : null;
  const registration = pendingRegistration ?? metadataRegistration;

  if (!registration) return false;

  await startOwnerTrial(registration, 3);
  if (pendingRegistration) localStorage.removeItem(pendingRegistrationKey);
  return true;
}
