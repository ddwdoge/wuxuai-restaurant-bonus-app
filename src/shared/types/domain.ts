export type PlatformRole =
  | "platform_owner"
  | "platform_admin"
  | "app_admin"
  | "super_admin"
  | "wuxuai_admin"
  | "support"
  | "billing_admin"
  | "security_admin"
  | "viewer";
export type RestaurantUserRole = "owner" | "admin" | "manager" | "staff" | "supervisor" | "customer";
export type UserRole = RestaurantUserRole | PlatformRole;

export type LoyaltyMode = "amount_based" | "stamp_based" | "menu_points";
export type RewardType = "reward" | "coupon";

export type Restaurant = {
  id: string;
  owner_id: string;
  organization_id?: string;
  primary_branch_id?: string | null;
  name: string;
  slug: string;
  status: "active" | "draft" | "suspended";
  owner_phone?: string | null;
  restaurant_type?: string | null;
  language?: string | null;
  opening_hours?: unknown;
  smart_open_enabled?: boolean;
  onboarding_status?: "draft" | "ready" | "completed";
  onboarding_checklist?: Record<string, boolean>;
  created_at: string;
};

export type Organization = {
  id: string;
  owner_id: string;
  name: string;
  status: "active" | "draft" | "suspended";
  created_at: string;
};

export type Branch = {
  id: string;
  organization_id: string;
  restaurant_id: string;
  name: string;
  slug: string;
  status: "active" | "draft" | "suspended";
  created_at: string;
};

export type BranchSubscription = {
  id: string;
  organization_id: string;
  branch_id: string;
  status: "trialing" | "active" | "past_due" | "unpaid" | "cancelled" | "paused";
  subscription_status?: "trialing" | "active" | "past_due" | "unpaid" | "cancelled" | "paused";
  payment_status?: "not_required" | "pending" | "paid" | "failed" | "manual";
  plan_key: string;
  current_period_ends_at: string | null;
  current_period_end?: string | null;
  trial_started_at?: string | null;
  trial_ends_at?: string | null;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  paused_at?: string | null;
  locked_at?: string | null;
  lock_reason?: string | null;
  created_at: string;
};

export type RestaurantBranding = {
  id: string;
  restaurant_id: string;
  organization_id?: string;
  branch_id?: string;
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;
  button_color: string;
  font_family: string;
  created_at: string;
};

export type Customer = {
  id: string;
  restaurant_id: string;
  organization_id?: string;
  branch_id?: string;
  name: string;
  phone: string | null;
  email: string | null;
  birthday: string | null;
  customer_code: string;
  points_balance: number;
  stamp_balance: number;
  membership_level: string;
  created_at: string;
};

export type LoyaltySettings = {
  id: string;
  restaurant_id: string;
  organization_id?: string;
  branch_id?: string;
  loyalty_mode: LoyaltyMode;
  amount_per_point: number;
  redemption_return_rate?: number;
  stamps_required: number;
  bonus_amount_tiers?: unknown;
  bonus_boost_multiplier?: number;
  smart_upsell_enabled?: boolean;
  smart_upsell_threshold?: number;
  referral_boost_enabled?: boolean;
  referral_boost_multiplier?: number;
  referral_boost_duration_days?: number;
  active: boolean;
  created_at: string;
};

export type LoyaltyRule = {
  id: string;
  restaurant_id: string;
  organization_id?: string;
  branch_id?: string;
  title: string;
  points: number;
  stamps: number;
  min_amount: number;
  active: boolean;
  created_at: string;
};

export type Campaign = {
  id: string;
  restaurant_id: string;
  organization_id?: string;
  branch_id?: string;
  title: string;
  slug: string;
  description: string;
  status: "active" | "draft" | "expired";
  start_date: string | null;
  end_date: string | null;
  starter_offer_source: "reward" | "coupon" | null;
  starter_reward_id: string | null;
  starter_coupon_id: string | null;
  created_at: string;
};

export type Reward = {
  id: string;
  restaurant_id: string;
  organization_id?: string;
  branch_id?: string;
  title: string;
  description: string;
  reward_type: RewardType;
  required_points: number;
  required_stamps: number;
  category?: string | null;
  available_products?: string[];
  image_url?: string | null;
  product_price?: number | null;
  active_days?: string[];
  welcome_gift_mode?: "value_limit" | "fixed_product";
  fixed_product_name?: string | null;
  is_starter_reward?: boolean;
  starter_reward_key?: string | null;
  starter_reward_order?: number;
  active: boolean;
  expires_at: string | null;
  created_at: string;
};

export type Coupon = {
  id: string;
  restaurant_id: string;
  organization_id?: string;
  branch_id?: string;
  campaign_id: string | null;
  title: string;
  description: string;
  reward_type: RewardType;
  required_points: number;
  required_stamps: number;
  media_url?: string | null;
  media_type?: "image" | "pdf" | null;
  status: "active" | "draft" | "expired";
  expires_at: string | null;
  created_at: string;
};

export type AuditActorType = "admin" | "staff" | "customer" | "system";

export type AuditEvent = {
  restaurant_id: string;
  actor_type: AuditActorType;
  actor_id: string | null;
  action: string;
  target_table: string | null;
  target_id: string | null;
  metadata?: Record<string, unknown>;
};
