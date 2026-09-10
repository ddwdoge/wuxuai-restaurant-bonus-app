export const CUSTOMER_ACTIVATION_STORAGE_PREFIX = "wuxuai:customer-activation:";

export function defaultCustomerActivationPreference() {
  return {
    autoReminderEnabled: true,
    firstLoginDrawerSeen: false,
    lastSnoozedAt: null,
  };
}

export function readCustomerActivationPreference(storage, userId) {
  const fallback = defaultCustomerActivationPreference();
  if (!storage || !userId) return fallback;
  try {
    const stored = JSON.parse(storage.getItem(`${CUSTOMER_ACTIVATION_STORAGE_PREFIX}${userId}`) ?? "null");
    if (!stored || typeof stored !== "object") return fallback;
    return {
      autoReminderEnabled: stored.autoReminderEnabled !== false,
      firstLoginDrawerSeen: stored.firstLoginDrawerSeen === true,
      lastSnoozedAt: typeof stored.lastSnoozedAt === "string" ? stored.lastSnoozedAt : null,
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

export function customerInstallState(input) {
  if (input.displayModeStandalone || input.iosStandalone) return "installed";
  if (input.promptAvailable) return "prompt_available";
  if (input.isIos) return "manual_ios";
  if (input.isAndroid) return "manual_browser";
  return "unavailable";
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

export function shouldAutoOpenCustomerActivation(input) {
  return input.accountReady
    && input.view === "home"
    && !input.setupComplete
    && input.preference.autoReminderEnabled
    && !input.preference.firstLoginDrawerSeen;
}
