import { liveDataUnavailableMessage, supabase } from "../../shared/lib/supabase";
import type { Campaign, Customer, LoyaltyMode, LoyaltyRule, LoyaltySettings, Restaurant, RestaurantBranding } from "../../shared/types/domain";

export const loyaltyModeLabels: Record<LoyaltyMode, string> = {
  amount_based: "Betragsbasiert",
  stamp_based: "Stempelkarte",
  menu_points: "Punkte nach Bonstufe",
};

export const menuPointPresets = [
  { title: "Besuch", points: 10, stamps: 0, min_amount: 0 },
  { title: "Menü", points: 20, stamps: 0, min_amount: 0 },
  { title: "Familienmenü", points: 50, stamps: 0, min_amount: 0 },
];

const loyaltySettingsSelect =
  "id, restaurant_id, loyalty_mode, amount_per_point, redemption_return_rate, stamps_required, bonus_amount_tiers, bonus_boost_multiplier, smart_upsell_enabled, smart_upsell_threshold, referral_boost_enabled, referral_boost_multiplier, referral_boost_duration_days, active, created_at";

const legacyLoyaltySettingsSelect =
  "id, restaurant_id, loyalty_mode, amount_per_point, stamps_required, bonus_amount_tiers, bonus_boost_multiplier, smart_upsell_enabled, smart_upsell_threshold, referral_boost_enabled, referral_boost_multiplier, referral_boost_duration_days, active, created_at";

function normalizeLoyaltySettings(settings: LoyaltySettings): LoyaltySettings {
  return {
    ...settings,
    redemption_return_rate: Number(settings.redemption_return_rate) || 0.05,
  };
}

function isMissingRedemptionReturnRate(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const maybeError = error as { code?: string; message?: string };
  return maybeError.code === "42703" || /redemption_return_rate/i.test(maybeError.message ?? "");
}

export type LoyaltyRuleInput = {
  id?: string;
  restaurant_id: string;
  title: string;
  points: number;
  stamps: number;
  min_amount: number;
  active: boolean;
};

export type StaffLoyaltyActionInput = {
  restaurantId: string;
  customerId: string;
  dailyPin: string;
  mode: LoyaltyMode;
  points: number;
  stamps: number;
  reason: string;
  ruleId?: string | null;
  billAmount?: number | null;
  idempotencyKey: string;
};

export type StaffLoyaltyActionResult = {
  points_added: number;
  stamps_added: number;
  points_balance: number;
  stamp_balance: number;
};

export function defaultSettingsForMode(restaurantId: string, mode: LoyaltyMode): LoyaltySettings {
  return {
    id: "",
    restaurant_id: restaurantId,
    loyalty_mode: mode,
    amount_per_point: 1,
    redemption_return_rate: 0.05,
    stamps_required: 10,
    bonus_amount_tiers: defaultBonusAmountTiers,
    bonus_boost_multiplier: 1,
    smart_upsell_enabled: true,
    smart_upsell_threshold: 5,
    referral_boost_enabled: true,
    referral_boost_multiplier: 2,
    referral_boost_duration_days: 30,
    active: true,
    created_at: new Date().toISOString(),
  };
}

export function rulesForMode(rules: LoyaltyRule[], mode: LoyaltyMode) {
  return rules.filter((rule) => {
    if (mode === "amount_based") return rule.min_amount > 0 || rule.points > 0;
    if (mode === "stamp_based") return rule.stamps > 0;
    return rule.points > 0 && rule.stamps === 0;
  });
}

export async function loadLoyaltySettings(restaurantId: string): Promise<LoyaltySettings> {
  if (!supabase) {
    throw new Error(liveDataUnavailableMessage);
  }

  let query = await supabase
    .from("loyalty_settings")
    .select(loyaltySettingsSelect)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();

  if (query.error && isMissingRedemptionReturnRate(query.error)) {
    query = await supabase
      .from("loyalty_settings")
      .select(legacyLoyaltySettingsSelect)
      .eq("restaurant_id", restaurantId)
      .maybeSingle();
  }

  const { data, error } = query;
  if (error) throw error;

  if (data) {
    return normalizeLoyaltySettings(data as LoyaltySettings);
  }

  return saveLoyaltySettings(defaultSettingsForMode(restaurantId, "menu_points"));
}

export async function saveLoyaltySettings(settings: LoyaltySettings): Promise<LoyaltySettings> {
  if (!supabase) {
    throw new Error(liveDataUnavailableMessage);
  }

  const { data, error } = await supabase
    .from("loyalty_settings")
    .upsert(
      {
        restaurant_id: settings.restaurant_id,
        loyalty_mode: settings.loyalty_mode,
        amount_per_point: settings.amount_per_point,
        redemption_return_rate: settings.redemption_return_rate ?? 0.05,
        stamps_required: settings.stamps_required,
        bonus_boost_multiplier: settings.bonus_boost_multiplier ?? 1,
        smart_upsell_enabled: settings.smart_upsell_enabled ?? true,
        smart_upsell_threshold: settings.smart_upsell_threshold ?? 5,
        referral_boost_enabled: settings.referral_boost_enabled ?? true,
        referral_boost_multiplier: settings.referral_boost_multiplier ?? 2,
        referral_boost_duration_days: settings.referral_boost_duration_days ?? 30,
        active: settings.active,
      },
      { onConflict: "restaurant_id" },
    )
    .select(loyaltySettingsSelect)
    .single();

  if (error && isMissingRedemptionReturnRate(error)) {
    const { data: legacyData, error: legacyError } = await supabase
      .from("loyalty_settings")
      .upsert(
        {
          restaurant_id: settings.restaurant_id,
          loyalty_mode: settings.loyalty_mode,
          amount_per_point: settings.amount_per_point,
          stamps_required: settings.stamps_required,
          bonus_boost_multiplier: settings.bonus_boost_multiplier ?? 1,
          smart_upsell_enabled: settings.smart_upsell_enabled ?? true,
          smart_upsell_threshold: settings.smart_upsell_threshold ?? 5,
          referral_boost_enabled: settings.referral_boost_enabled ?? true,
          referral_boost_multiplier: settings.referral_boost_multiplier ?? 2,
          referral_boost_duration_days: settings.referral_boost_duration_days ?? 30,
          active: settings.active,
        },
        { onConflict: "restaurant_id" },
      )
      .select(legacyLoyaltySettingsSelect)
      .single();

    if (legacyError) throw legacyError;
    return normalizeLoyaltySettings(legacyData as LoyaltySettings);
  }

  if (error) throw error;
  return normalizeLoyaltySettings(data as LoyaltySettings);
}

export async function loadLoyaltyRules(restaurantId: string): Promise<LoyaltyRule[]> {
  if (!supabase) {
    throw new Error(liveDataUnavailableMessage);
  }

  const { data, error } = await supabase
    .from("loyalty_rules")
    .select("id, restaurant_id, title, points, stamps, min_amount, active, created_at")
    .eq("restaurant_id", restaurantId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data ?? []) as LoyaltyRule[];
}

export async function saveLoyaltyRule(input: LoyaltyRuleInput): Promise<LoyaltyRule> {
  const payload = {
    restaurant_id: input.restaurant_id,
    title: input.title,
    points: input.points,
    stamps: input.stamps,
    min_amount: input.min_amount,
    active: input.active,
  };

  if (!supabase) {
    throw new Error(liveDataUnavailableMessage);
  }

  if (input.id) {
    const { data, error } = await supabase
      .from("loyalty_rules")
      .update(payload)
      .eq("id", input.id)
      .eq("restaurant_id", input.restaurant_id)
      .select("id, restaurant_id, title, points, stamps, min_amount, active, created_at")
      .single();

    if (error) throw error;
    return data as LoyaltyRule;
  }

  const { data, error } = await supabase
    .from("loyalty_rules")
    .insert(payload)
    .select("id, restaurant_id, title, points, stamps, min_amount, active, created_at")
    .single();

  if (error) throw error;
  return data as LoyaltyRule;
}

export async function setLoyaltyRuleActive(rule: LoyaltyRule, active: boolean): Promise<LoyaltyRule> {
  return saveLoyaltyRule({ ...rule, active });
}

export async function loadCustomers(restaurantId: string): Promise<Customer[]> {
  if (!supabase) {
    throw new Error(liveDataUnavailableMessage);
  }

  const { data, error } = await supabase
    .from("customers")
    .select("id, restaurant_id, name, phone, email, birthday, customer_code, points_balance, stamp_balance, membership_level, created_at")
    .eq("restaurant_id", restaurantId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data ?? []) as Customer[];
}

export type CustomerPortalData = {
  restaurant: Pick<Restaurant, "name" | "slug" | "status">;
  branding: Pick<RestaurantBranding, "logo_url" | "primary_color" | "secondary_color" | "button_color" | "font_family">;
  settings: PublicLoyaltySettings;
  customer: PublicPortalCustomer | null;
  campaigns: Pick<Campaign, "title" | "slug" | "description" | "status" | "start_date" | "end_date">[];
  offers: PublicCustomerOfferView[];
};

export type BonusAmountTier = {
  key: string;
  label: string;
  min: number;
  max: number | null;
  amount: number;
};

export type PublicLoyaltySettings = Pick<LoyaltySettings, "loyalty_mode" | "amount_per_point" | "redemption_return_rate" | "stamps_required" | "active"> & {
  bonus_amount_tiers?: BonusAmountTier[];
  bonus_boost_multiplier?: number;
  smart_upsell_enabled?: boolean;
  smart_upsell_threshold?: number;
  referral_boost_enabled?: boolean;
  referral_boost_multiplier?: number;
  referral_boost_duration_days?: number;
};

export type PublicPortalCustomer = Pick<
  Customer,
  "name" | "customer_code" | "points_balance" | "stamp_balance" | "membership_level"
> & {
  bonus_boost?: {
    multiplier: number;
    active_from?: string;
    active_until: string;
    remaining_days: number;
  } | null;
};

export type PublicCustomerOfferView = {
  id: string;
  source: "reward" | "coupon";
  title: string;
  description: string;
  reward_type: "reward" | "coupon";
  required_points: number;
  required_stamps: number;
  category: string | null;
  product_group: string | null;
  image_url?: string | null;
  product_price?: number | null;
  welcome_gift_mode?: "value_limit" | "fixed_product";
  fixed_product_name?: string | null;
  is_starter_reward?: boolean;
  assignment_id?: string | null;
  gift_type?: "welcome" | "birthday" | "legacy" | null;
  valid_from?: string | null;
  valid_until?: string | null;
  birthday_year?: number | null;
  active: boolean;
  expires_at: string | null;
  status: "locked" | "unlocked" | "redemption_started" | "redeemed";
  remaining_points: number;
  remaining_stamps: number;
};

export type StaffQrCustomer = Pick<
  Customer,
  "id" | "restaurant_id" | "name" | "phone" | "email" | "birthday" | "customer_code" | "points_balance" | "stamp_balance" | "membership_level" | "created_at"
>;

export type GuestRegistrationInput = {
  restaurantSlug: string;
  firstName: string;
  phone: string;
  birthday: string | null;
  deviceId?: string | null;
};

export type GuestRegistrationResult = {
  restaurant: Pick<Restaurant, "name" | "slug" | "status">;
  campaign: Pick<Campaign, "title" | "slug" | "description" | "status"> | null;
  customer: Pick<Customer, "name" | "customer_code"> & {
    customer_qr_token: string;
  };
  starter_offer_source: "reward" | "coupon" | null;
  starter_offer_id: string | null;
  starter_issued: boolean;
  welcome_reward?: {
    id: string;
    title: string;
    category: string | null;
    available_products: string[] | null;
    image_url: string | null;
    product_price?: number | null;
    welcome_gift_mode?: "value_limit" | "fixed_product";
    fixed_product_name?: string | null;
  } | null;
};

export type BonusPointCollectionInput = {
  restaurantSlug: string;
  customerToken: string;
  amountTierKey: string;
  dailyPin: string;
  deviceId?: string | null;
  idempotencyKey: string;
};

export type BonusPointCollectionResult = {
  points_added: number;
  base_points?: number;
  points_balance: number;
  amount_tier_key: string;
  amount_tier_label: string;
  bonus_multiplier: number;
  boost_id?: string | null;
  welcome_gift_unlocked?: boolean;
  next_reward: {
    title: string;
    required_points: number;
    remaining_points: number;
  } | null;
};

function collectBonusPointsErrorMessage(error: { message?: string; details?: string; hint?: string; code?: string }) {
  const technicalText = [error.message, error.details, error.hint, error.code].filter(Boolean).join(" ").toLowerCase();

  if (technicalText.includes("tages-pin") && technicalText.includes("nicht korrekt")) {
    return "Die Tages-PIN ist nicht korrekt.";
  }

  if (technicalText.includes("tages-pin") && technicalText.includes("nicht mehr gültig")) {
    return "Die Tages-PIN ist nicht mehr gültig. Bitte gib die heutige Tages-PIN ein.";
  }

  if (technicalText.includes("zu viele falsche versuche")) {
    return "Zu viele falsche Versuche. Bitte wende dich an das Restaurant.";
  }

  if (technicalText.includes("heute bereits punkte gesammelt")) {
    return "Du hast heute bereits zweimal Punkte gesammelt. Morgen kannst du wieder Punkte sammeln.";
  }

  if (technicalText.includes("points already collected recently")) {
    return "Für diese Rechnung wurden gerade schon Punkte gesammelt. Bitte warte kurz.";
  }

  if (technicalText.includes("customer token not valid")) {
    return "Dein Bonus konnte nicht eindeutig erkannt werden. Bitte öffne deinen persönlichen Bonus erneut.";
  }

  if (technicalText.includes("amount tier not valid")) {
    return "Diese Rechnungsstufe ist nicht mehr verfügbar. Bitte lade die Seite neu.";
  }

  return "Punkte konnten gerade nicht gutgeschrieben werden. Bitte versuche es erneut.";
}

function staffDailyPinActionErrorMessage(error: { message?: string; details?: string; hint?: string; code?: string }) {
  const technicalText = [error.message, error.details, error.hint, error.code].filter(Boolean).join(" ").toLowerCase();

  if (technicalText.includes("bitte gib die tages-pin ein")) {
    return "Bitte gib die Tages-PIN ein.";
  }

  if (technicalText.includes("tages-pin") && technicalText.includes("nicht korrekt")) {
    return "Die Tages-PIN ist nicht korrekt. Bitte prüfe die heutige Tages-PIN in der Mitarbeiteransicht.";
  }

  if (technicalText.includes("tages-pin") && technicalText.includes("nicht mehr gültig")) {
    return "Die Tages-PIN ist nicht mehr gültig. Bitte prüfe die heutige Tages-PIN in der Mitarbeiteransicht.";
  }

  if (technicalText.includes("zu viele falsche versuche")) {
    return "Zu viele falsche Versuche. Bitte wende dich an das Restaurant.";
  }

  if (technicalText.includes("heute bereits punkte gesammelt")) {
    return "Du hast heute bereits Punkte gesammelt. Wenn das nicht stimmt, wende dich bitte an das Restaurant.";
  }

  if (technicalText.includes("gerade schon erfasst")) {
    return "Diese Buchung wurde gerade schon erfasst. Bitte warte kurz.";
  }

  return "Punkte konnten gerade nicht gebucht werden. Bitte versuche es erneut.";
}

function publicPortalErrorMessage(error: { message?: string; details?: string; hint?: string; code?: string }) {
  const technicalText = [error.message, error.details, error.hint, error.code].filter(Boolean).join(" ").toLowerCase();

  if (technicalText.includes("not found") || technicalText.includes("restaurant") || technicalText.includes("pgrst116")) {
    return "Restaurant wurde nicht gefunden.";
  }

  return "Live-Daten konnten nicht geladen werden. Bitte prüfe die Supabase-Verbindung.";
}

export type ReferralLinkResult = {
  referral_token: string;
  referral_id: string;
};

export type PublicReferralData = {
  restaurant: Pick<Restaurant, "name" | "slug" | "status">;
  branding: Pick<RestaurantBranding, "logo_url" | "primary_color" | "secondary_color" | "button_color" | "font_family">;
  referrer: {
    first_name: string;
  };
  settings: Pick<PublicLoyaltySettings, "referral_boost_enabled" | "referral_boost_multiplier" | "referral_boost_duration_days">;
};

export type ReferralRegistrationInput = {
  restaurantSlug: string;
  referralToken: string;
  firstName: string;
  phone: string;
  birthday: string | null;
  deviceId?: string | null;
};

export type ReferralRegistrationResult = {
  restaurant: Pick<Restaurant, "name" | "slug" | "status">;
  customer: Pick<Customer, "name" | "customer_code"> & {
    customer_qr_token: string;
  };
  referral_status: "pending_registered";
};

export type BonusBoostKpis = {
  guestsCurrentlyBoosted: number;
  guestsReturnedBecauseOfBoost: number;
};

export type TodayRestaurantPin = {
  pin_code: string;
  valid_until: string;
};

export type ReferralAbuseWarnings = {
  devicesWithMultipleAccounts: number;
  devicesWithMultipleReferrals: number;
  manyReferralsShortTime: number;
};

export const defaultBonusAmountTiers: BonusAmountTier[] = [
  { key: "0_10", label: "0–10 €", min: 0, max: 10, amount: 0 },
  { key: "10_20", label: "10–20 €", min: 10, max: 20, amount: 10 },
  { key: "20_30", label: "20–30 €", min: 20, max: 30, amount: 20 },
  { key: "30_40", label: "30–40 €", min: 30, max: 40, amount: 30 },
  { key: "40_50", label: "40–50 €", min: 40, max: 50, amount: 40 },
  { key: "50_75", label: "50–75 €", min: 50, max: 75, amount: 50 },
  { key: "75_100", label: "75–100 €", min: 75, max: 100, amount: 75 },
  { key: "100_plus", label: "100+ €", min: 100, max: null, amount: 100 },
];

export function bonusTierPointBase(tier: BonusAmountTier) {
  return Math.max(0, Number(tier.min) || 0);
}

export function calculateBonusTierPoints(tier: BonusAmountTier, amountPerPoint: number, multiplier = 1) {
  const safeAmountPerPoint = Math.max(0.01, Number(amountPerPoint) || 1);
  const safeMultiplier = Math.max(0, Number(multiplier) || 1);
  const basePoints = Math.round(bonusTierPointBase(tier) / safeAmountPerPoint);
  return Math.max(0, Math.round(basePoints * safeMultiplier));
}

export async function loadCustomerPortalData(
  restaurantSlug?: string,
  customerToken?: string | null,
): Promise<CustomerPortalData> {
  if (!restaurantSlug) {
    throw new Error("Restaurant fehlt.");
  }

  if (!supabase) {
    throw new Error(liveDataUnavailableMessage);
  }

  const { data, error } = await supabase.rpc("get_public_customer_portal", {
    input_restaurant_slug: restaurantSlug,
    input_customer_token: customerToken ?? null,
  });

  if (error) throw new Error(publicPortalErrorMessage(error));

  const portalData = data as CustomerPortalData;
  if (!customerToken || !portalData.customer) return portalData;

  const { data: giftMetadata, error: giftMetadataError } = await supabase.rpc("get_customer_gift_metadata", {
    input_customer_token: customerToken,
  });
  if (giftMetadataError) throw new Error(publicPortalErrorMessage(giftMetadataError));

  const availableMetadata = (giftMetadata ?? []) as Array<{
    reward_id: string;
    assignment_id: string;
    gift_type: "welcome" | "birthday";
    status: "locked" | "active" | "redemption_started";
    valid_from: string | null;
    valid_until: string | null;
    birthday_year: number | null;
  }>;

  const starterOffers = portalData.offers.filter((offer) => offer.is_starter_reward);
  const expandedStarterOffers = starterOffers.flatMap((offer) => {
    const assignments = availableMetadata.filter((item) => item.reward_id === offer.id);
    if (assignments.length === 0) return [offer];

    return assignments.map((metadata) => ({
      ...offer,
      assignment_id: metadata.assignment_id,
      gift_type: metadata.gift_type,
      valid_from: metadata.valid_from,
      valid_until: metadata.valid_until,
      birthday_year: metadata.birthday_year,
      status: metadata.status === "locked"
        ? "locked" as const
        : metadata.status === "redemption_started"
          ? "redemption_started" as const
          : "unlocked" as const,
    }));
  });

  return {
    ...portalData,
    offers: [
      ...portalData.offers.filter((offer) => !offer.is_starter_reward),
      ...expandedStarterOffers,
    ],
  };
}

export async function registerRestaurantGuest(input: GuestRegistrationInput): Promise<GuestRegistrationResult> {
  if (!supabase) {
    throw new Error(liveDataUnavailableMessage);
  }

  const { data, error } = await supabase.rpc("register_restaurant_customer", {
    input_restaurant_slug: input.restaurantSlug,
    input_first_name: input.firstName,
    input_phone: input.phone,
    input_birthday: input.birthday,
    input_device_id: input.deviceId ?? null,
  });

  if (error) throw error;
  return data as GuestRegistrationResult;
}

export async function resolveCustomerQrToken(restaurantId: string, customerToken: string): Promise<StaffQrCustomer> {
  if (!supabase) {
    throw new Error(liveDataUnavailableMessage);
  }

  const { data, error } = await supabase.rpc("resolve_customer_qr_token", {
    input_restaurant_id: restaurantId,
    input_customer_token: customerToken,
  });

  if (error) throw error;
  return data as StaffQrCustomer;
}

export async function collectBonusPoints(input: BonusPointCollectionInput): Promise<BonusPointCollectionResult> {
  if (!supabase) {
    throw new Error(liveDataUnavailableMessage);
  }

  const { data, error } = await supabase.rpc("collect_bonus_points_v1", {
    input_restaurant_slug: input.restaurantSlug,
    input_customer_token: input.customerToken,
    input_amount_tier_key: input.amountTierKey,
    input_daily_pin: input.dailyPin,
    input_device_id: input.deviceId ?? null,
    input_idempotency_key: input.idempotencyKey,
  });

  if (error) {
    console.warn("collect_bonus_points RPC fehlgeschlagen.", {
      code: error.code,
      details: error.details,
      hint: error.hint,
      message: error.message,
    });
    throw new Error(collectBonusPointsErrorMessage(error));
  }
  return data as BonusPointCollectionResult;
}

export async function loadTodayRestaurantPin(restaurantId: string): Promise<TodayRestaurantPin> {
  if (!supabase) {
    throw new Error(liveDataUnavailableMessage);
  }

  const { data, error } = await supabase.rpc("get_today_restaurant_pin", {
    input_restaurant_id: restaurantId,
  });

  if (error) throw error;
  return data as TodayRestaurantPin;
}

export async function createReferralLink(
  restaurantSlug: string,
  customerToken: string,
  deviceId?: string | null,
): Promise<ReferralLinkResult> {
  if (!supabase) {
    throw new Error(liveDataUnavailableMessage);
  }

  const { data, error } = await supabase.rpc("create_referral_link", {
    input_restaurant_slug: restaurantSlug,
    input_customer_token: customerToken,
    input_device_id: deviceId ?? null,
  });

  if (error) throw error;
  return data as ReferralLinkResult;
}

export async function loadPublicReferral(restaurantSlug: string, referralToken: string): Promise<PublicReferralData> {
  if (!supabase) {
    throw new Error(liveDataUnavailableMessage);
  }

  const { data, error } = await supabase.rpc("get_public_referral", {
    input_restaurant_slug: restaurantSlug,
    input_referral_token: referralToken,
  });

  if (error) throw error;
  return data as PublicReferralData;
}

export async function registerReferralGuest(input: ReferralRegistrationInput): Promise<ReferralRegistrationResult> {
  if (!supabase) {
    throw new Error(liveDataUnavailableMessage);
  }

  const { data, error } = await supabase.rpc("register_referral_customer", {
    input_restaurant_slug: input.restaurantSlug,
    input_referral_token: input.referralToken,
    input_first_name: input.firstName,
    input_phone: input.phone,
    input_birthday: input.birthday,
    input_device_id: input.deviceId ?? null,
  });

  if (error) throw error;
  return data as ReferralRegistrationResult;
}

export async function loadBonusBoostKpis(restaurantId: string): Promise<BonusBoostKpis> {
  if (!supabase) {
    throw new Error(liveDataUnavailableMessage);
  }

  const { data, error } = await supabase.rpc("get_bonus_boost_kpis", {
    input_restaurant_id: restaurantId,
  });

  if (error) throw error;

  const payload = data as {
    guests_currently_boosted?: number;
    guests_returned_because_of_boost?: number;
  };

  return {
    guestsCurrentlyBoosted: payload.guests_currently_boosted ?? 0,
    guestsReturnedBecauseOfBoost: payload.guests_returned_because_of_boost ?? 0,
  };
}

export async function loadReferralAbuseWarnings(restaurantId: string): Promise<ReferralAbuseWarnings> {
  if (!supabase) {
    throw new Error(liveDataUnavailableMessage);
  }

  const { data, error } = await supabase.rpc("get_referral_abuse_warnings", {
    input_restaurant_id: restaurantId,
  });

  if (error) throw error;

  const payload = data as {
    devices_with_multiple_accounts?: number;
    devices_with_multiple_referrals?: number;
    many_referrals_short_time?: number;
  };

  return {
    devicesWithMultipleAccounts: payload.devices_with_multiple_accounts ?? 0,
    devicesWithMultipleReferrals: payload.devices_with_multiple_referrals ?? 0,
    manyReferralsShortTime: payload.many_referrals_short_time ?? 0,
  };
}

export async function applyStaffLoyaltyAction(input: StaffLoyaltyActionInput): Promise<StaffLoyaltyActionResult> {
  if (!supabase) {
    throw new Error(liveDataUnavailableMessage);
  }

  const { data, error } = await supabase.rpc("apply_staff_daily_pin_loyalty_action_v1", {
    input_restaurant_id: input.restaurantId,
    input_customer_id: input.customerId,
    input_daily_pin: input.dailyPin,
    input_loyalty_mode: input.mode,
    input_points: input.points,
    input_stamps: input.stamps,
    input_reason: input.reason,
    input_rule_id: input.ruleId ?? null,
    input_bill_amount: input.billAmount ?? null,
    input_idempotency_key: input.idempotencyKey,
  });

  if (error) {
    console.warn("apply_staff_daily_pin_loyalty_action RPC fehlgeschlagen.", {
      code: error.code,
      details: error.details,
      hint: error.hint,
      message: error.message,
    });
    throw new Error(staffDailyPinActionErrorMessage(error));
  }
  return data as StaffLoyaltyActionResult;
}
