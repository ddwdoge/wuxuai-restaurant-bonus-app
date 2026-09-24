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
  if (Deno.env.get("BILLING_ARCHITECTURE_MODE") !== "local_only"
    || !/^http:\/\/(127\.0\.0\.1|localhost|kong)(:\d+)?\/?$/.test(url) || !anonKey) {
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
