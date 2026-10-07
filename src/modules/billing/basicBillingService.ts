import { supabase } from "../../shared/lib/supabase";

const TERMS_VERSION = "basic-paid-v1-2026-09-28";

export type BasicPaidContractMode = "INITIAL" | "REACTIVATION";

export type BasicOwnerContractSnapshot = {
  acceptance_id: string | null;
  acceptance_kind: BasicPaidContractMode | null;
  acceptance_terms_version: string | null;
  accepted_at: string | null;
  automatic_charge: false;
  automatic_extension: false;
  boundary_timezone: "Europe/Vienna";
  checkout_allowed: boolean;
  decision_available: boolean;
  decision_opens_at: string | null;
  payment_status: string | null;
  plan_key: string | null;
  post_trial_grace_active: boolean;
  post_trial_grace_ends_at: string | null;
  post_trial_grace_starts_at: string | null;
  remaining_calendar_days: number | null;
  restaurant_id: string;
  subscription_status: string | null;
  trial_active: boolean;
  trial_calendar_months: 1 | 3 | null;
  trial_ends_at: string | null;
  trial_starts_at: string | null;
};

export type BasicPaidOfferResult =
  | { status: "DECISION_SAVED"; acceptanceId: string }
  | { status: "CHECKOUT_READY"; url: string };

export async function acceptBasicOfferAndOpenTestCheckout(
  restaurantId: string,
  mode: BasicPaidContractMode,
): Promise<BasicPaidOfferResult> {
  if (!supabase) throw new Error("BILLING_UNAVAILABLE");
  const acceptanceRequestId = crypto.randomUUID();
  const correlationId = crypto.randomUUID();
  const rpc = mode === "REACTIVATION" ? "accept_basic_paid_reactivation" : "accept_basic_paid_offer";
  const { data: acceptance, error: acceptanceError } = await supabase.rpc(rpc, {
    input_restaurant_id: restaurantId,
    input_terms_version: TERMS_VERSION,
    input_confirmation: mode === "REACTIVATION"
      ? "BASIC ERNEUT KOSTENPFLICHTIG BESTELLEN"
      : "BASIC KOSTENPFLICHTIG BESTELLEN",
    input_request_id: acceptanceRequestId,
    input_correlation_id: correlationId,
  });
  let acceptanceId = acceptance?.acceptance_id as string | undefined;
  let checkoutAllowed = acceptance?.checkout_allowed === true;
  if (acceptanceError || !acceptanceId) {
    // An RPC transport error may occur after the acceptance committed. The
    // owner-only read model, not a second acceptance, resolves that outcome.
    const snapshot = await loadBasicOwnerContractSnapshot(restaurantId);
    if (snapshot.acceptance_kind !== mode || snapshot.acceptance_terms_version !== TERMS_VERSION
      || !snapshot.acceptance_id) throw new Error(acceptanceError?.message ?? "BASIC_ACCEPTANCE_FAILED");
    acceptanceId = snapshot.acceptance_id;
    checkoutAllowed = snapshot.checkout_allowed;
  }
  if (!checkoutAllowed) {
    return { status: "DECISION_SAVED", acceptanceId };
  }
  const { data, error } = await supabase.functions.invoke("billing-basic-test-checkout", { body: {
    acceptance_id: acceptanceId,
    request_id: crypto.randomUUID(),
    return_route: "/admin/settings/konto-testphase",
  } });
  if (error || data?.code !== "BASIC_TEST_CHECKOUT_CREATED" || typeof data?.details?.url !== "string"
    || !data.details.url.startsWith("https://checkout.stripe.com/")) {
    throw new Error(data?.code ?? error?.message ?? "BASIC_CHECKOUT_FAILED");
  }
  return { status: "CHECKOUT_READY", url: data.details.url as string };
}

export async function loadBasicOwnerContractSnapshot(restaurantId: string) {
  if (!supabase) throw new Error("BILLING_UNAVAILABLE");
  const { data, error } = await supabase.rpc("get_owner_basic_contract_snapshot", {
    input_restaurant_id: restaurantId,
  });
  if (error || !data || data.restaurant_id !== restaurantId) {
    throw new Error(error?.message ?? "BASIC_OWNER_CONTRACT_READ_FAILED");
  }
  return data as BasicOwnerContractSnapshot;
}

export async function openAcceptedBasicTestCheckout(acceptanceId: string): Promise<BasicPaidOfferResult> {
  if (!supabase) throw new Error("BILLING_UNAVAILABLE");
  const { data, error } = await supabase.functions.invoke("billing-basic-test-checkout", { body: {
    acceptance_id: acceptanceId,
    request_id: crypto.randomUUID(),
    return_route: "/admin/settings/konto-testphase",
  } });
  if (error || data?.code !== "BASIC_TEST_CHECKOUT_CREATED" || typeof data?.details?.url !== "string"
    || !data.details.url.startsWith("https://checkout.stripe.com/")) {
    throw new Error(data?.code ?? error?.message ?? "BASIC_CHECKOUT_FAILED");
  }
  return { status: "CHECKOUT_READY", url: data.details.url as string };
}
