import { createClient } from "npm:@supabase/supabase-js@2.50.3";
import { sanitizeStripeTestEvent, sha256Hex, verifyRawWebhook } from "../_shared/billingArchitecture.mjs";
import { requireProjectBinding } from "../_shared/projectBinding.mjs";

function response(status: number, code: string, details?: unknown) {
  return new Response(JSON.stringify({ code, details }), { status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return response(405, "METHOD_NOT_ALLOWED");
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const webhookSecret = Deno.env.get("STRIPE_TEST_WEBHOOK_SECRET") ?? "";
  const enabled = Deno.env.get("BASIC_BILLING_MODE") === "staging_test_only"
    && webhookSecret.startsWith("whsec_");
  if (!enabled || !serviceKey || !webhookSecret) return response(503, "BASIC_TEST_WEBHOOK_NOT_ENABLED");
  let service;
  try {
    service = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    await requireProjectBinding(service, {
      backendUrl: url, projectRef: Deno.env.get("BASIC_BILLING_PROJECT_REF"),
      issuer: Deno.env.get("WUXUAI_AUTH_ISSUER"), appOrigin: Deno.env.get("WUXUAI_APP_ORIGIN"),
      deploymentId: Deno.env.get("DENO_DEPLOYMENT_ID"),
    });
  } catch { return response(503, "PROJECT_BINDING_REQUIRED"); }
  if (Number(request.headers.get("content-length") ?? 0) > 262144) return response(413, "REQUEST_TOO_LARGE");
  const raw = new Uint8Array(await request.arrayBuffer());
  if (raw.length > 262144) return response(413, "REQUEST_TOO_LARGE");
  if (!await verifyRawWebhook(raw, request.headers.get("stripe-signature"), webhookSecret,
    Math.floor(Date.now() / 1000))) return response(400, "WEBHOOK_SIGNATURE_INVALID");
  let event;
  try {
    event = sanitizeStripeTestEvent(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw)));
  } catch {
    return response(400, "BASIC_TEST_WEBHOOK_INVALID");
  }
  const { data, error } = await service.rpc("record_basic_stripe_test_event", {
    input_event_id: event.event_id, input_payload_sha256: await sha256Hex(raw),
    input_event_type: event.event_type, input_event_created_at: event.event_created_at,
    input_provider_session_id: event.provider_session_id, input_provider_customer_id: event.provider_customer_id,
    input_provider_subscription_id: event.provider_subscription_id, input_restaurant_id: event.restaurant_id,
    input_acceptance_id: event.acceptance_id, input_provider_status: event.provider_status,
    input_period_start: event.period_start, input_period_end: event.period_end,
    input_request_id: event.request_id, input_correlation_id: event.correlation_id, input_livemode: false,
  });
  if (error) return response(error.code === "23505" ? 409 : 503, error.code ?? "BASIC_TEST_WEBHOOK_RETRY");
  if (data?.result_code === "BASIC_TEST_PROVIDER_BINDING_PENDING") {
    return response(503, data.result_code);
  }
  return response(200, data?.status ?? "PROCESSED", data);
});
