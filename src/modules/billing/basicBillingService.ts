import { supabase } from "../../shared/lib/supabase";

const TERMS_VERSION = "basic-paid-v1-2026-09-27";

export async function acceptBasicOfferAndOpenTestCheckout(restaurantId: string) {
  if (!supabase) throw new Error("BILLING_UNAVAILABLE");
  const acceptanceRequestId = crypto.randomUUID();
  const correlationId = crypto.randomUUID();
  const { data: acceptance, error: acceptanceError } = await supabase.rpc("accept_basic_paid_offer", {
    input_restaurant_id: restaurantId,
    input_terms_version: TERMS_VERSION,
    input_confirmation: "BASIC KOSTENPFLICHTIG BESTELLEN",
    input_request_id: acceptanceRequestId,
    input_correlation_id: correlationId,
  });
  if (acceptanceError || !acceptance?.acceptance_id) throw new Error(acceptanceError?.message ?? "BASIC_ACCEPTANCE_FAILED");
  const { data, error } = await supabase.functions.invoke("billing-basic-test-checkout", { body: {
    acceptance_id: acceptance.acceptance_id,
    request_id: crypto.randomUUID(),
    return_route: "/admin/settings/konto-testphase",
  } });
  if (error || data?.code !== "BASIC_TEST_CHECKOUT_CREATED" || typeof data?.details?.url !== "string"
    || !data.details.url.startsWith("https://checkout.stripe.com/")) {
    throw new Error(data?.code ?? error?.message ?? "BASIC_CHECKOUT_FAILED");
  }
  return data.details.url as string;
}
