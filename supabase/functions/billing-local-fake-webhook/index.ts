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
  const fakeSecret = Deno.env.get("BILLING_LOCAL_FAKE_WEBHOOK_SECRET") ?? "";
  if (Deno.env.get("BILLING_ARCHITECTURE_MODE") !== "local_only"
    || !/^http:\/\/(127\.0\.0\.1|localhost|kong)(:\d+)?\/?$/.test(url)
    || !serviceKey || !fakeSecret) return respond(503, "BILLING_ARCHITECTURE_NOT_ENABLED");
  if (Number(request.headers.get("content-length") ?? 0) > 131072) return respond(413, "REQUEST_TOO_LARGE");
  const rawBytes = new Uint8Array(await request.arrayBuffer());
  if (rawBytes.length > 131072) return respond(413, "REQUEST_TOO_LARGE");
  if (!await verifyRawWebhook(rawBytes, request.headers.get("stripe-signature"), fakeSecret,
    Math.floor(Date.now() / 1000))) return respond(400, "WEBHOOK_SIGNATURE_INVALID");
  let event;
  try {
    event = parseTechnicalEvent(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(rawBytes)),
      "LOCAL_FAKE_ACCOUNT");
  } catch {
    return respond(400, "WEBHOOK_EVENT_INVALID");
  }
  const client = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
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
