export function requireExistingRestaurantId(restaurantId: string | null | undefined): string;
export function shouldSkipCompletedOnboarding(onboardingStatus: unknown): boolean;
export function buildRestaurantActivationPayload(input: {
  restaurantName: string;
  restaurantType: string;
  language: string;
  openingHours: Record<string, unknown>;
  specialDays: string[];
  holidays: string[];
  smartOpenEnabled: boolean;
  onboardingChecklist: Record<string, boolean>;
}): {
  name: string;
  restaurant_type: string;
  language: string;
  opening_hours: Record<string, unknown>;
  special_days: string[];
  holidays: string[];
  smart_open_enabled: boolean;
  onboarding_checklist: Record<string, boolean>;
};
export function indexRowsByKey<TRow extends Record<TKey, PropertyKey>, TKey extends keyof TRow>(
  rows: TRow[],
  key: TKey,
): Map<TRow[TKey], TRow>;
