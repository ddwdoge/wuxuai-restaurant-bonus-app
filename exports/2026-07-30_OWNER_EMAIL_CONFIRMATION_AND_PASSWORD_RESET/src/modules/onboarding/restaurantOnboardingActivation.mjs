export function requireExistingRestaurantId(restaurantId) {
  const normalized = typeof restaurantId === "string" ? restaurantId.trim() : "";
  if (!normalized) {
    throw new Error("Das bestehende Restaurant konnte nicht aktiviert werden.");
  }
  return normalized;
}

export function shouldSkipCompletedOnboarding(onboardingStatus) {
  return onboardingStatus === "completed";
}

export function buildRestaurantActivationPayload(input) {
  return {
    name: input.restaurantName,
    restaurant_type: input.restaurantType,
    language: input.language,
    opening_hours: input.openingHours,
    special_days: input.specialDays,
    holidays: input.holidays,
    smart_open_enabled: input.smartOpenEnabled,
    onboarding_checklist: input.onboardingChecklist,
  };
}

export function indexRowsByKey(rows, key) {
  return new Map(rows.map((row) => [row[key], row]));
}
