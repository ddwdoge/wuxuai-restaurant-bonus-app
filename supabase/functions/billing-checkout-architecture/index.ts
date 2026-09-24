import { createClient } from "npm:@supabase/supabase-js@2.50.3";
import { orchestrateBlockedCheckout, parseCheckoutRequest } from "../_shared/billingArchitecture.mjs";

const stagingOrigin = "https://staging-app.bonus.wuxuaisbi.com";
const allowedRequestHeaders = new Set(["authorization", "apikey", "content-type", "x-client-info"]);

function respond(status: number, code: string, details?: unknown, origin?: string) {
  return new Response(JSON.stringify({ code, details }), {
    status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store",
      ...(origin ? { "access-control-allow-origin": origin, "vary": "Origin" } : {}) },
  });
}

Deno.serve(async (request) => {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const mode = Deno.env.get("BILLING_ARCHITECTURE_MODE");
  const local = mode === "local_only" && /^http:\/\/(127\.0\.0\.1|localhost|kong)(:\d+)?\/?$/.test(url);
  const staging = mode === "staging_negative_only"
    && Deno.env.get("BILLING_STAGING_PROJECT_REF") === "bwhvfjuwixgwduoeqaya"
    && url === "https://bwhvfjuwixgwduoeqaya.supabase.co"
    && Deno.env.get("BILLING_ENVIRONMENT") === "STAGING"
    && !Object.values(Deno.env.toObject()).some((value) => /sk[_-]?live[_-]/i.test(value));
  const requestedOrigin = request.headers.get("origin");
  const localOrigin = Deno.env.get("BILLING_LOCAL_ALLOWED_ORIGIN") ?? "";
  const origin = staging && Deno.env.get("BILLING_STAGING_ALLOWED_ORIGIN") === stagingOrigin
    && requestedOrigin === stagingOrigin ? stagingOrigin
    : local && /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(localOrigin)
      && requestedOrigin === localOrigin ? localOrigin : undefined;
  if (request.method === "OPTIONS") {
    const method = request.headers.get("access-control-request-method");
    const headers = (request.headers.get("access-control-request-headers") ?? "")
      .split(",").map((header) => header.trim().toLowerCase()).filter(Boolean);
    if (!origin || method !== "POST" || headers.some((header) => !allowedRequestHeaders.has(header))) {
      return respond(403, "CORS_PREFLIGHT_BLOCKED");
    }
    return new Response(null, { status: 204, headers: {
      "access-control-allow-origin": origin,
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
      "vary": "Origin", "cache-control": "no-store",
    } });
  }
  if (request.method !== "POST") return respond(405, "METHOD_NOT_ALLOWED");
  if ((!local && !staging) || !anonKey || (staging && !Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"))) {
    return respond(503, "BILLING_ARCHITECTURE_NOT_ENABLED", undefined, origin);
  }
  const authorization = request.headers.get("authorization") ?? "";
  if (!/^Bearer [A-Za-z0-9._-]+$/.test(authorization)) return respond(401, "AUTH_REQUIRED", undefined, origin);
  let input;
  try {
    if (Number(request.headers.get("content-length") ?? 0) > 2048) return respond(413, "REQUEST_TOO_LARGE", undefined, origin);
    input = parseCheckoutRequest(await request.json());
  } catch {
    return respond(400, "CHECKOUT_REQUEST_INVALID", undefined, origin);
  }
  const client = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  try {
    if (staging) {
      const service = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data: ready, error: readinessError } = await service.rpc("billing_staging_negative_readiness");
      if (readinessError || ready !== true) return respond(503, "STAGING_NEGATIVE_READINESS_BLOCKED", undefined, origin);
    }
    const decision = await orchestrateBlockedCheckout(input, (parsed) => client.rpc("request_blocked_test_checkout", {
      input_plan_key: parsed.plan_key,
      input_request_id: parsed.request_id,
      input_return_route: parsed.return_route,
    }));
    // Architecture-only: no provider adapter or session creator is reachable.
    return respond(403, decision.blocker_code ?? "ACTIVATION_BLOCKED", decision, origin);
  } catch (error) {
    if (error instanceof Error && error.message === "CHECKOUT_OWNER_REQUIRED") {
      return respond(403, "CHECKOUT_OWNER_REQUIRED", undefined, origin);
    }
    return respond(409, error instanceof Error && error.message === "CHECKOUT_REQUEST_PAYLOAD_CONFLICT"
      ? error.message : "CHECKOUT_BLOCKED", undefined, origin);
  }
});
