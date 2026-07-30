import { supabase } from "../../shared/lib/supabase";
import { readStoredCustomerToken } from "./customerTokenStorage";

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
  short_description: string | null;
  opening_hours: unknown;
  welcome_reward_available: boolean;
  active_reward_count: number;
  membership: PartnerMembership | null;
  distance_km: number | null;
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

export async function loadPartnerRestaurants(): Promise<PartnerRestaurant[]> {
  if (!supabase) throw new Error("Partnerunternehmen konnten nicht geladen werden.");
  const client = supabase;

  const { data, error } = await client.rpc("get_public_partner_restaurants");
  if (error) throw error;

  const locations = Array.isArray(data) ? data as Omit<PartnerRestaurant, "membership" | "distance_km">[] : [];
  const enriched = await Promise.all(locations.map(async (location) => {
    const token = readStoredCustomerToken(location.slug);
    if (!token) return { ...location, membership: null, distance_km: null };

    const { data: membership, error: membershipError } = await client.rpc("get_customer_partner_membership", {
      input_restaurant_slug: location.slug,
      input_customer_token: token,
    });

    return {
      ...location,
      membership: membershipError ? null : safeMembership(membership),
      distance_km: null,
    };
  }));

  return enriched;
}
