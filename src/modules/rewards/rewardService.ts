import {
  demoCoupons,
  demoCustomers,
  demoRedeemedOfferIds,
  demoRewards,
} from "../../shared/lib/demoData";
import { isLocalDemoMode, liveDataUnavailableMessage, supabase } from "../../shared/lib/supabase";
import type { Coupon, Customer, Reward, RewardType } from "../../shared/types/domain";

export type RewardOfferSource = "reward" | "coupon";

export type RewardOffer = {
  id: string;
  source: RewardOfferSource;
  restaurant_id: string;
  title: string;
  description: string;
  reward_type: RewardType;
  required_points: number;
  required_stamps: number;
  category: string | null;
  product_group: string | null;
  image_url: string | null;
  product_price: number | null;
  active_days: string[];
  welcome_gift_mode: "value_limit" | "fixed_product";
  fixed_product_name: string | null;
  available_products: string[];
  is_starter_reward: boolean;
  starter_reward_key: string | null;
  starter_reward_order: number;
  active: boolean;
  expires_at: string | null;
  created_at: string;
};

export type RewardOfferInput = {
  id?: string;
  source: RewardOfferSource;
  restaurant_id: string;
  title: string;
  description: string;
  reward_type: RewardType;
  required_points: number;
  required_stamps: number;
  category?: string | null;
  product_group?: string | null;
  image_url?: string | null;
  product_price?: number | null;
  active_days?: string[];
  welcome_gift_mode?: "value_limit" | "fixed_product";
  fixed_product_name?: string | null;
  available_products?: string[];
  is_starter_reward?: boolean;
  starter_reward_key?: string | null;
  starter_reward_order?: number;
  active: boolean;
  expires_at: string | null;
};

export type CustomerRewardView = RewardOffer & {
  status: "locked" | "unlocked" | "redeemed";
  remaining_points: number;
  remaining_stamps: number;
};

export type StaffCustomerRewardView = RewardOffer & {
  customer_reward_id: string;
  customer_reward_status: "locked" | "active";
  status: "locked" | "unlocked";
  unlocked_at: string | null;
  redeemed_at: string | null;
};

export type RedeemRewardInput = {
  restaurantId: string;
  customerId: string;
  offerId: string;
  source: RewardOfferSource;
  staffSessionToken: string;
};

export type RedeemRewardResult = {
  points_balance: number;
  stamp_balance: number;
  redeemed_offer_id: string;
  redemption_id?: string;
  is_starter_reward?: boolean;
  points_spent?: number;
  stamps_spent?: number;
};

export type RedeemCustomerRewardInput = {
  customerToken: string;
  rewardId: string;
};

export type RewardKpis = {
  rewardsRedeemedToday: number;
  pointsIssuedToday: number;
  stampsIssuedToday: number;
  activeRewards: number;
  activeCustomers: number;
};

const rewardSelect =
  "id, restaurant_id, title, description, reward_type, required_points, required_stamps, category, available_products, image_url, product_price, active_days, welcome_gift_mode, fixed_product_name, is_starter_reward, starter_reward_key, starter_reward_order, active, expires_at, created_at";
const legacyRewardSelect =
  "id, restaurant_id, title, description, reward_type, required_points, required_stamps, category, available_products, image_url, is_starter_reward, active, expires_at, created_at";

const couponSelect =
  "id, restaurant_id, campaign_id, title, description, reward_type, required_points, required_stamps, status, expires_at, created_at";

function toRewardOffer(record: Reward | Coupon, source: RewardOfferSource): RewardOffer {
  return {
    id: record.id,
    source,
    restaurant_id: record.restaurant_id,
    title: record.title,
    description: record.description,
    reward_type: record.reward_type,
    required_points: record.required_points,
    required_stamps: record.required_stamps,
    category: source === "reward" ? (record as Reward).category ?? null : null,
    product_group: source === "reward" ? ((record as Reward).available_products ?? []).join(", ") || null : "Angebot",
    image_url: source === "reward" ? (record as Reward).image_url ?? null : null,
    product_price: source === "reward" ? (record as Reward).product_price ?? null : null,
    active_days: source === "reward"
      ? (record as Reward).active_days ?? ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
      : ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
    welcome_gift_mode: source === "reward" ? (record as Reward).welcome_gift_mode ?? "value_limit" : "value_limit",
    fixed_product_name: source === "reward" ? (record as Reward).fixed_product_name ?? null : null,
    available_products: source === "reward" ? (record as Reward).available_products ?? [] : [],
    is_starter_reward: source === "reward" ? Boolean((record as Reward).is_starter_reward) : false,
    starter_reward_key: source === "reward" ? (record as Reward).starter_reward_key ?? null : null,
    starter_reward_order: source === "reward" ? (record as Reward).starter_reward_order ?? 0 : 0,
    active: source === "reward" ? (record as Reward).active : (record as Coupon).status === "active",
    expires_at: record.expires_at,
    created_at: record.created_at,
  };
}

function demoOffers(restaurantId: string): RewardOffer[] {
  return [
    ...demoRewards.map((reward) => toRewardOffer({ ...reward, restaurant_id: restaurantId }, "reward")),
    ...demoCoupons.map((coupon) => toRewardOffer({ ...coupon, restaurant_id: restaurantId }, "coupon")),
  ];
}

function normalizeRewardRelation(reward: Reward | Reward[] | null | undefined): Reward | null {
  if (Array.isArray(reward)) return reward[0] ?? null;
  return reward ?? null;
}

function isMissingRewardColumnError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const maybeError = error as { code?: string; message?: string };
  return maybeError.code === "42703" || /product_price|active_days|welcome_gift_mode|fixed_product_name|starter_reward_key|starter_reward_order/i.test(maybeError.message ?? "");
}

export function getRewardStatus(offer: RewardOffer, customer: Customer, redeemedIds: string[]): CustomerRewardView {
  const remainingPoints = Math.max(0, offer.required_points - customer.points_balance);
  const remainingStamps = Math.max(0, offer.required_stamps - customer.stamp_balance);
  const unlocked = remainingPoints === 0 && remainingStamps === 0;

  return {
    ...offer,
    status: redeemedIds.includes(`${offer.source}:${offer.id}`) || redeemedIds.includes(offer.id)
      ? "redeemed"
      : unlocked
        ? "unlocked"
        : "locked",
    remaining_points: remainingPoints,
    remaining_stamps: remainingStamps,
  };
}

export async function loadRewardOffers(restaurantId: string): Promise<RewardOffer[]> {
  if (isLocalDemoMode) {
    return demoOffers(restaurantId);
  }
  if (!supabase) {
    throw new Error(liveDataUnavailableMessage);
  }

  let rewardsQuery: { data: unknown; error: unknown; count?: number | null } = await supabase
    .from("rewards")
    .select(rewardSelect)
    .eq("restaurant_id", restaurantId)
    .order("created_at", { ascending: true });

  if (rewardsQuery.error && isMissingRewardColumnError(rewardsQuery.error)) {
    rewardsQuery = await supabase
      .from("rewards")
      .select(legacyRewardSelect)
      .eq("restaurant_id", restaurantId)
      .order("created_at", { ascending: true });
  }

  const [rewardsResult, couponsResult] = await Promise.all([
    Promise.resolve(rewardsQuery),
    supabase.from("coupons").select(couponSelect).eq("restaurant_id", restaurantId).order("created_at", { ascending: true }),
  ]);

  if (rewardsResult.error) throw rewardsResult.error;
  if (couponsResult.error) throw couponsResult.error;

  return [
    ...((rewardsResult.data ?? []) as Reward[]).map((reward) => toRewardOffer(reward, "reward")),
    ...((couponsResult.data ?? []) as Coupon[]).map((coupon) => toRewardOffer(coupon, "coupon")),
  ];
}

export async function loadStaffCustomerRewards(
  restaurantId: string,
  customerId: string,
): Promise<StaffCustomerRewardView[]> {
  if (isLocalDemoMode) {
    return demoOffers(restaurantId)
      .filter((offer) => offer.source === "reward" && offer.active)
      .slice(0, 1)
      .map((offer) => ({
        ...offer,
        customer_reward_id: `demo-customer-reward-${offer.id}`,
        customer_reward_status: "active" as const,
        status: "unlocked" as const,
        unlocked_at: new Date().toISOString(),
        redeemed_at: null,
      }));
  }
  if (!supabase) {
    throw new Error(liveDataUnavailableMessage);
  }

  const { data, error } = await supabase
    .from("customer_rewards")
    .select(`
      id,
      restaurant_id,
      customer_id,
      reward_id,
      status,
      redeemed_at,
      unlocked_at,
      is_starter_reward,
      reward:rewards!inner(${rewardSelect})
    `)
    .eq("restaurant_id", restaurantId)
    .eq("customer_id", customerId)
    .in("status", ["active", "locked"])
    .order("created_at", { ascending: true });

  if (error) throw error;

  type CustomerRewardRow = {
    id: string;
    restaurant_id: string;
    customer_id: string;
    reward_id: string;
    status: "active" | "locked" | "redeemed" | "expired";
    redeemed_at: string | null;
    unlocked_at: string | null;
    is_starter_reward: boolean;
    reward?: Reward | Reward[] | null;
  };

  const now = Date.now();

  return ((data ?? []) as CustomerRewardRow[])
    .map((row) => {
      const reward = normalizeRewardRelation(row.reward);
      if (!reward) return null;
      if (reward.restaurant_id !== restaurantId) return null;
      if (!reward.active) return null;
      if (reward.expires_at && new Date(reward.expires_at).getTime() <= now) return null;
      if (row.status !== "active" && row.status !== "locked") return null;

      const offer = toRewardOffer(reward, "reward");

      return {
        ...offer,
        customer_reward_id: row.id,
        customer_reward_status: row.status,
        status: row.status === "active" ? ("unlocked" as const) : ("locked" as const),
        unlocked_at: row.unlocked_at,
        redeemed_at: row.redeemed_at,
      };
    })
    .filter((offer): offer is StaffCustomerRewardView => offer !== null);
}

export async function saveRewardOffer(input: RewardOfferInput): Promise<RewardOffer> {
  if (isLocalDemoMode) {
    return {
      ...input,
      id: input.id ?? `offer-${globalThis.crypto?.randomUUID?.() ?? Date.now()}`,
      category: input.category ?? null,
      product_group: input.product_group ?? null,
      image_url: input.image_url ?? null,
      product_price: input.product_price ?? null,
      active_days: input.active_days ?? ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
      welcome_gift_mode: input.welcome_gift_mode ?? "value_limit",
      fixed_product_name: input.fixed_product_name ?? null,
      available_products: input.available_products ?? [],
      is_starter_reward: input.is_starter_reward ?? false,
      starter_reward_key: input.starter_reward_key ?? null,
      starter_reward_order: input.starter_reward_order ?? 0,
      created_at: new Date().toISOString(),
    };
  }
  if (!supabase) {
    throw new Error(liveDataUnavailableMessage);
  }

  if (input.source === "reward") {
    const payload = {
      restaurant_id: input.restaurant_id,
      title: input.title,
      description: input.description,
      reward_type: input.reward_type,
      required_points: input.required_points,
      required_stamps: input.required_stamps,
      category: input.category ?? null,
      available_products: input.available_products ?? [],
      image_url: input.image_url ?? null,
      product_price: input.product_price ?? null,
      active_days: input.active_days ?? ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
      welcome_gift_mode: input.welcome_gift_mode ?? "value_limit",
      fixed_product_name: input.fixed_product_name ?? null,
      is_starter_reward: input.is_starter_reward ?? false,
      starter_reward_key: input.starter_reward_key ?? null,
      starter_reward_order: input.starter_reward_order ?? 0,
      active: input.active,
      expires_at: input.expires_at,
    };

    const query = input.id
      ? supabase.from("rewards").update(payload).eq("id", input.id).eq("restaurant_id", input.restaurant_id)
      : supabase.from("rewards").insert(payload);
    let { data, error }: { data: unknown; error: unknown } = await query.select(rewardSelect).single();

    if (error && isMissingRewardColumnError(error)) {
      const legacyPayload = {
        restaurant_id: input.restaurant_id,
        title: input.title,
        description: input.description,
        reward_type: input.reward_type,
        required_points: input.required_points,
        required_stamps: input.required_stamps,
        category: input.category ?? null,
        available_products: input.available_products ?? [],
        image_url: input.image_url ?? null,
        is_starter_reward: input.is_starter_reward ?? false,
        active: input.active,
        expires_at: input.expires_at,
      };
      const legacyQuery = input.id
        ? supabase.from("rewards").update(legacyPayload).eq("id", input.id).eq("restaurant_id", input.restaurant_id)
        : supabase.from("rewards").insert(legacyPayload);
      const legacyResult = await legacyQuery.select(legacyRewardSelect).single();
      data = legacyResult.data;
      error = legacyResult.error;
    }

    if (error) throw error;
    return toRewardOffer(data as Reward, "reward");
  }

  const payload = {
    restaurant_id: input.restaurant_id,
    campaign_id: null,
    title: input.title,
    description: input.description,
    reward_type: input.reward_type,
    required_points: input.required_points,
    required_stamps: input.required_stamps,
    status: input.active ? "active" : "draft",
    expires_at: input.expires_at,
  };

  const query = input.id
    ? supabase.from("coupons").update(payload).eq("id", input.id).eq("restaurant_id", input.restaurant_id)
    : supabase.from("coupons").insert(payload);
  const { data, error } = await query.select(couponSelect).single();

  if (error) throw error;
  return toRewardOffer(data as Coupon, "coupon");
}

export async function setRewardOfferActive(offer: RewardOffer, active: boolean): Promise<RewardOffer> {
  if (isLocalDemoMode) {
    return { ...offer, active };
  }
  if (!supabase) {
    throw new Error(liveDataUnavailableMessage);
  }

  if (offer.source === "reward") {
    let { data, error }: { data: unknown; error: unknown } = await supabase
      .from("rewards")
      .update({ active })
      .eq("id", offer.id)
      .eq("restaurant_id", offer.restaurant_id)
      .eq("is_starter_reward", offer.is_starter_reward)
      .select(rewardSelect)
      .single();

    if (error && isMissingRewardColumnError(error)) {
      const legacyResult = await supabase
        .from("rewards")
        .update({ active })
        .eq("id", offer.id)
        .eq("restaurant_id", offer.restaurant_id)
        .eq("is_starter_reward", offer.is_starter_reward)
        .select(legacyRewardSelect)
        .single();
      data = legacyResult.data;
      error = legacyResult.error;
    }

    if (error) throw error;
    return toRewardOffer(data as Reward, "reward");
  }

  return saveRewardOffer({ ...offer, active });
}

export async function loadRedeemedOfferKeys(restaurantId: string, customerId: string): Promise<string[]> {
  if (isLocalDemoMode) {
    return demoRedeemedOfferIds;
  }
  if (!supabase) {
    throw new Error(liveDataUnavailableMessage);
  }

  const [customerRewardsResult, couponRedemptionsResult] = await Promise.all([
    supabase
      .from("customer_rewards")
      .select("reward_id")
      .eq("restaurant_id", restaurantId)
      .eq("customer_id", customerId)
      .eq("status", "redeemed"),
    supabase
      .from("coupon_redemptions")
      .select("coupon_id")
      .eq("restaurant_id", restaurantId)
      .eq("customer_id", customerId),
  ]);

  if (customerRewardsResult.error) throw customerRewardsResult.error;
  if (couponRedemptionsResult.error) throw couponRedemptionsResult.error;

  return [
    ...((customerRewardsResult.data ?? []) as { reward_id: string }[]).map((item) => `reward:${item.reward_id}`),
    ...((couponRedemptionsResult.data ?? []) as { coupon_id: string }[]).map((item) => `coupon:${item.coupon_id}`),
  ];
}

export async function redeemReward(input: RedeemRewardInput): Promise<RedeemRewardResult> {
  if (isLocalDemoMode) {
    const customer = demoCustomers.find((item) => item.id === input.customerId) ?? demoCustomers[0];
    const offer = demoOffers(input.restaurantId).find((item) => item.id === input.offerId && item.source === input.source);
    return {
      points_balance: Math.max(0, customer.points_balance - (offer?.required_points ?? 0)),
      stamp_balance: Math.max(0, customer.stamp_balance - (offer?.required_stamps ?? 0)),
      redeemed_offer_id: input.offerId,
    };
  }
  if (!supabase) {
    throw new Error(liveDataUnavailableMessage);
  }

  const { data, error } = await supabase.rpc("redeem_reward_with_staff_session", {
    input_restaurant_id: input.restaurantId,
    input_customer_id: input.customerId,
    input_offer_source: input.source,
    input_offer_id: input.offerId,
    input_staff_session_token: input.staffSessionToken,
  });

  if (error) throw error;
  return data as RedeemRewardResult;
}

export async function redeemCustomerReward(input: RedeemCustomerRewardInput): Promise<RedeemRewardResult> {
  if (!supabase) {
    throw new Error("Punkteeinlösung konnte nicht verwendet werden.");
  }

  const { data, error } = await supabase.rpc("redeem_customer_reward", {
    input_customer_token: input.customerToken,
    input_reward_id: input.rewardId,
  });

  if (error) throw error;
  return data as RedeemRewardResult;
}

export async function loadRewardKpis(restaurantId: string): Promise<RewardKpis> {
  if (isLocalDemoMode) {
    return {
      rewardsRedeemedToday: 3,
      pointsIssuedToday: 180,
      stampsIssuedToday: 12,
      activeRewards: demoOffers(restaurantId).filter((offer) => offer.active).length,
      activeCustomers: demoCustomers.length,
    };
  }
  if (!supabase) {
    throw new Error(liveDataUnavailableMessage);
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayIso = today.toISOString();

  const [rewardRedemptions, couponRedemptions, points, stamps, activeRewards, activeCoupons, activeCustomers] =
    await Promise.all([
      supabase.from("customer_rewards").select("id", { count: "exact", head: true }).eq("restaurant_id", restaurantId).eq("status", "redeemed").gte("redeemed_at", todayIso),
      supabase.from("coupon_redemptions").select("id", { count: "exact", head: true }).eq("restaurant_id", restaurantId).gte("redeemed_at", todayIso),
      supabase.from("points_transactions").select("points").eq("restaurant_id", restaurantId).eq("type", "earn").gte("created_at", todayIso),
      supabase.from("stamp_transactions").select("stamps").eq("restaurant_id", restaurantId).gte("created_at", todayIso),
      supabase.from("rewards").select("id", { count: "exact", head: true }).eq("restaurant_id", restaurantId).eq("active", true),
      supabase.from("coupons").select("id", { count: "exact", head: true }).eq("restaurant_id", restaurantId).eq("status", "active"),
      supabase.from("customers").select("id", { count: "exact", head: true }).eq("restaurant_id", restaurantId),
    ]);

  for (const result of [rewardRedemptions, couponRedemptions, points, stamps, activeRewards, activeCoupons, activeCustomers]) {
    if (result.error) throw result.error;
  }

  return {
    rewardsRedeemedToday: (rewardRedemptions.count ?? 0) + (couponRedemptions.count ?? 0),
    pointsIssuedToday: ((points.data ?? []) as { points: number }[]).reduce((sum, item) => sum + item.points, 0),
    stampsIssuedToday: ((stamps.data ?? []) as { stamps: number }[]).reduce((sum, item) => sum + item.stamps, 0),
    activeRewards: (activeRewards.count ?? 0) + (activeCoupons.count ?? 0),
    activeCustomers: activeCustomers.count ?? 0,
  };
}
