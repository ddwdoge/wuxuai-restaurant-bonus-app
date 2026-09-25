import { createClient } from "npm:@supabase/supabase-js@2.50.3";
import {
  allowedRedemptionOrigin,
  allowedRedemptionPreflight,
  parseRedemptionMutation,
} from "../_shared/redemptionEdgeContract.mjs";

const response = (status: number, code: string, origin?: string, data?: unknown) =>
  new Response(JSON.stringify(data ?? { code }), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...(origin ? { "access-control-allow-origin": origin, vary: "Origin" } : {}),
    },
  });

Deno.serve(async (request) => {
  const mode = Deno.env.get("REDEMPTION_EDGE_MODE") ?? "";
  const projectRef = Deno.env.get("REDEMPTION_STAGING_PROJECT_REF") ?? "";
  const localOrigin = Deno.env.get("REDEMPTION_LOCAL_ALLOWED_ORIGIN") ?? "";
  const requestedOrigin = request.headers.get("origin");
  const origin = allowedRedemptionOrigin(requestedOrigin, mode, localOrigin, projectRef) ?? undefined;
  if (request.method === "OPTIONS") {
    if (!origin || !allowedRedemptionPreflight(
      request.headers.get("access-control-request-method"),
      request.headers.get("access-control-request-headers") ?? "",
    )) return response(403, "REDEMPTION_CORS_BLOCKED");
    return new Response(null, { status: 204, headers: {
      "access-control-allow-origin": origin,
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
      vary: "Origin", "cache-control": "no-store",
    } });
  }
  if (request.method !== "POST") return response(405, "METHOD_NOT_ALLOWED");
  if (!origin) return response(403, "REDEMPTION_ORIGIN_BLOCKED");

  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const local = mode === "local_only" && /^http:\/\/(127\.0\.0\.1|localhost|kong)(:\d+)?\/?$/.test(url);
  const staging = mode === "staging" && projectRef === "bwhvfjuwixgwduoeqaya"
    && url === "https://bwhvfjuwixgwduoeqaya.supabase.co";
  if ((!local && !staging) || !anonKey || !serviceKey) return response(503, "REDEMPTION_EDGE_NOT_CONFIGURED", origin);

  const authorization = request.headers.get("authorization") ?? "";
  if (!/^Bearer [A-Za-z0-9._-]+$/.test(authorization)) return response(401, "AUTH_REQUIRED", origin);
  const token = authorization.slice(7);
  const authClient = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: identity, error: authError } = await authClient.auth.getUser(token);
  if (authError || !identity.user?.id || identity.user.is_anonymous === true) {
    return response(401, "AUTH_REQUIRED", origin);
  }

  let payload;
  try {
    if (Number(request.headers.get("content-length") ?? 0) > 2048) return response(413, "REQUEST_TOO_LARGE", origin);
    const raw = await request.text();
    if (raw.length > 2048) return response(413, "REQUEST_TOO_LARGE", origin);
    payload = parseRedemptionMutation(JSON.parse(raw));
  } catch {
    return response(400, "REDEMPTION_REQUEST_INVALID", origin);
  }

  // Never forward an IP header. The SQL contract uses only this verified UID
  // plus authoritative tenant/account membership and server-side counters.
  const backend = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await backend.rpc("secure_redemption_edge_mutate", {
    input_actor_user_id: identity.user.id,
    input_payload: payload,
  });
  if (error) return response(409, "REDEMPTION_REQUEST_BLOCKED", origin);
  const result = data as { success?: boolean; error_code?: string } | null;
  return response(result?.success ? 200 : 409,
    result?.success ? "OK" : result?.error_code ?? "REDEMPTION_REQUEST_BLOCKED", origin, result);
});
