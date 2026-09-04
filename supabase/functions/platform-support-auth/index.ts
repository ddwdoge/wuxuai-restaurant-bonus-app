import { createClient } from "npm:@supabase/supabase-js@2.50.3";
import { allowedAppOrigins, configuredAppOrigin } from "../_shared/appOrigin.mjs";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const appBaseUrl = configuredAppOrigin(Deno.env.get("APP_BASE_URL"));
const allowedOrigins = allowedAppOrigins(Deno.env.get("APP_BASE_URL"));

function headers(origin: string | null) {
  const value = new Headers({ "content-type": "application/json; charset=utf-8", vary: "Origin" });
  if (origin && allowedOrigins.has(origin)) value.set("access-control-allow-origin", origin);
  value.set("access-control-allow-headers", "authorization, apikey, content-type, x-client-info");
  value.set("access-control-allow-methods", "POST, OPTIONS");
  return value;
}

function reply(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), { status, headers: headers(origin) });
}

function uuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

Deno.serve(async (request) => {
  const origin = request.headers.get("origin");
  if (origin && !allowedOrigins.has(origin)) return reply({ error: "ORIGIN_NOT_ALLOWED" }, 403, null);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: headers(origin) });
  if (request.method !== "POST") return reply({ error: "METHOD_NOT_ALLOWED" }, 405, origin);
  if (!supabaseUrl || !anonKey || !appBaseUrl) return reply({ error: "SERVICE_NOT_CONFIGURED" }, 503, origin);

  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.toLowerCase().startsWith("bearer ")) return reply({ error: "NOT_AUTHORIZED" }, 401, origin);
  const client = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization } },
  });
  const { data: authData } = await client.auth.getUser(authorization.slice(7));
  if (!authData.user) return reply({ error: "NOT_AUTHORIZED" }, 401, origin);

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return reply({ error: "INVALID_REQUEST" }, 400, origin); }
  const action = body.action;
  if (!uuid(body.restaurantId) || !uuid(body.entityId) || !uuid(body.idempotencyKey)
    || !["owner_confirmation_resend", "owner_password_recovery", "staff_invitation_resend"].includes(String(action))
    || typeof body.reason !== "string" || body.reason.trim().length < 10) {
    return reply({ error: "INVALID_REQUEST" }, 400, origin);
  }

  const { data: target, error: targetError } = await client.rpc("get_platform_auth_support_target", {
    input_restaurant_id: body.restaurantId,
    input_action: action,
    input_entity_id: body.entityId,
  });
  if (targetError || typeof target?.email !== "string") return reply({ error: "NOT_AUTHORIZED" }, 403, origin);

  const redirectPath = action === "owner_password_recovery" ? "/auth/update-password" : action === "staff_invitation_resend" ? "/auth/staff-invite" : "/auth/callback";
  const redirectUrl = new URL(redirectPath, appBaseUrl);
  if (action === "staff_invitation_resend") redirectUrl.searchParams.set("staff", String(body.entityId));
  const redirectTo = redirectUrl.toString();
  const mailClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: deliveryError } = action === "owner_password_recovery"
    ? await mailClient.auth.resetPasswordForEmail(target.email, { redirectTo })
    : action === "staff_invitation_resend"
      ? await mailClient.auth.signInWithOtp({ email: target.email, options: { emailRedirectTo: redirectTo, shouldCreateUser: false } })
      : await mailClient.auth.resend({ type: "signup", email: target.email, options: { emailRedirectTo: redirectTo } });
  if (deliveryError) return reply({ error: "DELIVERY_FAILED" }, 502, origin);

  const { error: auditError } = await client.rpc("record_platform_auth_support_operation", {
    input_restaurant_id: body.restaurantId,
    input_action: action,
    input_entity_id: body.entityId,
    input_reason: body.reason,
    input_support_reference: body.supportReference ?? null,
    input_idempotency_key: body.idempotencyKey,
  });
  if (auditError) return reply({ error: "AUDIT_FAILED" }, 500, origin);
  return reply({ success: true }, 200, origin);
});
