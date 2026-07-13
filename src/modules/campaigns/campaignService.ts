import {
  demoBranding,
  demoCampaignKpis,
  demoCampaigns,
  demoCoupons,
  demoCustomers,
  demoRestaurant,
  demoRewards,
} from "../../shared/lib/demoData";
import { isLocalDemoMode, liveDataUnavailableMessage, supabase } from "../../shared/lib/supabase";
import type { Campaign, Coupon, Customer, Restaurant, RestaurantBranding, Reward } from "../../shared/types/domain";
import type { RewardOffer, RewardOfferSource } from "../rewards/rewardService";

export type CampaignInput = {
  id?: string;
  restaurant_id: string;
  title: string;
  slug: string;
  description: string;
  status: Campaign["status"];
  start_date: string | null;
  end_date: string | null;
  starter_offer_source: RewardOfferSource | null;
  starter_reward_id: string | null;
  starter_coupon_id: string | null;
};

export type PublicRestaurant = Pick<Restaurant, "name" | "slug" | "status">;

export type PublicBranding = Pick<
  RestaurantBranding,
  "logo_url" | "primary_color" | "secondary_color" | "button_color" | "font_family"
>;

export type PublicCampaign = Pick<
  Campaign,
  "title" | "slug" | "description" | "status" | "start_date" | "end_date"
>;

export type PublicOffer = Pick<
  Reward,
  "title" | "description" | "reward_type" | "required_points" | "required_stamps" | "expires_at"
>;

export type PublicCustomer = Pick<Customer, "name" | "customer_code"> & {
  customer_qr_token: string;
};

export type PublicCampaignData = {
  restaurant: PublicRestaurant;
  branding: PublicBranding;
  campaign: PublicCampaign;
  reward: PublicOffer | null;
  coupon: PublicOffer | null;
};

export type CampaignRegistrationInput = {
  restaurantSlug: string;
  campaignSlug: string;
  name: string;
  phone: string;
  birthday: string | null;
  deviceId?: string | null;
};

export type CampaignRegistrationResult = {
  restaurant: PublicRestaurant;
  campaign: Pick<PublicCampaign, "title" | "slug" | "description" | "status">;
  customer: PublicCustomer;
  starter_offer_source: RewardOfferSource | null;
  starter_offer_id: string | null;
  starter_issued: boolean;
  welcome_reward?: {
    id: string;
    title: string;
    category: string | null;
    available_products: string[] | null;
    image_url: string | null;
  } | null;
};

export type CampaignKpis = {
  scans: number;
  registrations: number;
  starterRewardsIssued: number;
  conversionRate: number;
};

const campaignSelect =
  "id, restaurant_id, title, slug, description, status, start_date, end_date, starter_offer_source, starter_reward_id, starter_coupon_id, created_at";

export function slugifyCampaign(value: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  return slug || "campaign";
}

export function campaignUrl(restaurantSlug: string, campaignSlug: string) {
  return `${window.location.origin}/c/${restaurantSlug}/${campaignSlug}`;
}

export function offerLabel(offer: Pick<RewardOffer, "source" | "title">) {
  return `${offer.source === "coupon" ? "Gutschein" : "Prämie"}: ${offer.title}`;
}

export async function loadCampaigns(restaurantId: string): Promise<Campaign[]> {
  if (isLocalDemoMode) {
    return demoCampaigns.map((campaign) => ({ ...campaign, restaurant_id: restaurantId }));
  }
  if (!supabase) {
    throw new Error(liveDataUnavailableMessage);
  }

  const { data, error } = await supabase
    .from("campaigns")
    .select(campaignSelect)
    .eq("restaurant_id", restaurantId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as Campaign[];
}

export async function saveCampaign(input: CampaignInput): Promise<Campaign> {
  const payload = {
    restaurant_id: input.restaurant_id,
    title: input.title,
    slug: slugifyCampaign(input.slug || input.title),
    description: input.description,
    status: input.status,
    start_date: input.start_date,
    end_date: input.end_date,
    starter_offer_source: input.starter_offer_source,
    starter_reward_id: input.starter_offer_source === "reward" ? input.starter_reward_id : null,
    starter_coupon_id: input.starter_offer_source === "coupon" ? input.starter_coupon_id : null,
  };

  if (isLocalDemoMode) {
    return {
      id: input.id ?? `campaign-${globalThis.crypto?.randomUUID?.() ?? Date.now()}`,
      ...payload,
      created_at: new Date().toISOString(),
    };
  }
  if (!supabase) {
    throw new Error(liveDataUnavailableMessage);
  }

  const query = input.id
    ? supabase.from("campaigns").update(payload).eq("id", input.id).eq("restaurant_id", input.restaurant_id)
    : supabase.from("campaigns").insert(payload);
  const { data, error } = await query.select(campaignSelect).single();

  if (error) throw error;
  return data as Campaign;
}

export async function setCampaignStatus(campaign: Campaign, status: Campaign["status"]): Promise<Campaign> {
  return saveCampaign({ ...campaign, status });
}

export async function loadPublicCampaign(restaurantSlug: string, campaignSlug: string): Promise<PublicCampaignData> {
  if (isLocalDemoMode) {
    const campaign = demoCampaigns.find((item) => item.slug === campaignSlug) ?? demoCampaigns[0];
    return {
      restaurant: demoRestaurant,
      branding: demoBranding,
      campaign,
      reward: campaign.starter_reward_id
        ? demoRewards.find((reward) => reward.id === campaign.starter_reward_id) ?? null
        : null,
      coupon: campaign.starter_coupon_id
        ? demoCoupons.find((coupon) => coupon.id === campaign.starter_coupon_id) ?? null
        : null,
    };
  }
  if (!supabase) {
    throw new Error(liveDataUnavailableMessage);
  }

  const { data, error } = await supabase.rpc("get_public_campaign", {
    input_restaurant_slug: restaurantSlug,
    input_campaign_slug: campaignSlug,
  });

  if (error) throw error;
  return data as PublicCampaignData;
}

export async function registerCampaignCustomer(input: CampaignRegistrationInput): Promise<CampaignRegistrationResult> {
  if (isLocalDemoMode) {
    return {
      restaurant: demoRestaurant,
      campaign: demoCampaigns[0],
      customer: {
        name: input.name,
        customer_code: `KAI-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
        customer_qr_token: `demo-token-${Math.random().toString(36).slice(2)}`,
      },
      starter_offer_source: demoCampaigns[0].starter_offer_source,
      starter_offer_id: demoCampaigns[0].starter_coupon_id ?? demoCampaigns[0].starter_reward_id,
      starter_issued: true,
    };
  }
  if (!supabase) {
    throw new Error(liveDataUnavailableMessage);
  }

  const { data, error } = await supabase.rpc("register_campaign_customer", {
    input_restaurant_slug: input.restaurantSlug,
    input_campaign_slug: input.campaignSlug,
    input_name: input.name,
    input_phone: input.phone,
    input_birthday: input.birthday,
    input_device_id: input.deviceId ?? null,
  });

  if (error) throw error;
  return data as CampaignRegistrationResult;
}

export async function loadCampaignKpis(restaurantId: string): Promise<CampaignKpis> {
  if (isLocalDemoMode) {
    return demoCampaignKpis;
  }
  if (!supabase) {
    throw new Error(liveDataUnavailableMessage);
  }

  const [scans, registrations, starterRewards] = await Promise.all([
    supabase.from("campaign_events").select("id", { count: "exact", head: true }).eq("restaurant_id", restaurantId).eq("event_type", "scan"),
    supabase.from("campaign_events").select("id", { count: "exact", head: true }).eq("restaurant_id", restaurantId).eq("event_type", "registration"),
    supabase.from("campaign_events").select("id", { count: "exact", head: true }).eq("restaurant_id", restaurantId).eq("event_type", "starter_reward"),
  ]);

  for (const result of [scans, registrations, starterRewards]) {
    if (result.error) throw result.error;
  }

  const scanCount = scans.count ?? 0;
  const registrationCount = registrations.count ?? 0;

  return {
    scans: scanCount,
    registrations: registrationCount,
    starterRewardsIssued: starterRewards.count ?? 0,
    conversionRate: scanCount > 0 ? Math.round((registrationCount / scanCount) * 100) : 0,
  };
}
