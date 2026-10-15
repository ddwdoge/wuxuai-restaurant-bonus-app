import { createClient } from "npm:@supabase/supabase-js@2.50.3";
import { requireProjectBinding, requireProjectSession } from "../_shared/projectBinding.mjs";
import {
  buildTestOnlyCustomerForm,
  buildTestOnlyCheckoutForm,
  buildTestOnlyTestClockForm,
  isRestrictedStripeTestCheckoutKey,
  parseTestOnlyCheckoutRequest,
  verifyStripeTestAccount,
  verifyTestOnlyCheckoutSession,
  verifyTestOnlyCustomer,
  verifyTestOnlyTestClock,
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
  const setupKey = Deno.env.get("TEST_ONLY_STRIPE_LIFECYCLE_SETUP_RESTRICTED_KEY") ?? "";
  const webhookReadKey = Deno.env.get("TEST_ONLY_STRIPE_WEBHOOK_RESTRICTED_KEY") ?? "";
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
    || !isRestrictedStripeTestCheckoutKey(checkoutKey) || !isRestrictedStripeTestCheckoutKey(setupKey)
    || checkoutKey === setupKey || (webhookReadKey && webhookReadKey === setupKey)
    || !account.startsWith("acct_")) {
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

  let accountPayload, setupAccountPayload;
  try {
    const [accountReadback, setupAccountReadback] = await Promise.all([
      fetch("https://api.stripe.com/v1/account", { headers: { authorization: `Bearer ${checkoutKey}` } }),
      fetch("https://api.stripe.com/v1/account", { headers: { authorization: `Bearer ${setupKey}` } }),
    ]);
    if (!accountReadback.ok || !setupAccountReadback.ok) {
      return reply(503, "TEST_ONLY_STRIPE_ACCOUNT_READBACK_FAILED", undefined, origin);
    }
    [accountPayload, setupAccountPayload] = await Promise.all([accountReadback.json(), setupAccountReadback.json()]);
  } catch {
    return reply(503, "TEST_ONLY_STRIPE_ACCOUNT_READBACK_FAILED", undefined, origin);
  }
  try {
    verifyStripeTestAccount(accountPayload, account);
    verifyStripeTestAccount(setupAccountPayload, account);
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

  let preparation;
  try {
    const { data, error } = await service.rpc("get_test_only_stripe_customer_preparation", {
      input_checkout_request_id: prepared.id,
    });
    if (error) return reply(409, "TEST_ONLY_TEST_CUSTOMER_BIND_FAILED", undefined, origin);
    preparation = data;
  } catch {
    return reply(409, "TEST_ONLY_TEST_CUSTOMER_BIND_FAILED", undefined, origin);
  }

  let testClockId = preparation?.provider_test_clock_id;
  let providerCustomerId = preparation?.provider_customer_id;
  let frozenTime = preparation?.frozen_time ? Math.floor(Date.parse(preparation.frozen_time) / 1000) : Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(frozenTime) || frozenTime <= 0) {
    return reply(409, "TEST_ONLY_TEST_CLOCK_READBACK_INVALID", undefined, origin);
  }

  try {
    if (!preparation) {
      const clockResponse = await fetch("https://api.stripe.com/v1/test_helpers/test_clocks", {
        method: "POST",
        headers: {
          authorization: `Bearer ${setupKey}`,
          "content-type": "application/x-www-form-urlencoded",
          "idempotency-key": `wuxuai-test-clock-${prepared.id}`,
        },
        body: buildTestOnlyTestClockForm(prepared, frozenTime),
      });
      if (!clockResponse.ok) return reply(502, "TEST_ONLY_TEST_CLOCK_PROVIDER_FAILED", undefined, origin);
      const verifiedClock = verifyTestOnlyTestClock(await clockResponse.json(), prepared, frozenTime);
      testClockId = verifiedClock.test_clock_id;

      const customerResponse = await fetch("https://api.stripe.com/v1/customers", {
        method: "POST",
        headers: {
          authorization: `Bearer ${setupKey}`,
          "content-type": "application/x-www-form-urlencoded",
          "idempotency-key": `wuxuai-test-customer-${prepared.id}`,
        },
        body: buildTestOnlyCustomerForm(prepared, testClockId),
      });
      if (!customerResponse.ok) return reply(502, "TEST_ONLY_TEST_CUSTOMER_PROVIDER_FAILED", undefined, origin);
      providerCustomerId = verifyTestOnlyCustomer(await customerResponse.json(), prepared, testClockId).provider_customer_id;

      const { data, error } = await service.rpc("bind_test_only_stripe_test_clock_customer", {
        input_checkout_request_id: prepared.id,
        input_provider_account_id: account,
        input_provider_test_clock_id: testClockId,
        input_provider_customer_id: providerCustomerId,
        input_frozen_time: verifiedClock.frozen_time,
        input_livemode: false,
      });
      if (error || !data) return reply(409, "TEST_ONLY_TEST_CUSTOMER_BIND_FAILED", undefined, origin);
    } else {
      const [clockResponse, customerResponse] = await Promise.all([
        fetch(`https://api.stripe.com/v1/test_helpers/test_clocks/${testClockId}`, {
          headers: { authorization: `Bearer ${setupKey}` },
        }),
        fetch(`https://api.stripe.com/v1/customers/${providerCustomerId}`, {
          headers: { authorization: `Bearer ${setupKey}` },
        }),
      ]);
      if (!clockResponse.ok || !customerResponse.ok) {
        return reply(502, "TEST_ONLY_TEST_CUSTOMER_PROVIDER_FAILED", undefined, origin);
      }
      verifyTestOnlyTestClock(await clockResponse.json(), prepared, frozenTime);
      verifyTestOnlyCustomer(await customerResponse.json(), prepared, testClockId);
    }
  } catch (error) {
    const code = error instanceof Error && /^TEST_ONLY_[A-Z0-9_]+$/.test(error.message)
      ? error.message
      : "TEST_ONLY_TEST_CUSTOMER_PROVIDER_FAILED";
    return reply(409, code, undefined, origin);
  }

  let providerForm;
  try {
    providerForm = buildTestOnlyCheckoutForm(prepared, binding.app_origin, providerCustomerId);
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
    verified = verifyTestOnlyCheckoutSession(providerPayload, prepared, account, providerCustomerId);
  } catch {
    return reply(409, "TEST_ONLY_CHECKOUT_PROVIDER_READBACK_INVALID", undefined, origin);
  }
  try {
    const { error: bindError } = await service.rpc("bind_test_only_stripe_checkout_session_v2", {
      input_checkout_request_id: prepared.id,
      input_provider_account_id: account,
      input_provider_session_id: verified.session_id,
      input_provider_test_clock_id: testClockId,
      input_provider_customer_id: providerCustomerId,
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
