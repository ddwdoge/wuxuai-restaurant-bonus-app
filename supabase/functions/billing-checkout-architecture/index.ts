import { createClient } from "npm:@supabase/supabase-js@2.50.3";
import { orchestrateBlockedCheckout, parseCheckoutRequest } from "../_shared/billingArchitecture.mjs";

function respond(status: number, code: string, details?: unknown) {
  return new Response(JSON.stringify({ code, details }), {
    status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return respond(405, "METHOD_NOT_ALLOWED");
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const mode = Deno.env.get("BILLING_ARCHITECTURE_MODE");
  const local = mode === "local_only" && /^http:\/\/(127\.0\.0\.1|localhost|kong)(:\d+)?\/?$/.test(url);
  const staging = mode === "staging_negative_only"
    && Deno.env.get("BILLING_STAGING_PROJECT_REF") === "bwhvfjuwixgwduoeqaya"
    && url === "https://bwhvfjuwixgwduoeqaya.supabase.co"
    && Deno.env.get("BILLING_ENVIRONMENT") === "STAGING"
    && !Object.values(Deno.env.toObject()).some((value) => /sk[_-]?live[_-]/i.test(value));
  if ((!local && !staging) || !anonKey || (staging && !Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"))) {
    return respond(503, "BILLING_ARCHITECTURE_NOT_ENABLED");
  }
  const authorization = request.headers.get("authorization") ?? "";
  if (!/^Bearer [A-Za-z0-9._-]+$/.test(authorization)) return respond(401, "AUTH_REQUIRED");
  let input;
  try {
    if (Number(request.headers.get("content-length") ?? 0) > 2048) return respond(413, "REQUEST_TOO_LARGE");
    input = parseCheckoutRequest(await request.json());
  } catch {
    return respond(400, "CHECKOUT_REQUEST_INVALID");
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
      if (readinessError || ready !== true) return respond(503, "STAGING_NEGATIVE_READINESS_BLOCKED");
    }
    const decision = await orchestrateBlockedCheckout(input, (parsed) => client.rpc("request_blocked_test_checkout", {
      input_plan_key: parsed.plan_key,
      input_request_id: parsed.request_id,
      input_return_route: parsed.return_route,
    }));
    // Architecture-only: no provider adapter or session creator is reachable.
    return respond(403, decision.blocker_code ?? "ACTIVATION_BLOCKED", decision);
  } catch (error) {
    if (error instanceof Error && error.message === "CHECKOUT_OWNER_REQUIRED") {
      return respond(403, "CHECKOUT_OWNER_REQUIRED");
    }
    return respond(409, error instanceof Error && error.message === "CHECKOUT_REQUEST_PAYLOAD_CONFLICT"
      ? error.message : "CHECKOUT_BLOCKED");
  }
});
