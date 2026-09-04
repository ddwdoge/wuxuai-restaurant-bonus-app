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

export type PlatformAuditEvent = {
  id: string;
  created_at: string;
  restaurant_id: string;
  restaurant_name: string;
  customer_id: string | null;
  actor_type: string;
  actor_id: string | null;
  event_type: string;
  status: "success" | "failed" | "blocked";
  source: string | null;
  entity_type: string | null;
  entity_id: string | null;
  request_id: string | null;
  is_test_event: boolean;
  test_session_id: string | null;
  metadata: Record<string, unknown>;
  error_code: string | null;
  error_message: string | null;
};

export type PlatformAuditFilters = {
  from?: string | null;
  to?: string | null;
  restaurantId?: string | null;
  customerId?: string | null;
  eventType?: string | null;
  status?: PlatformAuditEvent["status"] | null;
  source?: string | null;
  actorType?: string | null;
  testOnly?: boolean;
  failedOnly?: boolean;
  limit?: number;
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

export type PlatformMetric<T> =
  | { status: "available"; value: T }
  | { status: "unavailable"; value: null };

export type PlatformSubsystemHealth = "healthy" | "warning" | "error" | "unavailable";

export type PlatformOperationalStatus = "healthy" | "no_recent_events" | "degraded" | "error" | "unavailable";

export type PlatformOperationalTelemetry = {
  contract_version: "platform_operational_telemetry_v1";
  generated_at: string;
  cron: {
    status: PlatformOperationalStatus;
    reason: string | null;
    expected_job_count: number;
    configured_job_count: number;
    enabled_job_count: number;
    last_run_at: string | null;
    last_success_at: string | null;
    last_failure_at: string | null;
    failures_24h: number;
    jobs: Array<{ name: string; configured: boolean; enabled: boolean; schedule: string | null; last_status: string | null; last_run_at: string | null }>;
  };
  email: {
    status: PlatformOperationalStatus;
    reason: string | null;
    configuration_status: "unavailable";
    configuration_reason: string;
    pending_count: number;
    processing_count: number;
    failed_count: number;
    sent_24h_count: number;
    last_sent_at: string | null;
    last_failure_at: string | null;
  };
  registration: {
    status: PlatformOperationalStatus;
    reason: string | null;
    success_24h: number;
    success_7d: number;
    failures_24h: number;
    failures_7d: number;
    last_success_at: string | null;
    last_failure_at: string | null;
  };
};

export type PlatformRestaurantControlCenter = {
  contract_version: "platform_restaurant_control_center_v1";
  generated_at: string;
  timezone: string;
  overall_health: "healthy" | "warning" | "error" | "unknown";
  account: {
    restaurant_id: string;
    restaurant_name: string;
    restaurant_status: RestaurantStatus;
    onboarding_status: string | null;
    setup_completed: boolean;
    owner: { user_id: string; name: string | null; business_email: string | null };
    created_at: string;
    last_activity_at: string | null;
    internal_test: PlatformMetric<boolean>;
  };
  subscription: PlatformMetric<{
    subscription_status: SubscriptionStatus | null;
    payment_status: PaymentStatus | null;
    plan_key: string;
    trial_started_at: string | null;
    trial_ends_at: string | null;
    trial_days_remaining: number | null;
    current_period_end: string | null;
  }>;
  usage: {
    customers_total: PlatformMetric<number>;
    customers_new_30d: PlatformMetric<number>;
    points_today: PlatformMetric<number>;
    points_30d: PlatformMetric<number>;
    welcome_gifts_active: PlatformMetric<number>;
    birthday_gifts_active: PlatformMetric<number>;
  };
  redemption: {
    health: PlatformSubsystemHealth;
    redemptions_today: PlatformMetric<number>;
    redemptions_30d: PlatformMetric<number>;
    last_redemption_at: PlatformMetric<string | null>;
    breakdown_30d: { points: number; welcome: number; birthday: number };
    failures_24h: number;
  };
  referral:
    | {
        status: "available";
        health: PlatformSubsystemHealth;
        enabled: boolean;
        multiplier: 2;
        configured_duration_days: number;
        duration_type: "preset" | "custom";
        monthly_invite_limit: number;
        friend_duration_ratio: 0.5;
        qualified_referrals_30d: number;
        active_boosters: number;
        boost_extra_points_30d: number;
        last_qualified_referral_at: string | null;
      }
    | { status: "unavailable"; health: "unavailable"; value: null };
  health: {
    registration: {
      status: PlatformSubsystemHealth;
      last_success: string | null;
      failures_24h: number;
      failures_7d: number;
    };
    email: {
      status: PlatformSubsystemHealth;
      last_success: string | null;
      last_failure: string | null;
      failed_24h: number;
      pending_retry_count: number;
    };
    geolocation: {
      status: PlatformSubsystemHealth;
      address_complete: boolean | null;
      coordinates_present: boolean | null;
      public_search_eligible: boolean | null;
      last_geocode_status: PlatformMetric<string>;
    };
    staff: {
      status: PlatformSubsystemHealth;
      staff_count: PlatformMetric<number>;
      daily_pin_available: PlatformMetric<boolean>;
      qr_flow_available: PlatformMetric<boolean>;
    };
    cron: {
      status: "unavailable";
      last_success: null;
      last_failure: null;
      failure_count: null;
      reason: string;
    };
  };
  audit: Array<{
    id: string;
    timestamp: string;
    actor_type: string;
    actor_label: string;
    event_key: string;
    event_label: string;
    status: "success" | "failed" | "blocked";
    target_type: string | null;
    target_id: string | null;
    before: Record<string, string | null> | null;
    after: Record<string, string | null> | null;
  }>;
  capabilities: {
    restaurant_status_change: "supported";
    subscription_update: "supported";
    trial_extension: "supported";
    manual_payment: { status: "deferred"; reason: string };
  };
};

export type PlatformOperationAction =
  | "restaurant_activate" | "restaurant_inactivate" | "restaurant_publish" | "restaurant_unpublish"
  | "tenant_suspend" | "tenant_unsuspend" | "security_flag_set" | "security_flag_clear"
  | "owner_membership_repair" | "staff_suspend" | "staff_reactivate" | "staff_invitation_revoke"
  | "customer_membership_repair" | "customer_deactivate" | "customer_reactivate"
  | "points_support_correction" | "qr_invalidate" | "gift_presentation_expire" | "transactional_mail_retry";

export type PlatformRestaurantOperations = {
  contract_version: "platform_admin_operations_v1_1";
  restaurant: { id: string; name: string; status: RestaurantStatus; organization_status: RestaurantStatus | null; published: boolean; branch_id: string | null };
  owner: { user_id: string; email: string | null; email_confirmed: boolean; last_sign_in_at: string | null; membership_present: boolean; memberships: Array<{ restaurant_id: string; role: string; created_at: string }> };
  staff: Array<{ id: string; name: string; email: string | null; role: string; status: string; active: boolean; auth_linked: boolean; membership_present: boolean; last_invited_at: string | null }>;
  customers: Array<{ id: string; name: string; points_balance: number; membership_status: string; auth_linked: boolean; central_membership_present: boolean; account_disabled: boolean }>;
  points_journal: Array<{ id: string; customer_id: string; type: string; points: number; reason: string; source: string | null; staff_user_id: string | null; created_at: string }>;
  gifts: Array<{ id: string; customer_id: string; reward_id: string; status: string; gift_type: string | null; created_at: string; redeemed_at: string | null }>;
  gift_presentations: Array<{ id: string; customer_id: string; customer_reward_id: string; status: string; expires_at: string; redeemed_at: string | null; expired_at: string | null; created_at: string }>;
  redemptions: Array<{ id: string; customer_id: string | null; reward_type: string; status: string; redeemed_at: string; actor_role: string }>;
  qr_evidence: Array<{ id: string; customer_id: string; expires_at: string; consumed_at: string | null; revoked_at: string | null; created_at: string }>;
  pin_evidence: Array<{ id: string; customer_id: string; valid_date: string; failed_attempts: number; locked_until: string | null; last_failed_at: string | null }>;
  mail_queue: Array<{ id: string; customer_id: string; event_type: string; status: string; attempt_count: number; available_at: string; failed_at: string | null; last_error_code: string | null }>;
  security_flags: Array<{ id: string; flag_key: string; status: string; reason: string; opened_at: string; cleared_at: string | null }>;
  operations: Array<{ id: string; action_type: string; entity_type: string; entity_id: string | null; severity: "NORMAL" | "SENSITIVE" | "CRITICAL"; reason: string | null; support_reference: string | null; result: string; created_at: string }>;
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

export async function loadPlatformRestaurantControlCenter(
  restaurantId: string,
): Promise<PlatformRestaurantControlCenter> {
  if (!supabase) {
    throw new Error("Supabase ist nicht konfiguriert.");
  }

  const { data, error } = await supabase.rpc("get_platform_restaurant_control_center", {
    input_restaurant_id: restaurantId,
  });

  if (error) {
    throw error;
  }

  return data as PlatformRestaurantControlCenter;
}

export async function loadPlatformOperationalTelemetry(): Promise<PlatformOperationalTelemetry> {
  if (!supabase) {
    throw new Error("Supabase ist nicht konfiguriert.");
  }

  const { data, error } = await supabase.rpc("get_platform_operational_telemetry");
  if (error) {
    throw error;
  }

  return data as PlatformOperationalTelemetry;
}

export async function loadPlatformRestaurantOperations(restaurantId: string): Promise<PlatformRestaurantOperations> {
  if (!supabase) throw new Error("Supabase ist nicht konfiguriert.");
  const { data, error } = await supabase.rpc("get_platform_restaurant_operations", { input_restaurant_id: restaurantId });
  if (error) throw error;
  return data as PlatformRestaurantOperations;
}

export async function executePlatformAdminOperation(input: {
  restaurantId: string;
  action: PlatformOperationAction;
  entityId?: string | null;
  reason?: string;
  supportReference?: string;
  confirmation?: string;
  payload?: Record<string, unknown>;
}) {
  if (!supabase) throw new Error("Supabase ist nicht konfiguriert.");
  const { data, error } = await supabase.rpc("execute_platform_admin_operation", {
    input_restaurant_id: input.restaurantId,
    input_action: input.action,
    input_entity_id: input.entityId ?? null,
    input_reason: input.reason ?? null,
    input_support_reference: input.supportReference ?? null,
    input_confirmation: input.confirmation ?? null,
    input_idempotency_key: crypto.randomUUID(),
    input_payload: input.payload ?? {},
  });
  if (error) throw error;
  return data as { success: boolean; operation_id: string };
}

export async function requestPlatformAuthSupport(input: {
  restaurantId: string;
  entityId: string;
  action: "owner_confirmation_resend" | "owner_password_recovery" | "staff_invitation_resend";
  reason: string;
  supportReference?: string;
}) {
  if (!supabase) throw new Error("Supabase ist nicht konfiguriert.");
  const { error } = await supabase.functions.invoke("platform-support-auth", {
    body: { ...input, idempotencyKey: crypto.randomUUID() },
  });
  if (error) throw new Error("E-Mail-Aktion konnte nicht ausgeführt werden.");
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

export async function loadPlatformAuditEvents(filters: PlatformAuditFilters = {}): Promise<PlatformAuditEvent[]> {
  if (!supabase) {
    throw new Error("Supabase ist nicht konfiguriert.");
  }

  const { data, error } = await supabase.rpc("get_platform_audit_events", {
    input_from: filters.from ?? null,
    input_to: filters.to ?? null,
    input_restaurant_id: filters.restaurantId ?? null,
    input_customer_id: filters.customerId ?? null,
    input_event_type: filters.eventType ?? null,
    input_status: filters.status ?? null,
    input_source: filters.source ?? null,
    input_actor_type: filters.actorType ?? null,
    input_test_only: filters.testOnly ?? false,
    input_failed_only: filters.failedOnly ?? false,
    input_limit: filters.limit ?? 100,
  });

  if (error) throw error;
  return (data ?? []) as PlatformAuditEvent[];
}
