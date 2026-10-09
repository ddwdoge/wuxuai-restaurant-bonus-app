import { createClient } from "npm:@supabase/supabase-js@2.50.3";
import { checkoutIdempotencyKey, parseBasicTestCheckoutRequest, runBasicTestCheckout } from "../_shared/billingArchitecture.mjs";
import { requireProjectBinding, requireProjectSession } from "../_shared/projectBinding.mjs";

const allowedHeaders = new Set(["authorization", "apikey", "content-type", "x-client-info"]);

function boundResponse(status: number, code: string, details?: unknown, cors = "") {
  return new Response(JSON.stringify({ code, details }), { status, headers: {
    "content-type": "application/json; charset=utf-8", "cache-control": "no-store",
    ...(cors ? { "access-control-allow-origin": cors, vary: "Origin" } : {}),
  } });
}

Deno.serve(async (request) => {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const stripeKey = Deno.env.get("STRIPE_TEST_SECRET_KEY") ?? "";
  if (Deno.env.get("BASIC_BILLING_MODE") !== "staging_test_only" || !anonKey || !serviceKey
    || !stripeKey.startsWith("sk_test_") || stripeKey.includes("live")) {
    return boundResponse(503, "BASIC_TEST_CHECKOUT_NOT_ENABLED");
  }
  let binding, service;
  try {
    service = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    binding = await requireProjectBinding(service, {
      backendUrl: url, projectRef: Deno.env.get("BASIC_BILLING_PROJECT_REF"),
      issuer: Deno.env.get("WUXUAI_AUTH_ISSUER"), appOrigin: Deno.env.get("WUXUAI_APP_ORIGIN"),
      deploymentId: Deno.env.get("DENO_DEPLOYMENT_ID"),
    });
  } catch { return boundResponse(503, "PROJECT_BINDING_REQUIRED"); }
  const stagingOrigin = binding.app_origin;
  const response = (status: number, code: string, details?: unknown, cors = false) =>
    boundResponse(status, code, details, cors ? stagingOrigin : "");
  const originAllowed = request.headers.get("origin") === stagingOrigin;
  if (request.method === "OPTIONS") {
    const headers = (request.headers.get("access-control-request-headers") ?? "").split(",")
      .map((value) => value.trim().toLowerCase()).filter(Boolean);
    if (!originAllowed || request.headers.get("access-control-request-method") !== "POST"
      || headers.some((value) => !allowedHeaders.has(value))) return response(403, "CORS_PREFLIGHT_BLOCKED");
    return new Response(null, { status: 204, headers: {
      "access-control-allow-origin": stagingOrigin, "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
      vary: "Origin", "cache-control": "no-store",
    } });
  }
  if (request.method !== "POST") return response(405, "METHOD_NOT_ALLOWED", undefined, originAllowed);
  if (!originAllowed) return response(503, "BASIC_TEST_CHECKOUT_NOT_ENABLED");
  const authorization = request.headers.get("authorization") ?? "";
  if (!/^Bearer [A-Za-z0-9._-]+$/.test(authorization)) return response(401, "AUTH_REQUIRED", undefined, true);
  let input;
  try {
    if (Number(request.headers.get("content-length") ?? 0) > 2048) return response(413, "REQUEST_TOO_LARGE", undefined, true);
    input = parseBasicTestCheckoutRequest(await request.json());
  } catch {
    return response(400, "BASIC_CHECKOUT_REQUEST_INVALID", undefined, true);
  }
  const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } },
    auth: { autoRefreshToken: false, persistSession: false } });
  try { await requireProjectSession(userClient); }
  catch { return response(403, "PROJECT_SESSION_REQUIRED", undefined, true); }
  const { data: prepared, error: prepareError } = await userClient.rpc("prepare_basic_test_checkout", {
    input_acceptance_id: input.acceptance_id, input_request_id: input.request_id,
    input_return_route: input.return_route,
  });
  if (prepareError || !prepared?.checkout_request_id || !prepared?.price_id || !prepared?.restaurant_id
    || !prepared?.request_id || prepared?.acceptance_id !== input.acceptance_id) {
    return response(prepareError?.code === "42501" ? 403 : 409, prepareError?.message ?? "BASIC_TEST_CHECKOUT_BLOCKED", undefined, true);
  }
  const idempotencyKey = await checkoutIdempotencyKey(prepared.restaurant_id, prepared.request_id);
  const successUrl = `${stagingOrigin}${input.return_route}?checkout=success`;
  const cancelUrl = `${stagingOrigin}${input.return_route}?checkout=cancelled`;
  const form = new URLSearchParams({
    mode: "subscription", success_url: successUrl, cancel_url: cancelUrl,
    client_reference_id: prepared.checkout_request_id,
    "line_items[0][price]": prepared.price_id, "line_items[0][quantity]": "1",
    "automatic_tax[enabled]": "false",
    "metadata[restaurant_id]": prepared.restaurant_id,
    "metadata[acceptance_id]": prepared.acceptance_id,
    "metadata[request_id]": prepared.request_id,
    "metadata[correlation_id]": prepared.correlation_id,
    "subscription_data[metadata][restaurant_id]": prepared.restaurant_id,
    "subscription_data[metadata][acceptance_id]": prepared.acceptance_id,
    "subscription_data[metadata][request_id]": prepared.request_id,
    "subscription_data[metadata][correlation_id]": prepared.correlation_id,
  });
  try {
    const checkoutUrl = await runBasicTestCheckout(prepared, {
      create: async () => {
        const providerResponse = await fetch("https://api.stripe.com/v1/checkout/sessions", {
          method: "POST", headers: { authorization: `Bearer ${stripeKey}`,
            "content-type": "application/x-www-form-urlencoded", "idempotency-key": idempotencyKey }, body: form,
        });
        if (!providerResponse.ok) throw new Error("BASIC_TEST_PROVIDER_ERROR");
        return providerResponse.json();
      },
      retrieve: async (sessionId: string) => {
        const providerResponse = await fetch(`https://api.stripe.com/v1/checkout/sessions/${sessionId}`, {
          headers: { authorization: `Bearer ${stripeKey}` },
        });
        if (!providerResponse.ok) throw new Error("BASIC_TEST_PROVIDER_ERROR");
        return providerResponse.json();
      },
      complete: async (checkoutRequestId: string, sessionId: string) => {
        const { error } = await service.rpc("complete_basic_test_checkout", {
          input_checkout_request_id: checkoutRequestId, input_provider_session_id: sessionId,
        });
        if (error) throw new Error("BASIC_TEST_CHECKOUT_RECORD_FAILED");
      },
    });
    return response(200, "BASIC_TEST_CHECKOUT_CREATED", { url: checkoutUrl }, true);
  } catch (error) {
    const code = error instanceof Error ? error.message : "BASIC_TEST_PROVIDER_ERROR";
    return response(code === "BASIC_TEST_CHECKOUT_OUTCOME_UNCLEAR" ? 409 : 503,
      code.startsWith("BASIC_TEST_CHECKOUT_") ? code : "BASIC_TEST_PROVIDER_ERROR", undefined, true);
  }
});
