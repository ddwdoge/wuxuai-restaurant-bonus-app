import { createClient } from "npm:@supabase/supabase-js@2.50.3";
import { allowedAppOrigins, configuredAppOrigin } from "../_shared/appOrigin.mjs";

// This endpoint only records a pending, document-bound confirmation request.
// It has no mail transport, capture URL, or provider fallback. Hosted link
// delivery is a separate release gate.
const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const configuredOrigin = configuredAppOrigin(Deno.env.get("APP_BASE_URL"));
const local = (() => {
  try {
    const url = new URL(supabaseUrl);
    return url.protocol === "http:" && ["127.0.0.1", "localhost", "kong"].includes(url.hostname);
  }
  catch { return false; }
})();
const origins = local ? allowedAppOrigins(Deno.env.get("APP_BASE_URL"))
  : new Set(configuredOrigin ? [configuredOrigin] : []);
const uuid = (value: unknown): value is string => typeof value === "string"
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const hash = (value: unknown): value is string => typeof value === "string"
  && /^[0-9a-f]{64}$/.test(value);
const token = () => Array.from(crypto.getRandomValues(new Uint8Array(32)),
  (part) => part.toString(16).padStart(2, "0")).join("");

function reply(body: unknown, status: number, origin: string) {
  return new Response(JSON.stringify(body), { status, headers: {
    "content-type": "application/json; charset=utf-8", "cache-control": "no-store",
    ...(origins.has(origin) ? {
      "access-control-allow-origin": origin,
      "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
      "access-control-allow-methods": "POST, OPTIONS", "vary": "Origin",
    } : {}),
  } });
}

Deno.serve(async (request) => {
  const origin = request.headers.get("origin") ?? "";
  if (!origin || !origins.has(origin)) return reply({ code: "REQUEST_UNAVAILABLE" }, 403, origin);
  if (request.method === "OPTIONS") return reply({}, 204, origin);
  if (request.method !== "POST") return reply({ code: "METHOD_NOT_ALLOWED" }, 405, origin);
  if (!supabaseUrl || !anonKey || !serviceKey) return reply({ code: "REQUEST_UNAVAILABLE" }, 503, origin);
  const bearer = request.headers.get("authorization")?.match(/^Bearer (\S+)$/i)?.[1];
  if (!bearer) return reply({ code: "CUSTOMER_AUTH_REQUIRED" }, 401, origin);
  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return reply({ code: "INVALID_REQUEST" }, 400, origin); }
  if (!uuid(body.restaurant_id) || !uuid(body.request_id) || !uuid(body.document_id)
    || !hash(body.document_sha256) || typeof body.document_version !== "string"
    || !/^[A-Za-z0-9_.-]{3,80}$/.test(body.document_version)
    || !["WEEKLY", "MONTHLY"].includes(String(body.frequency))
    || body.explicit_choice !== true) return reply({ code: "INVALID_REQUEST" }, 400, origin);

  const authClient = createClient(supabaseUrl, anonKey,
    { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: identity, error: identityError } = await authClient.auth.getUser(bearer);
  if (identityError || !identity.user?.id || !identity.user.email_confirmed_at) {
    return reply({ code: "CUSTOMER_AUTH_REQUIRED" }, 401, origin);
  }
  let sessionId: unknown;
  try {
    const encoded = bearer.split(".")[1];
    const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    sessionId = JSON.parse(atob(base64 + "=".repeat((4 - base64.length % 4) % 4))).session_id;
  } catch { return reply({ code: "CUSTOMER_AUTH_REQUIRED" }, 401, origin); }
  if (!uuid(sessionId)) return reply({ code: "CUSTOMER_AUTH_REQUIRED" }, 401, origin);

  // The browser cannot choose an address, token, account, or session owner.
  // The service-only RPC verifies the Auth session and all business bindings.
  const service = createClient(supabaseUrl, serviceKey,
    { auth: { persistSession: false, autoRefreshToken: false } });
  const confirmation = token();
  await service.rpc("request_authenticated_customer_offer_email_confirmation", {
    input_auth_user_id: identity.user.id,
    input_auth_session_id: sessionId,
    input_restaurant_id: body.restaurant_id,
    input_frequency: body.frequency,
    input_confirmation_token: confirmation,
    input_request_id: body.request_id,
    input_expected_document_id: body.document_id,
    input_expected_version: body.document_version,
    input_expected_sha256: body.document_sha256,
  });
  // Ineligible tenants, rate limits, unavailable documents and successful
  // pending writes have the same non-enumerating customer response. No raw
  // confirmation value, link, address, or document internals leave the Edge.
  return reply({ accepted: true }, 202, origin);
});
