import { supabase } from "../../shared/lib/supabase";
import { loadPublicRestaurantOffers, type RestaurantOffer } from "../offers/restaurantOfferService";
import { loadCustomerAccount } from "./customerAccountService";

export type PartnerRewardSummary = {
  id: string;
  title: string;
  required_points: number;
  image_url: string | null;
  expires_at: string | null;
};

export type PartnerMembership = {
  registered: boolean;
  points_balance: number;
  visits_count: number;
  last_visit_at: string | null;
  available_rewards: PartnerRewardSummary[];
  next_reward: (PartnerRewardSummary & { missing_points: number }) | null;
};

export type PartnerRestaurant = {
  restaurant_id: string;
  branch_id: string;
  name: string;
  slug: string;
  address: string;
  postal_code: string;
  city: string;
  country: string;
  latitude: number;
  longitude: number;
  logo_url: string | null;
  cover_image_url: string | null;
  cover_image_zoom?: number | null;
  cover_image_position_x?: number | null;
  cover_image_position_y?: number | null;
  short_description: string | null;
  opening_hours: unknown;
  special_days?: unknown;
  holidays?: unknown;
  welcome_reward_available: boolean;
  active_reward_count: number;
  offers: RestaurantOffer[];
  membership: PartnerMembership | null;
  distance_km: number | null;
  opening_status?: {
    isOpen: boolean;
    state: "open" | "closed" | "opens_later" | "lunch_break" | "unknown";
    message: string;
    todayHours: string | null;
  } | null;
};

export type PartnerRestaurantFinderResult = {
  locations: PartnerRestaurant[];
  hasCustomerAccess: boolean;
  total: number;
};

function safeMembership(value: unknown): PartnerMembership | null {
  if (!value || typeof value !== "object" || !("registered" in value)) return null;
  const membership = value as Partial<PartnerMembership>;
  if (!membership.registered) return null;
  return {
    registered: true,
    points_balance: Number(membership.points_balance) || 0,
    visits_count: Number(membership.visits_count) || 0,
    last_visit_at: typeof membership.last_visit_at === "string" ? membership.last_visit_at : null,
    available_rewards: Array.isArray(membership.available_rewards) ? membership.available_rewards : [],
    next_reward: membership.next_reward ?? null,
  };
}

export async function loadPartnerRestaurants(): Promise<PartnerRestaurantFinderResult> {
  if (!supabase) throw new Error("Partnerrestaurants konnten nicht geladen werden.");
  const client = supabase;

  const [{ data, error }, publicOffers, account] = await Promise.all([
    client.rpc("get_partner_local_finder", {
      input_customer_tokens: {},
      input_limit: 100,
      input_offset: 0,
    }),
    loadPublicRestaurantOffers(null, 100).catch(() => []),
    loadCustomerAccount().catch(() => null),
  ]);
  if (error) throw error;

  const accountMemberships = new Map((account?.memberships ?? []).map((membership) => [membership.restaurant_id, membership]));

  const payload = data && typeof data === "object" && !Array.isArray(data)
    ? data as { items?: unknown; total?: unknown }
    : {};
  const items = Array.isArray(payload.items) ? payload.items : [];
  const locations = items.map((location) => {
    const item = location as Omit<PartnerRestaurant, "membership" | "distance_km"> & { membership?: unknown };
    const accountMembership = accountMemberships.get(item.restaurant_id);
    return {
      ...item,
      membership: accountMembership ? {
        registered: true,
        points_balance: accountMembership.points_balance,
        visits_count: accountMembership.visits_count,
        last_visit_at: accountMembership.last_visit_at,
        available_rewards: accountMembership.available_rewards,
        next_reward: accountMembership.next_reward && typeof accountMembership.next_reward.missing_points === "number"
          ? accountMembership.next_reward as PartnerMembership["next_reward"]
          : null,
      } : safeMembership(item.membership),
      offers: publicOffers.filter((offer) => offer.branch_id === item.branch_id).slice(0, 3),
      distance_km: null,
      opening_status: null,
    };
  });
  return {
    locations,
    hasCustomerAccess: locations.some((location) => location.membership?.registered === true),
    total: Number(payload.total) || items.length,
  };
}
