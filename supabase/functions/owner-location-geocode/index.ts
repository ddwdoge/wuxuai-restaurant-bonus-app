import { createClient } from "npm:@supabase/supabase-js@2.50.3";
import {
  buildNominatimSearchUrl,
  hashOwnerAddress,
  normalizeNominatimResults,
  normalizeOwnerAddress,
} from "../_shared/ownerGeocoding.mjs";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const allowedOrigins = new Set([
  "https://bonus.wuxuaisbi.com",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:4192",
]);
const cacheLifetimeHours = 24;

function responseHeaders(origin: string | null) {
  const headers = new Headers({
    "content-type": "application/json; charset=utf-8",
    "vary": "Origin",
  });
  if (origin && allowedOrigins.has(origin)) headers.set("access-control-allow-origin", origin);
  headers.set("access-control-allow-headers", "authorization, apikey, content-type, x-client-info");
  headers.set("access-control-allow-methods", "POST, OPTIONS");
  return headers;
}

function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), { status, headers: responseHeaders(origin) });
}

function isUuid(value: unknown) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

Deno.serve(async (request) => {
  const origin = request.headers.get("origin");
  if (origin && !allowedOrigins.has(origin)) return json({ error: "ORIGIN_NOT_ALLOWED" }, 403, null);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: responseHeaders(origin) });
  if (request.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405, origin);
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "SERVICE_NOT_CONFIGURED" }, 503, origin);

  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.toLowerCase().startsWith("bearer ")) return json({ error: "NOT_AUTHORIZED" }, 401, origin);

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const token = authorization.slice(7).trim();
  const { data: userData, error: userError } = await adminClient.auth.getUser(token);
  if (userError || !userData.user) return json({ error: "NOT_AUTHORIZED" }, 401, origin);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: "INVALID_REQUEST" }, 400, origin);
  }

  const restaurantId = body.restaurantId;
  if (!isUuid(restaurantId)) return json({ error: "INVALID_REQUEST" }, 400, origin);

  const { data: membership, error: membershipError } = await adminClient
    .from("restaurant_members")
    .select("id")
    .eq("restaurant_id", restaurantId)
    .eq("user_id", userData.user.id)
    .in("role", ["owner", "admin"])
    .maybeSingle();
  if (membershipError || !membership) return json({ error: "NOT_AUTHORIZED" }, 403, origin);

  let address;
  try {
    address = normalizeOwnerAddress(body);
  } catch {
    return json({ error: "ADDRESS_INCOMPLETE" }, 400, origin);
  }

  const addressHash = await hashOwnerAddress(address);
  const { data: cached } = await adminClient
    .from("owner_geocoding_cache")
    .select("results")
    .eq("address_hash", addressHash)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (cached?.results) return json({ candidates: cached.results, cached: true }, 200, origin);

  const { data: slotAvailable, error: slotError } = await adminClient.rpc("claim_owner_geocoding_provider_slot");
  if (slotError) return json({ error: "GEOCODING_UNAVAILABLE" }, 503, origin);
  if (!slotAvailable) return json({ error: "RATE_LIMITED" }, 429, origin);

  try {
    const providerResponse = await fetch(buildNominatimSearchUrl(address), {
      headers: {
        "accept": "application/json",
        "user-agent": "WUXUAI-Bonus/1.0 (+https://bonus.wuxuaisbi.com)",
      },
      signal: AbortSignal.timeout(8_000),
    });
    if (!providerResponse.ok) return json({ error: "GEOCODING_UNAVAILABLE" }, 502, origin);
    const candidates = normalizeNominatimResults(await providerResponse.json(), address);
    await adminClient.from("owner_geocoding_cache").upsert({
      address_hash: addressHash,
      results: candidates,
      expires_at: new Date(Date.now() + cacheLifetimeHours * 60 * 60 * 1_000).toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "address_hash" });
    return json({ candidates, cached: false }, 200, origin);
  } catch {
    return json({ error: "GEOCODING_UNAVAILABLE" }, 502, origin);
  }
});
