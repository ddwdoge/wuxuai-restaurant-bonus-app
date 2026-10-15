import { supabase } from "../../shared/lib/supabase";
import { loadTestOnlyBasicRuntime } from "../offers/restaurantOfferService";

const exposedEdgeCodes = new Set([
  "PROJECT_BINDING_REQUIRED",
  "METHOD_NOT_ALLOWED",
  "TEST_ONLY_CHECKOUT_ORIGIN_DENIED",
  "TEST_ONLY_CHECKOUT_DISABLED",
  "AUTH_REQUIRED",
  "PROJECT_SESSION_REQUIRED",
  "TEST_ONLY_CHECKOUT_REQUEST_INVALID",
  "TEST_ONLY_STRIPE_ACCOUNT_READBACK_FAILED",
  "TEST_ONLY_STRIPE_ACCOUNT_BINDING_INVALID",
  "TEST_ONLY_CHECKOUT_OWNER_REQUIRED",
  "TEST_ONLY_CHECKOUT_ACCESS_DENIED",
  "TEST_ONLY_CHECKOUT_REPLAY_CONFLICT",
  "TEST_ONLY_CHECKOUT_PREPARE_FAILED",
  "TEST_ONLY_CHECKOUT_PREPARATION_INVALID",
  "TEST_ONLY_CHECKOUT_PROVIDER_FAILED",
  "TEST_ONLY_CHECKOUT_PROVIDER_READBACK_INVALID",
  "TEST_ONLY_CHECKOUT_BIND_FAILED",
]);

export class TestOnlyStripeCheckoutError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "TestOnlyStripeCheckoutError";
  }
}

async function readSafeEdgeCode(error: unknown) {
  const context = error && typeof error === "object" && "context" in error
    ? (error as { context?: unknown }).context
    : undefined;
  if (!(context instanceof Response)) return "TEST_ONLY_CHECKOUT_FAILED";
  try {
    const payload = await context.clone().json() as { code?: unknown };
    return typeof payload?.code === "string" && exposedEdgeCodes.has(payload.code)
      ? payload.code
      : "TEST_ONLY_CHECKOUT_FAILED";
  } catch {
    return "TEST_ONLY_CHECKOUT_FAILED";
  }
}

export async function openIsolatedTestOnlyStripeCheckout(restaurantId: string, requestId: string): Promise<string> {
  if (!supabase || !restaurantId || !requestId) throw new Error("TEST_ONLY_CHECKOUT_UNAVAILABLE");
  const runtime = await loadTestOnlyBasicRuntime(restaurantId);
  if (!runtime.active || !runtime.receipt_id) throw new Error("TEST_ONLY_ACCESS_CLOSED");

  // Separate from BASIC paid-offer acceptance; the Edge/DB contract rechecks every gate.
  const { data, error } = await supabase.functions.invoke("test-only-stripe-checkout", {
    body: { restaurant_id: restaurantId, request_id: requestId, return_route: "/admin/settings/konto-testphase" },
  });
  if (error) throw new TestOnlyStripeCheckoutError(await readSafeEdgeCode(error));
  if (data?.code !== "TEST_ONLY_CHECKOUT_SESSION_CREATED" || typeof data?.details?.url !== "string")
    throw new TestOnlyStripeCheckoutError("TEST_ONLY_CHECKOUT_FAILED");
  const checkoutUrl = new URL(data.details.url);
  if (checkoutUrl.origin !== "https://checkout.stripe.com")
    throw new TestOnlyStripeCheckoutError("TEST_ONLY_CHECKOUT_URL_INVALID");
  return checkoutUrl.href;
}
