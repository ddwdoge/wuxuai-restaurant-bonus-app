import { supabase } from "../../shared/lib/supabase";
import { loadTestOnlyBasicRuntime } from "../offers/restaurantOfferService";

export async function openIsolatedTestOnlyStripeCheckout(restaurantId: string, requestId: string): Promise<string> {
  if (!supabase || !restaurantId || !requestId) throw new Error("TEST_ONLY_CHECKOUT_UNAVAILABLE");
  const runtime = await loadTestOnlyBasicRuntime(restaurantId);
  if (!runtime.active || !runtime.receipt_id) throw new Error("TEST_ONLY_ACCESS_CLOSED");

  // Separate from BASIC paid-offer acceptance; the Edge/DB contract rechecks every gate.
  const { data, error } = await supabase.functions.invoke("test-only-stripe-checkout", {
    body: { restaurant_id: restaurantId, request_id: requestId, return_route: "/admin/settings/konto-testphase" },
  });
  if (error || data?.code !== "TEST_ONLY_CHECKOUT_SESSION_CREATED" || typeof data?.details?.url !== "string") {
    throw new Error("TEST_ONLY_CHECKOUT_FAILED");
  }
  const checkoutUrl = new URL(data.details.url);
  if (checkoutUrl.origin !== "https://checkout.stripe.com") throw new Error("TEST_ONLY_CHECKOUT_URL_INVALID");
  return checkoutUrl.href;
}
