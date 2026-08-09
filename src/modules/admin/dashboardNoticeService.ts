import { liveDataUnavailableMessage, supabase } from "../../shared/lib/supabase";

export type DashboardSetupStatus = {
  pointsRedemptionReady: boolean;
  welcomeGiftReady: boolean;
  birthdayPoolReady: boolean;
  pointsFlowReady: boolean;
  referralEnabled: boolean;
};

export async function loadDashboardSetupStatus(restaurantId: string): Promise<DashboardSetupStatus> {
  if (!supabase) throw new Error(liveDataUnavailableMessage);

  const [rewardsResult, couponsResult, settingsResult] = await Promise.all([
    supabase
      .from("rewards")
      .select("id, active, is_starter_reward, birthday_pool_enabled, required_points, required_stamps, expires_at")
      .eq("restaurant_id", restaurantId),
    supabase
      .from("coupons")
      .select("id, status, required_points, required_stamps, expires_at")
      .eq("restaurant_id", restaurantId),
    supabase
      .from("loyalty_settings")
      .select("active, points_collection_mode, points_collection_max_amount_cents, referral_boost_enabled")
      .eq("restaurant_id", restaurantId)
      .maybeSingle(),
  ]);

  if (rewardsResult.error) throw rewardsResult.error;
  if (couponsResult.error) throw couponsResult.error;
  if (settingsResult.error) throw settingsResult.error;

  const rewards = (rewardsResult.data ?? []) as Array<{
    active: boolean;
    is_starter_reward: boolean | null;
    birthday_pool_enabled: boolean | null;
    required_points: number | null;
    required_stamps: number | null;
    expires_at: string | null;
  }>;
  const coupons = (couponsResult.data ?? []) as Array<{
    status: string;
    required_points: number | null;
    required_stamps: number | null;
    expires_at: string | null;
  }>;
  const settings = settingsResult.data as {
    active: boolean;
    points_collection_mode: string | null;
    points_collection_max_amount_cents: number | null;
    referral_boost_enabled: boolean | null;
  } | null;
  const validCollectionModes = new Set(["restaurant_controlled_only", "customer_initiated_only", "both"]);
  const now = Date.now();
  const isNotExpired = (expiresAt: string | null) => !expiresAt || new Date(expiresAt).getTime() > now;

  return {
    pointsRedemptionReady: rewards.some((reward) => reward.active
      && !reward.is_starter_reward
      && isNotExpired(reward.expires_at)
      && (Number(reward.required_points) > 0 || Number(reward.required_stamps) > 0))
      || coupons.some((coupon) => coupon.status === "active"
        && isNotExpired(coupon.expires_at)
        && (Number(coupon.required_points) > 0 || Number(coupon.required_stamps) > 0)),
    welcomeGiftReady: rewards.some((reward) => reward.active
      && Boolean(reward.is_starter_reward)
      && isNotExpired(reward.expires_at)),
    birthdayPoolReady: rewards.some((reward) => reward.active
      && Boolean(reward.is_starter_reward)
      && Boolean(reward.birthday_pool_enabled)
      && isNotExpired(reward.expires_at)),
    pointsFlowReady: Boolean(settings?.active
      && settings.points_collection_mode
      && validCollectionModes.has(settings.points_collection_mode)
      && Number(settings.points_collection_max_amount_cents) >= 100
      && Number(settings.points_collection_max_amount_cents) <= 100000),
    referralEnabled: Boolean(settings?.referral_boost_enabled),
  };
}

export async function loadSeenDashboardNotices(restaurantId: string): Promise<Set<string>> {
  if (!supabase) throw new Error(liveDataUnavailableMessage);
  const { data, error } = await supabase
    .from("owner_dashboard_notice_views")
    .select("notice_key")
    .eq("restaurant_id", restaurantId);
  if (error) throw error;
  return new Set((data ?? []).map((record) => String(record.notice_key)));
}

export async function markDashboardNoticeSeen(restaurantId: string, noticeKey: string): Promise<void> {
  if (!supabase) throw new Error(liveDataUnavailableMessage);
  const { error } = await supabase
    .from("owner_dashboard_notice_views")
    .insert({ restaurant_id: restaurantId, notice_key: noticeKey });
  if (error && error.code !== "23505") throw error;
}
