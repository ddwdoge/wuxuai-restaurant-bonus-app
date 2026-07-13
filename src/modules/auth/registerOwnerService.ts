import { liveDataUnavailableMessage, supabase } from "../../shared/lib/supabase";

export type RegisterOwnerInput = {
  ownerName: string;
  email: string;
  password: string;
  restaurantName: string;
  phone: string;
};

export type RegisterOwnerResult = {
  requiresEmailConfirmation: boolean;
};

const pendingRegistrationKey = "wuxuai-pending-owner-registration";
const pendingRegistrationRetryMessage = "Deine Registrierung wird noch vorbereitet. Bitte versuche es in wenigen Sekunden erneut.";

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

async function waitForReadySession(retries = 1) {
  if (!supabase) {
    return null;
  }

  for (let attempt = 0; attempt < retries; attempt += 1) {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      throw new Error(registrationErrorMessage(sessionError));
    }

    if (sessionData.session?.user) {
      return sessionData.session;
    }

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError && attempt === retries - 1) {
      throw new Error(registrationErrorMessage(userError));
    }

    if (userData.user) {
      await supabase.auth.refreshSession();
      const { data: refreshedSession } = await supabase.auth.getSession();
      if (refreshedSession.session?.user) {
        return refreshedSession.session;
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

  await supabase.auth.refreshSession();
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
    return "Diese E-Mail ist bereits registriert. Bitte melde dich an.";
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

  return rawMessage;
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
        full_name: input.ownerName.trim(),
      },
      emailRedirectTo: `${window.location.origin}/admin/onboarding`,
    },
  });

  if (error) {
    throw new Error(registrationErrorMessage(error));
  }

  if (!data.session) {
    storePendingRegistration(input);
    return { requiresEmailConfirmation: true };
  }

  await startOwnerTrial(input);
  localStorage.removeItem(pendingRegistrationKey);

  return { requiresEmailConfirmation: false };
}

export async function completePendingOwnerRegistration(email: string): Promise<boolean> {
  if (!supabase) {
    throw new Error(liveDataUnavailableMessage);
  }

  const pendingRegistration = readPendingRegistration(email);
  if (!pendingRegistration) {
    return false;
  }

  await startOwnerTrial(pendingRegistration, 3);
  localStorage.removeItem(pendingRegistrationKey);
  return true;
}
