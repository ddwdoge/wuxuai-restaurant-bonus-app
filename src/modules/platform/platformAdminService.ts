import { supabase } from "../../shared/lib/supabase";

export type SubscriptionStatus = "trialing" | "active" | "past_due" | "unpaid" | "cancelled" | "paused";
export type PaymentStatus = "not_required" | "pending" | "paid" | "failed" | "manual";
export type RestaurantStatus = "active" | "draft" | "suspended";

export type PlatformSummary = {
  restaurants_total: number;
  active_trials: number;
  expired_trials: number;
  active_subscriptions: number;
  open_payments: number;
  points_today: number;
  redemptions_today: number;
};

export type PlatformRestaurant = {
  id: string;
  name: string;
  slug: string;
  status: RestaurantStatus;
  onboarding_status: string | null;
  created_at: string;
  owner_id: string;
  owner_email: string | null;
  owner_name: string | null;
  organization_id: string | null;
  branch_id: string | null;
  subscription_id: string | null;
  subscription_exists: boolean;
  subscription_status: SubscriptionStatus | null;
  payment_status: PaymentStatus | null;
  trial_started_at: string | null;
  trial_ends_at: string | null;
  current_period_end: string | null;
  paused_at: string | null;
  locked_at: string | null;
  lock_reason: string | null;
  trial_days_left: number | null;
  customer_count: number;
  points_today: number;
  points_total: number;
  redemptions_count: number;
  last_activity_at: string | null;
};

type PlatformRestaurantsResponse = {
  summary?: Partial<PlatformSummary>;
  restaurants?: PlatformRestaurant[];
};

const emptySummary: PlatformSummary = {
  restaurants_total: 0,
  active_trials: 0,
  expired_trials: 0,
  active_subscriptions: 0,
  open_payments: 0,
  points_today: 0,
  redemptions_today: 0,
};

function normalizeSummary(summary?: Partial<PlatformSummary>): PlatformSummary {
  return {
    restaurants_total: Number(summary?.restaurants_total ?? 0),
    active_trials: Number(summary?.active_trials ?? 0),
    expired_trials: Number(summary?.expired_trials ?? 0),
    active_subscriptions: Number(summary?.active_subscriptions ?? 0),
    open_payments: Number(summary?.open_payments ?? 0),
    points_today: Number(summary?.points_today ?? 0),
    redemptions_today: Number(summary?.redemptions_today ?? 0),
  };
}

export async function loadPlatformRestaurants() {
  if (!supabase) {
    return { summary: emptySummary, restaurants: [] };
  }

  const { data, error } = await supabase.rpc("get_platform_restaurants");
  if (error) {
    throw error;
  }

  const payload = (data ?? {}) as PlatformRestaurantsResponse;
  return {
    summary: normalizeSummary(payload.summary),
    restaurants: payload.restaurants ?? [],
  };
}

export async function updatePlatformRestaurantSubscription(input: {
  restaurantId: string;
  subscriptionStatus?: SubscriptionStatus | null;
  paymentStatus?: PaymentStatus | null;
  restaurantStatus?: RestaurantStatus | null;
  trialExtensionDays?: number | null;
  reason?: string | null;
}) {
  if (!supabase) {
    throw new Error("Supabase ist nicht konfiguriert.");
  }

  const { error } = await supabase.rpc("update_platform_restaurant_subscription", {
    input_restaurant_id: input.restaurantId,
    input_subscription_status: input.subscriptionStatus ?? null,
    input_payment_status: input.paymentStatus ?? null,
    input_restaurant_status: input.restaurantStatus ?? null,
    input_trial_extension_days: input.trialExtensionDays ?? null,
    input_reason: input.reason ?? null,
  });

  if (error) {
    throw error;
  }
}
