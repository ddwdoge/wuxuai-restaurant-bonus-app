import { supabase } from "../../shared/lib/supabase";

export type SubscriptionStatus = "trialing" | "active" | "past_due" | "unpaid" | "cancelled" | "paused";
export type PaymentStatus = "not_required" | "pending" | "paid" | "failed" | "manual";
export type RestaurantStatus = "active" | "draft" | "suspended";

export type PlatformSummary = {
  restaurants_total: number;
  active_restaurants?: number;
  active_trials: number;
  expiring_trials?: number;
  expired_trials: number;
  suspended_restaurants?: number;
  new_restaurants_today?: number;
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
  active_restaurants: 0,
  active_trials: 0,
  expiring_trials: 0,
  expired_trials: 0,
  suspended_restaurants: 0,
  new_restaurants_today: 0,
  active_subscriptions: 0,
  open_payments: 0,
  points_today: 0,
  redemptions_today: 0,
};

function normalizeSummary(summary?: Partial<PlatformSummary>): PlatformSummary {
  return {
    restaurants_total: Number(summary?.restaurants_total ?? 0),
    active_restaurants: Number(summary?.active_restaurants ?? 0),
    active_trials: Number(summary?.active_trials ?? 0),
    expiring_trials: Number(summary?.expiring_trials ?? 0),
    expired_trials: Number(summary?.expired_trials ?? 0),
    suspended_restaurants: Number(summary?.suspended_restaurants ?? 0),
    new_restaurants_today: Number(summary?.new_restaurants_today ?? 0),
    active_subscriptions: Number(summary?.active_subscriptions ?? 0),
    open_payments: Number(summary?.open_payments ?? 0),
    points_today: Number(summary?.points_today ?? 0),
    redemptions_today: Number(summary?.redemptions_today ?? 0),
  };
}

export type PlatformAuditEntry = {
  id: string;
  created_at: string;
  action: string;
  actor_type: string;
  actor_id: string | null;
  target_table: string | null;
  target_id: string | null;
};

export type PlatformRestaurantDetail = {
  restaurant: PlatformRestaurant & {
    owner_phone?: string | null;
    restaurant_type?: string | null;
    language?: string | null;
  };
  branding: {
    logo_url: string | null;
    primary_color: string | null;
    secondary_color: string | null;
    button_color: string | null;
  } | null;
  metrics: {
    customer_count: number;
    points_transactions_count: number;
    points_today: number;
    points_total: number;
    redemptions_today: number;
    redemptions_total: number;
    welcome_gifts_total: number;
    welcome_gifts_active: number;
    bonus_boosts_active: number;
  };
  audit: PlatformAuditEntry[];
};

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

export async function loadPlatformRestaurantDetail(restaurantId: string): Promise<PlatformRestaurantDetail> {
  if (!supabase) {
    throw new Error("Supabase ist nicht konfiguriert.");
  }

  const { data, error } = await supabase.rpc("get_platform_restaurant_detail", {
    input_restaurant_id: restaurantId,
  });

  if (error) {
    throw error;
  }

  return data as PlatformRestaurantDetail;
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
