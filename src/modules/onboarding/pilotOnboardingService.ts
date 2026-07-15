import { liveDataUnavailableMessage, supabase } from "../../shared/lib/supabase";
import type { LoyaltyMode, RewardType } from "../../shared/types/domain";

export type PilotOnboardingInput = {
  restaurantId?: string | null;
  ownerId: string | null;
  restaurantName: string;
  restaurantType: string;
  language: string;
  slug: string;
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  buttonColor: string;
  openingHours: Record<string, unknown>;
  specialDays: string[];
  holidays: string[];
  smartOpenEnabled: boolean;
  onboardingStatus: "draft" | "ready";
  onboardingChecklist: Record<string, boolean>;
  loyaltyMode: LoyaltyMode;
  amountPerPoint: number;
  redemptionReturnRate: number;
  amountTierPoints: {
    visit: number;
    menu: number;
    family: number;
  };
  starterRewards: StarterRewardInput[];
  staffName: string;
  staffPin: string;
};

export type StarterRewardInput = {
  key: string;
  title: string;
  category: string;
  products: string[];
  imageUrl: string | null;
  active: boolean;
};

export type OnboardingDraftState<TDraft> = {
  onboardingStatus: "draft" | "ready" | "completed";
  currentStep: number;
  draftData: Partial<TDraft> | null;
  checklist: Record<string, boolean>;
};

export type SetupChecklist = {
  brandingCompleted: boolean;
  loyaltyModeSelected: boolean;
  firstRewardCreated: boolean;
  staffMemberCreated: boolean;
  qrReady: boolean;
};

const CURRENT_ONBOARDING_LAST_STEP = 6;
const CURRENT_ONBOARDING_STRUCTURE_VERSION = 3;
const ZERO_BASED_ONBOARDING_STRUCTURE_VERSION = 2;

export async function completePilotOnboarding(input: PilotOnboardingInput) {
  if (!supabase) {
    throw new Error(liveDataUnavailableMessage);
  }

  const restaurantPayload = {
      owner_id: input.ownerId,
      name: input.restaurantName,
      slug: input.slug,
      status: "active",
      restaurant_type: input.restaurantType,
      language: input.language,
      opening_hours: input.openingHours,
      special_days: input.specialDays,
      holidays: input.holidays,
      smart_open_enabled: input.smartOpenEnabled,
      onboarding_status: input.onboardingStatus,
      onboarding_checklist: input.onboardingChecklist,
      owner_phone: null,
  };

  const restaurantQuery = input.restaurantId
    ? supabase
        .from("restaurants")
        .update(restaurantPayload)
        .eq("id", input.restaurantId)
    : supabase
        .from("restaurants")
        .insert(restaurantPayload);

  const { data: restaurant, error: restaurantError } = await restaurantQuery
    .select("id, owner_id, name, slug, status, created_at")
    .single();

  if (restaurantError) throw restaurantError;

  const restaurantId = restaurant.id as string;

  const { error: brandingError } = await supabase.from("restaurant_branding").upsert(
    {
      restaurant_id: restaurantId,
      logo_url: input.logoUrl,
      primary_color: input.primaryColor,
      secondary_color: input.secondaryColor,
      button_color: input.buttonColor,
      font_family: "Inter",
    },
    { onConflict: "restaurant_id" },
  );

  if (brandingError) throw brandingError;

  const { error: loyaltyError } = await supabase.from("loyalty_settings").upsert(
    {
      restaurant_id: restaurantId,
      loyalty_mode: input.loyaltyMode,
      amount_per_point: input.amountPerPoint,
      redemption_return_rate: input.redemptionReturnRate,
      stamps_required: 10,
      active: true,
    },
    { onConflict: "restaurant_id" },
  );

  if (loyaltyError && (loyaltyError.code === "42703" || /redemption_return_rate/i.test(loyaltyError.message ?? ""))) {
    const { error: legacyLoyaltyError } = await supabase.from("loyalty_settings").upsert(
      {
        restaurant_id: restaurantId,
        loyalty_mode: input.loyaltyMode,
        amount_per_point: input.amountPerPoint,
        stamps_required: 10,
        active: true,
      },
      { onConflict: "restaurant_id" },
    );

    if (legacyLoyaltyError) throw legacyLoyaltyError;
  } else if (loyaltyError) {
    throw loyaltyError;
  }

  const { error: rulesError } = await supabase.from("loyalty_rules").insert([
    {
      restaurant_id: restaurantId,
      title: "Besuch",
      points: input.amountTierPoints.visit,
      stamps: 0,
      min_amount: 0,
      active: true,
    },
    {
      restaurant_id: restaurantId,
      title: "Menü",
      points: input.amountTierPoints.menu,
      stamps: 0,
      min_amount: 0,
      active: true,
    },
    {
      restaurant_id: restaurantId,
      title: "Familie",
      points: input.amountTierPoints.family,
      stamps: 0,
      min_amount: 0,
      active: true,
    },
  ]);

  if (rulesError) throw rulesError;

  const starterRewardRows = input.starterRewards
    .filter((reward) => reward.title.trim())
    .map((reward, index) => ({
      restaurant_id: restaurantId,
      title: reward.title.trim(),
      description: "Willkommensgeschenk für neue Gäste.",
      reward_type: "reward" as RewardType,
      required_points: 0,
      required_stamps: 0,
      active: reward.active,
      image_url: reward.imageUrl,
      category: reward.category.trim() || null,
      available_products: reward.products,
      is_starter_reward: true,
      starter_reward_key: reward.key,
      starter_reward_order: index + 1,
    }));

  if (starterRewardRows.length === 0) {
    throw new Error("Bitte mindestens ein Willkommensgeschenk anlegen.");
  }

  const { data: rewards, error: rewardError } = await supabase
    .from("rewards")
    .insert(starterRewardRows)
    .select("id, restaurant_id, title, description, reward_type, required_points, required_stamps, active, expires_at, created_at");

  if (rewardError) throw rewardError;

  const { error: staffError } = await supabase.rpc("create_staff_member_with_pin", {
    input_restaurant_id: restaurantId,
    input_name: input.staffName,
    input_pin: input.staffPin,
  });

  if (staffError) throw staffError;

  return { restaurant, offer: rewards?.[0] ?? null, campaign: null };
}

function normalizeOnboardingStep(rawStep: unknown, draftData?: unknown) {
  const step = Math.max(0, Number(rawStep ?? 1));
  const draftStructureVersion =
    typeof draftData === "object" && draftData !== null && "onboardingStructureVersion" in draftData
      ? Number((draftData as { onboardingStructureVersion?: unknown }).onboardingStructureVersion)
      : null;

  if (draftStructureVersion === ZERO_BASED_ONBOARDING_STRUCTURE_VERSION) {
    return Math.min(CURRENT_ONBOARDING_LAST_STEP, step);
  }

  return Math.max(0, Math.min(CURRENT_ONBOARDING_LAST_STEP, step - 1));
}

export async function loadOnboardingDraft<TDraft>(restaurantId: string): Promise<OnboardingDraftState<TDraft>> {
  if (!supabase) {
    throw new Error(liveDataUnavailableMessage);
  }

  const [{ data: restaurant, error: restaurantError }, { data: draft, error: draftError }] = await Promise.all([
    supabase
      .from("restaurants")
      .select("onboarding_status, onboarding_checklist")
      .eq("id", restaurantId)
      .single(),
    supabase
      .from("restaurant_onboarding_drafts")
      .select("current_step, draft_data, checklist")
      .eq("restaurant_id", restaurantId)
      .maybeSingle(),
  ]);

  if (restaurantError) throw restaurantError;
  if (draftError) throw draftError;

  return {
    onboardingStatus: (restaurant.onboarding_status as "draft" | "ready" | "completed") ?? "draft",
    currentStep: normalizeOnboardingStep(draft?.current_step, draft?.draft_data),
    draftData: (draft?.draft_data as Partial<TDraft> | null) ?? null,
    checklist: (draft?.checklist as Record<string, boolean> | null) ?? (restaurant.onboarding_checklist as Record<string, boolean>) ?? {},
  };
}

export async function saveOnboardingDraft<TDraft>(
  restaurantId: string,
  currentStep: number,
  draftData: TDraft,
  checklist: Record<string, boolean>,
) {
  if (!supabase) {
    throw new Error(liveDataUnavailableMessage);
  }

  const draftPayload =
    typeof draftData === "object" && draftData !== null && !Array.isArray(draftData)
      ? {
          ...draftData,
          onboardingStructureVersion: CURRENT_ONBOARDING_STRUCTURE_VERSION,
        }
      : draftData;

  const { error } = await supabase
    .from("restaurant_onboarding_drafts")
    .upsert(
      {
        restaurant_id: restaurantId,
        current_step: Math.max(1, Math.min(CURRENT_ONBOARDING_LAST_STEP + 1, currentStep + 1)),
        draft_data: draftPayload,
        checklist,
      },
      { onConflict: "restaurant_id" },
    );

  if (error) throw error;
}

export async function loadSetupChecklist(restaurantId: string): Promise<SetupChecklist> {
  if (!supabase) {
    throw new Error(liveDataUnavailableMessage);
  }

  const [branding, loyalty, rewards, staff] = await Promise.all([
    supabase.from("restaurant_branding").select("id, logo_url, primary_color, button_color").eq("restaurant_id", restaurantId).maybeSingle(),
    supabase.from("loyalty_settings").select("id, loyalty_mode").eq("restaurant_id", restaurantId).maybeSingle(),
    supabase.from("rewards").select("id", { count: "exact", head: true }).eq("restaurant_id", restaurantId).eq("is_starter_reward", true).eq("active", true),
    supabase.from("staff_members").select("id", { count: "exact", head: true }).eq("restaurant_id", restaurantId).eq("active", true),
  ]);

  for (const result of [branding, loyalty, rewards, staff]) {
    if (result.error) throw result.error;
  }

  return {
    brandingCompleted: Boolean(branding.data?.primary_color && branding.data?.button_color),
    loyaltyModeSelected: Boolean(loyalty.data?.loyalty_mode),
    firstRewardCreated: (rewards.count ?? 0) > 0,
    staffMemberCreated: (staff.count ?? 0) > 0,
    qrReady: true,
  };
}
