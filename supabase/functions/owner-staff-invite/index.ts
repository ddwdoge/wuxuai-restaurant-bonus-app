import { createClient } from "npm:@supabase/supabase-js@2.50.3";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const allowedOrigins = new Set([
  "https://bonus.wuxuaisbi.com",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:4192",
]);

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

function safeErrorCode(error: { message?: string; code?: string } | null) {
  const knownCodes = [
    "STAFF_MANAGEMENT_NOT_AUTHORIZED",
    "STAFF_NAME_INVALID",
    "STAFF_EMAIL_INVALID",
    "STAFF_EMAIL_ALREADY_EXISTS",
    "STAFF_MEMBERSHIP_ARCHIVED",
    "STAFF_INVITATION_NOT_FOUND",
    "STAFF_INVITE_RATE_LIMITED",
    "STAFF_ROLE_CONFLICT",
    "STAFF_AUTH_IDENTITY_ROLE_CONFLICT",
  ];
  return knownCodes.find((code) => error?.message?.includes(code)) ?? "STAFF_INVITE_FAILED";
}

async function findAuthUserByEmail(adminClient: ReturnType<typeof createClient>, email: string) {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const match = data.users.find((user) => user.email?.trim().toLowerCase() === email);
    if (match || data.users.length < 1000) return match ?? null;
  }
  throw new Error("AUTH_USER_LOOKUP_LIMIT_REACHED");
}

Deno.serve(async (request) => {
  const origin = request.headers.get("origin");
  if (origin && !allowedOrigins.has(origin)) return json({ error: "ORIGIN_NOT_ALLOWED" }, 403, null);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: responseHeaders(origin) });
  if (request.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405, origin);
  if (!supabaseUrl || !serviceRoleKey || !anonKey) return json({ error: "SERVICE_NOT_CONFIGURED" }, 503, origin);

  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.toLowerCase().startsWith("bearer ")) return json({ error: "NOT_AUTHORIZED" }, 401, origin);

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const token = authorization.slice(7).trim();
  const { data: userData, error: userError } = await adminClient.auth.getUser(token);
  if (userError || !userData.user) return json({ error: "NOT_AUTHORIZED" }, 401, origin);

  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization } },
  });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: "INVALID_REQUEST" }, 400, origin);
  }

  const action = body.action;
  const restaurantId = body.restaurantId;
  if (!isUuid(restaurantId) || (action !== "invite" && action !== "resend")) {
    return json({ error: "INVALID_REQUEST" }, 400, origin);
  }

  try {
    let staffMemberId: string;
    let email: string;
    let authUserId: string | null = null;

    if (action === "invite") {
      const { data, error } = await userClient.rpc("create_restaurant_staff_invitation", {
        input_restaurant_id: restaurantId,
        input_name: body.name,
        input_email: body.email,
      });
      if (error || !data?.success) return json({ error: safeErrorCode(error) }, error?.code === "42501" ? 403 : 400, origin);
      staffMemberId = data.staff_member_id;
      email = data.email;
    } else {
      if (!isUuid(body.staffMemberId)) return json({ error: "INVALID_REQUEST" }, 400, origin);
      staffMemberId = body.staffMemberId as string;
      const { data, error } = await userClient.rpc("get_restaurant_staff_invitation_for_resend", {
        input_restaurant_id: restaurantId,
        input_staff_member_id: staffMemberId,
      });
      if (error || !data?.success) return json({ error: safeErrorCode(error) }, error?.code === "42501" ? 403 : 400, origin);
      email = data.email;
      authUserId = data.auth_user_id ?? null;
    }

    const redirectUrl = new URL("/auth/staff-invite", origin && allowedOrigins.has(origin) ? origin : "https://bonus.wuxuaisbi.com");
    redirectUrl.searchParams.set("staff", staffMemberId);
    const redirectTo = redirectUrl.toString();
    const existingUser = authUserId
      ? (await adminClient.auth.admin.getUserById(authUserId)).data.user
      : await findAuthUserByEmail(adminClient, email);

    let invitedUser = existingUser;
    let binding: { success?: boolean; status?: string } | null = null;
    if (!existingUser) {
      const { data, error } = await adminClient.auth.admin.inviteUserByEmail(email, { redirectTo });
      if (error) return json({ error: "STAFF_INVITE_DELIVERY_FAILED" }, 502, origin);
      invitedUser = data.user;
    } else {
      const { data, error } = await userClient.rpc("bind_restaurant_staff_auth_identity", {
        input_restaurant_id: restaurantId,
        input_staff_member_id: staffMemberId,
        input_auth_user_id: existingUser.id,
      });
      if (error || !data?.success) return json({ error: safeErrorCode(error) }, 400, origin);
      binding = data;
      const mailClient = createClient(supabaseUrl, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { error } = await mailClient.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTo, shouldCreateUser: false },
      });
      if (error) return json({ error: "STAFF_INVITE_DELIVERY_FAILED" }, 502, origin);
    }
    if (!invitedUser) return json({ error: "STAFF_INVITE_FAILED" }, 502, origin);

    if (!binding) {
      const { data, error } = await userClient.rpc("bind_restaurant_staff_auth_identity", {
        input_restaurant_id: restaurantId,
        input_staff_member_id: staffMemberId,
        input_auth_user_id: invitedUser.id,
      });
      if (error || !data?.success) return json({ error: safeErrorCode(error) }, 400, origin);
      binding = data;
    }

    if (action === "resend") {
      const { error } = await userClient.rpc("mark_restaurant_staff_invitation_resent", {
        input_restaurant_id: restaurantId,
        input_staff_member_id: staffMemberId,
      });
      if (error) return json({ error: safeErrorCode(error) }, 400, origin);
    }

    return json({ success: true, status: binding.status }, 200, origin);
  } catch {
    return json({ error: "STAFF_INVITE_FAILED" }, 500, origin);
  }
});
