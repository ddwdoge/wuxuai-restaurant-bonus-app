import { liveDataUnavailableMessage, supabase } from "../../shared/lib/supabase";

export type SecureRedemptionState = {
  found?: boolean;
  success?: boolean;
  error_code?: string;
  redemption_id: string;
  presentation_id?: string;
  presentation_type?: "points" | "gift";
  status: "REQUESTED" | "PIN_VERIFIED" | "REDEEMED" | "REJECTED" | "CANCELLED" | "EXPIRED";
  active?: boolean;
  requested_at?: string;
  expires_at: string;
  server_now?: string;
  correlation_id: string;
  reward_id?: string;
  source_id?: string;
  reward_title?: string;
  reward_description?: string;
  reward_image_url?: string | null;
  image_zoom?: number;
  image_position_x?: number;
  image_position_y?: number;
  image_aspect_ratio?: string;
  image_crop_version?: number;
  confirmation_method?: string | null;
  points_balance?: number;
  stamp_balance?: number;
};

export type SecureRedemptionQueue = {
  server_now: string;
  actor_role: "STAFF" | "OWNER";
  requests: Array<SecureRedemptionState & { customer_label: string }>;
};

type Mutation =
  | { action: "start"; restaurant_slug: string; source_type: "points" | "gift"; entitlement_id: string }
  | { action: "verify_pin"; redemption_id: string; pin: string }
  | { action: "swipe" | "approve" | "reject" | "cancel"; redemption_id: string }
  | { action: "rotate_pin"; restaurant_slug: string };

async function mutate(input: Mutation, correlationId?: string, idempotencyKey?: string) {
  if (!supabase) throw new Error(liveDataUnavailableMessage);
  const body = {
    ...input,
    request_id: input.action === "start" && idempotencyKey ? idempotencyKey : crypto.randomUUID(),
    correlation_id: correlationId ?? (input.action === "start" && idempotencyKey ? idempotencyKey : crypto.randomUUID()),
    idempotency_key: idempotencyKey ?? crypto.randomUUID(),
  };
  const { data, error } = await supabase.functions.invoke("redemption-confirmation", { body });
  if (error) {
    const context = error.context as Response | undefined;
    try {
      const payload = await context?.clone().json() as { error_code?: string; code?: string } | undefined;
      throw new Error(payload?.error_code ?? payload?.code ?? "REDEMPTION_UNAVAILABLE");
    } catch (readError) {
      if (readError instanceof Error && readError.message !== "REDEMPTION_UNAVAILABLE") throw readError;
      throw readError;
    }
  }
  const payload = data as { success?: boolean; error_code?: string } | null;
  if (!payload?.success) throw new Error(payload?.error_code ?? "REDEMPTION_UNAVAILABLE");
  return data;
}

export const startSecureRedemption = (restaurantSlug: string, sourceType: "points" | "gift",
  entitlementId: string, idempotencyKey?: string) =>
  mutate({ action: "start", restaurant_slug: restaurantSlug, source_type: sourceType,
    entitlement_id: entitlementId }, undefined, idempotencyKey) as Promise<SecureRedemptionState>;

export const verifySecureRedemptionPin = (redemptionId: string, correlationId: string, pin: string) =>
  mutate({ action: "verify_pin", redemption_id: redemptionId, pin }, correlationId) as Promise<SecureRedemptionState>;

export const actOnSecureRedemption = (action: "swipe" | "approve" | "reject" | "cancel",
  redemptionId: string, correlationId: string, idempotencyKey?: string) =>
  mutate({ action, redemption_id: redemptionId }, correlationId, idempotencyKey) as Promise<SecureRedemptionState>;

export const rotateSecureRedemptionPin = (restaurantSlug: string) =>
  mutate({ action: "rotate_pin", restaurant_slug: restaurantSlug }) as Promise<{
    success: true; pin: string; valid_until: string;
  }>;

export async function loadSecureRedemptionStatus(restaurantSlug: string, redemptionId?: string | null) {
  if (!supabase) throw new Error(liveDataUnavailableMessage);
  const { data, error } = await supabase.rpc("get_secure_redemption_status", {
    input_restaurant_slug: restaurantSlug,
    input_redemption_id: redemptionId ?? null,
  });
  if (error) throw error;
  return data?.found ? data as SecureRedemptionState : null;
}

export async function loadSecureRedemptionQueue(restaurantSlug: string) {
  if (!supabase) throw new Error(liveDataUnavailableMessage);
  const { data, error } = await supabase.rpc("get_secure_redemption_queue", {
    input_restaurant_slug: restaurantSlug,
  });
  if (error) throw error;
  return data as SecureRedemptionQueue;
}
