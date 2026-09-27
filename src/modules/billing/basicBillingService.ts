import { supabase } from "../../shared/lib/supabase";

const TERMS_VERSION = "basic-paid-v1-2026-09-28";

export type BasicPaidContractMode = "INITIAL" | "REACTIVATION";

export type BasicPaidOfferResult =
  | { status: "DECISION_SAVED" }
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
  if (acceptanceError || !acceptance?.acceptance_id) throw new Error(acceptanceError?.message ?? "BASIC_ACCEPTANCE_FAILED");
  if (acceptance.checkout_allowed !== true) return { status: "DECISION_SAVED" };
  const { data, error } = await supabase.functions.invoke("billing-basic-test-checkout", { body: {
    acceptance_id: acceptance.acceptance_id,
    request_id: crypto.randomUUID(),
    return_route: "/admin/settings/konto-testphase",
  } });
  if (error || data?.code !== "BASIC_TEST_CHECKOUT_CREATED" || typeof data?.details?.url !== "string"
    || !data.details.url.startsWith("https://checkout.stripe.com/")) {
    throw new Error(data?.code ?? error?.message ?? "BASIC_CHECKOUT_FAILED");
  }
  return { status: "CHECKOUT_READY", url: data.details.url as string };
}
