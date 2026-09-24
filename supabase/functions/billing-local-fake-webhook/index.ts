import { createClient } from "npm:@supabase/supabase-js@2.50.3";
import { parseTechnicalEvent, sha256Hex, verifyRawWebhook } from "../_shared/billingArchitecture.mjs";

function respond(status: number, code: string, details?: unknown) {
  return new Response(JSON.stringify({ code, details }), {
    status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return respond(405, "METHOD_NOT_ALLOWED");
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const mode = Deno.env.get("BILLING_ARCHITECTURE_MODE");
  const local = mode === "local_only" && /^http:\/\/(127\.0\.0\.1|localhost|kong)(:\d+)?\/?$/.test(url);
  const staging = mode === "staging_negative_only"
    && Deno.env.get("BILLING_STAGING_PROJECT_REF") === "bwhvfjuwixgwduoeqaya"
    && url === "https://bwhvfjuwixgwduoeqaya.supabase.co"
    && Deno.env.get("BILLING_ENVIRONMENT") === "STAGING"
    && !Object.values(Deno.env.toObject()).some((value) => /sk[_-]?live[_-]/i.test(value));
  const fakeSecret = Deno.env.get(local ? "BILLING_LOCAL_FAKE_WEBHOOK_SECRET"
    : "BILLING_STAGING_SYNTHETIC_WEBHOOK_SECRET") ?? "";
  if ((!local && !staging) || !serviceKey || !fakeSecret || (staging && fakeSecret.length < 32)) {
    return respond(503, "BILLING_ARCHITECTURE_NOT_ENABLED");
  }
  if (Number(request.headers.get("content-length") ?? 0) > 131072) return respond(413, "REQUEST_TOO_LARGE");
  const rawBytes = new Uint8Array(await request.arrayBuffer());
  if (rawBytes.length > 131072) return respond(413, "REQUEST_TOO_LARGE");
  if (!await verifyRawWebhook(rawBytes, request.headers.get("stripe-signature"), fakeSecret,
    Math.floor(Date.now() / 1000))) return respond(400, "WEBHOOK_SIGNATURE_INVALID");
  let event;
  try {
    const input = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(rawBytes));
    if (staging) {
      const marker = Deno.env.get("BILLING_STAGING_SYNTHETIC_MARKER") ?? "";
      const supplied = request.headers.get("x-wuxuai-synthetic-marker") ?? "";
      let mismatch = marker.length ^ supplied.length;
      for (let i = 0; i < Math.max(marker.length, supplied.length); i += 1) {
        mismatch |= (marker.charCodeAt(i) || 0) ^ (supplied.charCodeAt(i) || 0);
      }
      if (marker.length < 32 || mismatch !== 0
        || input.environment !== "STAGING" || input.synthetic_test !== true
        || input.request_id !== Deno.env.get("BILLING_STAGING_SYNTHETIC_REQUEST_ID")
        || input.correlation_id !== Deno.env.get("BILLING_STAGING_SYNTHETIC_CORRELATION_ID")
        || !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/.test(input.request_id ?? "")
        || !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/.test(input.correlation_id ?? "")
        || !/^evt_wuxuai_staging_[A-Za-z0-9_]{8,80}$/.test(input.id ?? "")
        || input.id !== Deno.env.get("BILLING_STAGING_SYNTHETIC_EVENT_ID")
        || input.type !== "checkout.session.completed"
        || Object.keys(input.data?.object ?? {}).length !== 0) {
        return respond(403, "SYNTHETIC_STAGING_EVENT_REQUIRED");
      }
    }
    event = parseTechnicalEvent(input, "LOCAL_FAKE_ACCOUNT");
  } catch {
    return respond(400, "WEBHOOK_EVENT_INVALID");
  }
  const client = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  if (staging) {
    const { data: ready, error: readinessError } = await client.rpc("billing_staging_negative_readiness");
    if (readinessError || ready !== true) return respond(503, "STAGING_NEGATIVE_READINESS_BLOCKED");
  }
  const { data, error } = await client.rpc("record_local_fake_billing_webhook", {
    input_event_id: event.event_id,
    input_payload_sha256: await sha256Hex(rawBytes),
    input_event_type: event.event_type,
    input_event_created_at: event.event_created_at,
    input_provider_subscription_id: event.provider_subscription_id,
    input_tenant_ref: event.tenant_ref,
    input_account: "LOCAL_FAKE_ACCOUNT",
    input_livemode: false,
  });
  if (error) return respond(error.code === "23505" ? 409 : 503, error.code ?? "WEBHOOK_RETRYABLE_ERROR");
  return respond(200, data?.status ?? "ACTIVATION_BLOCKED", data);
});
