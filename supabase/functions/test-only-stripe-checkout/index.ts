import { createClient } from "npm:@supabase/supabase-js@2.50.3";
import { requireProjectBinding, requireProjectSession } from "../_shared/projectBinding.mjs";
import {
  buildTestOnlyCheckoutForm,
  isRestrictedStripeTestCheckoutKey,
  parseTestOnlyCheckoutRequest,
  verifyStripeTestAccount,
  verifyTestOnlyCheckoutSession,
} from "../_shared/testOnlyStripeCheckout.mjs";

const allowedHeaders = new Set(["authorization", "apikey", "content-type", "x-client-info"]);
const safePrepareCodes = new Set([
  "TEST_ONLY_CHECKOUT_OWNER_REQUIRED",
  "TEST_ONLY_CHECKOUT_ACCESS_DENIED",
  "TEST_ONLY_CHECKOUT_REPLAY_CONFLICT",
]);

function reply(status: number, code: string, details?: unknown, origin = "") {
  return new Response(JSON.stringify({ code, details }), { status, headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...(origin ? { "access-control-allow-origin": origin, vary: "Origin" } : {}),
  } });
}

function safePrepareCode(error: { message?: unknown } | null) {
  return typeof error?.message === "string" && safePrepareCodes.has(error.message)
    ? error.message
    : "TEST_ONLY_CHECKOUT_PREPARE_FAILED";
}

Deno.serve(async (request) => {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const checkoutKey = Deno.env.get("TEST_ONLY_STRIPE_CHECKOUT_RESTRICTED_KEY") ?? "";
  const account = Deno.env.get("TEST_ONLY_STRIPE_ACCOUNT_ID") ?? "";
  let service;
  try {
    service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  } catch {
    return reply(503, "PROJECT_BINDING_REQUIRED");
  }
  let binding;
  try {
    binding = await requireProjectBinding(service, {
      backendUrl: url,
      projectRef: Deno.env.get("TEST_ONLY_STRIPE_PROJECT_REF"),
      issuer: Deno.env.get("WUXUAI_AUTH_ISSUER"),
      appOrigin: Deno.env.get("WUXUAI_APP_ORIGIN"),
      deploymentId: Deno.env.get("DENO_DEPLOYMENT_ID"),
    });
  } catch {
    return reply(503, "PROJECT_BINDING_REQUIRED");
  }

  const origin = request.headers.get("origin") ?? "";
  const originAllowed = origin === binding.app_origin;
  if (request.method === "OPTIONS") {
    const headers = (request.headers.get("access-control-request-headers") ?? "").split(",")
      .map((value) => value.trim().toLowerCase()).filter(Boolean);
    if (!originAllowed || request.headers.get("access-control-request-method") !== "POST"
      || headers.some((value) => !allowedHeaders.has(value))) {
      return reply(403, "CORS_PREFLIGHT_BLOCKED");
    }
    return new Response(null, { status: 204, headers: {
      "access-control-allow-origin": binding.app_origin,
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
      vary: "Origin",
      "cache-control": "no-store",
    } });
  }
  if (request.method !== "POST") return reply(405, "METHOD_NOT_ALLOWED", undefined, originAllowed ? origin : "");
  if (!originAllowed) return reply(403, "TEST_ONLY_CHECKOUT_ORIGIN_DENIED");
  if (Deno.env.get("TEST_ONLY_STRIPE_CHECKOUT_ENABLED") !== "true"
    || !isRestrictedStripeTestCheckoutKey(checkoutKey) || !account.startsWith("acct_")) {
    return reply(503, "TEST_ONLY_CHECKOUT_DISABLED", undefined, origin);
  }

  const authorization = request.headers.get("authorization") ?? "";
  if (!/^Bearer [A-Za-z0-9._-]+$/.test(authorization)) {
    return reply(401, "AUTH_REQUIRED", undefined, origin);
  }
  let user;
  try {
    user = createClient(url, anon, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
  } catch {
    return reply(403, "PROJECT_SESSION_REQUIRED", undefined, origin);
  }
  try {
    await requireProjectSession(user);
  } catch {
    return reply(403, "PROJECT_SESSION_REQUIRED", undefined, origin);
  }

  let input;
  try {
    input = parseTestOnlyCheckoutRequest(await request.json());
  } catch {
    return reply(400, "TEST_ONLY_CHECKOUT_REQUEST_INVALID", undefined, origin);
  }

  let accountPayload;
  try {
    const accountReadback = await fetch("https://api.stripe.com/v1/account", {
      headers: { authorization: `Bearer ${checkoutKey}` },
    });
    if (!accountReadback.ok) return reply(503, "TEST_ONLY_STRIPE_ACCOUNT_READBACK_FAILED", undefined, origin);
    accountPayload = await accountReadback.json();
  } catch {
    return reply(503, "TEST_ONLY_STRIPE_ACCOUNT_READBACK_FAILED", undefined, origin);
  }
  try {
    verifyStripeTestAccount(accountPayload, account);
  } catch {
    return reply(409, "TEST_ONLY_STRIPE_ACCOUNT_BINDING_INVALID", undefined, origin);
  }

  let prepared;
  try {
    const result = await user.rpc("prepare_test_only_stripe_checkout", {
      input_restaurant_id: input.restaurant_id,
      input_request_id: input.request_id,
      input_return_route: input.return_route,
    });
    if (result.error || !result.data) {
      return reply(result.error?.code === "42501" ? 403 : 409, safePrepareCode(result.error), undefined, origin);
    }
    prepared = result.data;
  } catch {
    return reply(409, "TEST_ONLY_CHECKOUT_PREPARE_FAILED", undefined, origin);
  }

  let providerForm;
  try {
    providerForm = buildTestOnlyCheckoutForm(prepared, binding.app_origin);
  } catch {
    return reply(409, "TEST_ONLY_CHECKOUT_PREPARATION_INVALID", undefined, origin);
  }

  let providerPayload;
  try {
    const provider = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${checkoutKey}`,
        "content-type": "application/x-www-form-urlencoded",
        "idempotency-key": `wuxuai-test-only-${prepared.id}`,
      },
      body: providerForm,
    });
    if (!provider.ok) return reply(502, "TEST_ONLY_CHECKOUT_PROVIDER_FAILED", undefined, origin);
    providerPayload = await provider.json();
  } catch {
    return reply(502, "TEST_ONLY_CHECKOUT_PROVIDER_FAILED", undefined, origin);
  }

  let verified;
  try {
    verified = verifyTestOnlyCheckoutSession(providerPayload, prepared, account);
  } catch {
    return reply(409, "TEST_ONLY_CHECKOUT_PROVIDER_READBACK_INVALID", undefined, origin);
  }
  try {
    const { error: bindError } = await service.rpc("bind_test_only_stripe_checkout_session", {
      input_checkout_request_id: prepared.id,
      input_provider_account_id: account,
      input_provider_session_id: verified.session_id,
      input_price_id: prepared.price_id,
      input_livemode: false,
    });
    if (bindError) return reply(409, "TEST_ONLY_CHECKOUT_BIND_FAILED", undefined, origin);
  } catch {
    return reply(409, "TEST_ONLY_CHECKOUT_BIND_FAILED", undefined, origin);
  }
  return reply(200, "TEST_ONLY_CHECKOUT_SESSION_CREATED", {
    url: verified.url,
    request_id: input.request_id,
  }, origin);
});
