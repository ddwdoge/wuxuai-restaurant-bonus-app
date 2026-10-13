import { supabase } from "../../shared/lib/supabase";
import type { RestaurantControlledPointsPreview, RestaurantControlledPointsResult } from "../loyalty/loyaltyService";

export type TestOnlyBasicCustomerOffer = {
  id: string;
  title: string;
  short_description: string;
  description: string | null;
  offer_type: string;
  image_url: string | null;
  current_price: number | null;
  previous_price: number | null;
  currency: string;
  valid_from: string;
  valid_to: string;
  button_label: string;
  publication_version: number;
  published_at: string;
  synthetic_test_only: true;
};

export type TestOnlyBasicCustomerFlow = {
  synthetic_test_only: true;
  active: boolean;
  restaurant_id: string;
  restaurant_name: string;
  restaurant_slug: string;
  organization_id: string;
  branch_id: string;
  branch_name: string;
  customer_id: string;
  customer_name: string;
  access_receipt_id: string | null;
  expires_at: string | null;
  offer_limit: number;
  offers: TestOnlyBasicCustomerOffer[];
  real_activation: false;
  real_trial: false;
  real_entitlement: false;
  catalog_access: false;
};

export type TestOnlyBasicCustomerQr = {
  reference_id: string;
  qr_token: string;
  manual_code: string;
  expires_at: string;
  access_receipt_id: string;
  synthetic_test_only: true;
};

export type TestOnlyBasicTodayPin = {
  pin_code: string;
  valid_until: string;
  access_receipt_id: string;
  synthetic_test_only: true;
};

function requireClient() {
  if (!supabase) throw new Error("Live-Daten konnten nicht geladen werden.");
  return supabase;
}

function assertSynthetic<T extends { synthetic_test_only?: unknown }>(value: T | null): T & { synthetic_test_only: true } {
  if (!value || value.synthetic_test_only !== true) throw new Error("Der TEST_ONLY-Vertrag wurde nicht bestätigt.");
  return value as T & { synthetic_test_only: true };
}

export async function readTestOnlyBasicCustomerFlow(restaurantSlug: string): Promise<TestOnlyBasicCustomerFlow> {
  const { data, error } = await requireClient().rpc("get_test_only_basic_customer_flow", {
    input_restaurant_slug: restaurantSlug,
  });
  if (error) throw error;
  const result = assertSynthetic(data as TestOnlyBasicCustomerFlow | null);
  if (!Array.isArray(result.offers)) throw new Error("Synthetische Angebote konnten nicht sicher gelesen werden.");
  return result;
}

export async function createTestOnlyBasicCustomerQr(restaurantId: string): Promise<TestOnlyBasicCustomerQr> {
  const { data, error } = await requireClient().rpc("create_test_only_basic_customer_points_qr", {
    input_restaurant_id: restaurantId,
    input_request_id: crypto.randomUUID(),
  });
  if (error) throw error;
  return assertSynthetic(data as TestOnlyBasicCustomerQr | null);
}

export async function readTestOnlyBasicTodayPin(restaurantId: string): Promise<TestOnlyBasicTodayPin> {
  const { data, error } = await requireClient().rpc("get_test_only_basic_today_restaurant_pin", {
    input_restaurant_id: restaurantId,
    input_request_id: crypto.randomUUID(),
  });
  if (error) throw error;
  return assertSynthetic(data as TestOnlyBasicTodayPin | null);
}

export async function previewTestOnlyBasicPoints(input: {
  restaurantId: string;
  qrReference: string;
  amountCents: number;
}): Promise<RestaurantControlledPointsPreview & { synthetic_test_only: true; access_receipt_id: string }> {
  const { data, error } = await requireClient().rpc("preview_test_only_basic_points", {
    input_restaurant_id: input.restaurantId,
    input_qr_reference: input.qrReference,
    input_amount_cents: input.amountCents,
    input_request_id: crypto.randomUUID(),
  });
  if (error) throw error;
  const result = assertSynthetic(data as (RestaurantControlledPointsPreview & { synthetic_test_only: true; access_receipt_id: string }) | null);
  if (result.success === false) throw new Error(result.error_message ?? "Die synthetische Punktevorschau wurde abgewiesen.");
  return result;
}

export async function confirmTestOnlyBasicPoints(input: {
  restaurantId: string;
  qrReference: string;
  amountCents: number;
  dailyPin: string;
  idempotencyKey: string;
}): Promise<RestaurantControlledPointsResult & { synthetic_test_only: true }> {
  const { data, error } = await requireClient().rpc("confirm_test_only_basic_points", {
    input_restaurant_id: input.restaurantId,
    input_qr_reference: input.qrReference,
    input_amount_cents: input.amountCents,
    input_daily_pin: input.dailyPin,
    input_idempotency_key: input.idempotencyKey,
  });
  if (error) throw error;
  const result = assertSynthetic(data as (RestaurantControlledPointsResult & { synthetic_test_only: true }) | null);
  if (result.success === false) throw new Error(result.error_message ?? "Die synthetische Punktebuchung wurde abgewiesen.");
  return result;
}
