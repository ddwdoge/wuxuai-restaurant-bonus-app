export const CUSTOMER_ACTIVATION_STORAGE_PREFIX = "wuxuai:customer-activation:";
export const CUSTOMER_ACTIVATION_PREFERENCE_VERSION = 2;
export const CUSTOMER_ACTIVATION_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

export function defaultCustomerActivationPreference() {
  return {
    version: CUSTOMER_ACTIVATION_PREFERENCE_VERSION,
    presentation: "open",
    snoozedUntil: null,
  };
}

function validIsoTimestamp(value) {
  if (typeof value !== "string") return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function migrateLegacyPreference(stored) {
  if (stored.autoReminderEnabled === false) {
    return {
      version: CUSTOMER_ACTIVATION_PREFERENCE_VERSION,
      presentation: "dismissed",
      snoozedUntil: null,
    };
  }

  const lastSnoozedAt = validIsoTimestamp(stored.lastSnoozedAt);
  return {
    version: CUSTOMER_ACTIVATION_PREFERENCE_VERSION,
    presentation: "open",
    snoozedUntil: lastSnoozedAt
      ? new Date(Date.parse(lastSnoozedAt) + CUSTOMER_ACTIVATION_SNOOZE_MS).toISOString()
      : null,
  };
}

export function readCustomerActivationPreference(storage, userId) {
  const fallback = defaultCustomerActivationPreference();
  if (!storage || !userId) return fallback;
  try {
    const stored = JSON.parse(storage.getItem(`${CUSTOMER_ACTIVATION_STORAGE_PREFIX}${userId}`) ?? "null");
    if (!stored || typeof stored !== "object") return fallback;
    if (typeof stored.version === "undefined") return migrateLegacyPreference(stored);
    if (stored.version !== CUSTOMER_ACTIVATION_PREFERENCE_VERSION) return fallback;
    if (stored.presentation !== "open" && stored.presentation !== "dismissed") return fallback;
    return {
      version: CUSTOMER_ACTIVATION_PREFERENCE_VERSION,
      presentation: stored.presentation,
      snoozedUntil: validIsoTimestamp(stored.snoozedUntil),
    };
  } catch {
    return fallback;
  }
}

export function writeCustomerActivationPreference(storage, userId, preference) {
  if (!storage || !userId) return false;
  try {
    storage.setItem(`${CUSTOMER_ACTIVATION_STORAGE_PREFIX}${userId}`, JSON.stringify(preference));
    return true;
  } catch {
    return false;
  }
}

export function snoozeCustomerActivation(preference, now = new Date()) {
  return {
    ...preference,
    version: CUSTOMER_ACTIVATION_PREFERENCE_VERSION,
    presentation: "open",
    snoozedUntil: new Date(now.getTime() + CUSTOMER_ACTIVATION_SNOOZE_MS).toISOString(),
  };
}

export function dismissCustomerActivation(preference) {
  return {
    ...preference,
    version: CUSTOMER_ACTIVATION_PREFERENCE_VERSION,
    presentation: "dismissed",
    snoozedUntil: null,
  };
}

export function resetCustomerActivationPreference() {
  return defaultCustomerActivationPreference();
}

export function customerActivationPresentationState(preference, now = new Date()) {
  if (preference.presentation === "dismissed") return "dismissed";
  const snoozedUntil = validIsoTimestamp(preference.snoozedUntil);
  if (snoozedUntil && Date.parse(snoozedUntil) > now.getTime()) return "snoozed_until";
  return "open";
}

export function customerInstallState(input) {
  if (input.displayModeStandalone || input.iosStandalone) return "installed";
  if (input.promptAvailable) return "prompt_available";
  if (input.isIos) return "manual_ios";
  if (input.isEmbeddedBrowser) return "unavailable";
  return "manual_browser";
}

export function customerPushState(input) {
  if (!input.available) return "unavailable";
  if (input.permission === "granted") return "granted";
  if (input.permission === "denied") return "denied";
  return "available";
}

export function customerActivationSummary(input) {
  const steps = {
    email: input.emailConfirmed ? "complete" : "pending",
    install: input.installState === "installed"
      ? "complete"
      : input.installState === "unavailable"
        ? "not_applicable"
        : "pending",
    push: input.pushState === "available"
      ? "pending"
      : input.pushState === "granted"
        ? "complete"
        : "not_applicable",
  };
  const incompleteCount = Object.values(steps).filter((state) => state === "pending").length;
  return { complete: incompleteCount === 0, incompleteCount, steps };
}

export function customerActivationUiState(input) {
  if (!input.preferenceReady) return "hydrating";
  if (input.installState === "installed") return "installed";
  if (input.setupComplete) return "complete";
  const presentationState = customerActivationPresentationState(input.preference, input.now);
  if (presentationState !== "open") return presentationState;
  return input.installState === "prompt_available" ? "install_prompt_available" : "open";
}

export function shouldShowCustomerActivationBanner(input) {
  return ["open", "snoozed_until", "install_prompt_available"].includes(customerActivationUiState(input));
}

export function shouldAutoOpenCustomerActivation(input) {
  if (!input.accountReady || input.view !== "home") return false;
  return ["open", "install_prompt_available"].includes(customerActivationUiState(input));
}
