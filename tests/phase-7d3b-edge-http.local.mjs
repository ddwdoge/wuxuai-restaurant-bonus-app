import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

// Local, task-owned fixture only. CLI keys and JWTs remain in this process.
const runtime = "/private/tmp/wuxuai-7d3b-runtime.R81Aj8";
const cli = "/private/tmp/wuxuai-7d2.1uZAeh/repo/node_modules/.bin/supabase";
const status = JSON.parse(execFileSync(cli, ["status", "--output", "json"], {
  cwd: runtime, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
  env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: "1", DO_NOT_TRACK: "1" },
}));
assert.equal(status.API_URL, "http://127.0.0.1:56221");
const fields = execFileSync("docker", ["exec", "-i", "supabase_db_wuxuai-phase7d3b-isolated",
  "psql", "-U", "postgres", "-d", "postgres", "-X", "-qAt", "-v", "ON_ERROR_STOP=1",
  "-c", `select
    (select user_id from public.restaurant_members where restaurant_id=f.restaurant_id and role='owner' limit 1),
    (select auth_user_id from public.staff_members where restaurant_id=f.restaurant_id and active limit 1),
    (select auth_user_id from public.customers where id=f.customer_id),
    f.restaurant_id,f.extra_reward_1 from public.d3b_parallel_fixture f`],
{ encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim().split("|");
const [ownerId, staffId, customerId, restaurantId, rewardId] = fields;
for (const field of fields) assert.match(field, /^[0-9a-f-]{36}$/);
const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } });
const publicClient = createClient(status.API_URL, status.ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } });
const password = randomUUID() + randomUUID();
const created = [];
for (const role of ["owner", "staff", "customer"]) {
  const email = `d3b-${role}-${randomUUID()}@example.invalid`;
  const result = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(result.error, null, "LOCAL_AUTH_FIXTURE_FAILED");
  assert.ok(result.data.user?.id);
  created.push({ id: result.data.user.id, email });
}
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
execFileSync("docker", ["exec", "-i", "supabase_db_wuxuai-phase7d3b-isolated",
  "psql", "-U", "postgres", "-d", "postgres", "-X", "-q", "-v", "ON_ERROR_STOP=1"],
{ input: `begin; set local session_replication_role=replica;
  update public.organizations set owner_id=${quote(created[0].id)} where owner_id=${quote(ownerId)};
  update public.restaurants set owner_id=${quote(created[0].id)} where id=${quote(restaurantId)};
  update public.restaurant_members set user_id=${quote(created[0].id)} where restaurant_id=${quote(restaurantId)} and user_id=${quote(ownerId)};
  update public.restaurant_members set user_id=${quote(created[1].id)} where restaurant_id=${quote(restaurantId)} and user_id=${quote(staffId)};
  update public.staff_members set auth_user_id=${quote(created[1].id)} where restaurant_id=${quote(restaurantId)} and auth_user_id=${quote(staffId)};
  update public.customers set auth_user_id=${quote(created[2].id)} where restaurant_id=${quote(restaurantId)} and auth_user_id=${quote(customerId)};
  update public.customer_accounts set auth_user_id=${quote(created[2].id)}, email=${quote(created[2].email)} where auth_user_id=${quote(customerId)};
  commit;`, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
const signIn = async (userId) => {
  const result = await publicClient.auth.signInWithPassword({ email: userId.email, password });
  assert.equal(result.error, null, "LOCAL_AUTH_SESSION_FAILED");
  assert.ok(result.data.session?.access_token);
  return result.data.session.access_token;
};
const customerToken = await signIn(created[2]);
const staffToken = await signIn(created[1]);
const origin = "http://127.0.0.1:4180";
const url = `${status.API_URL}/functions/v1/redemption-confirmation`;
const post = async (body, token, requestOrigin = origin, extraHeaders = {}) => {
  const response = await fetch(url, { method: "POST", headers: {
    ...(requestOrigin === null ? {} : { origin: requestOrigin }), apikey: status.ANON_KEY,
    "content-type": "application/json",
    ...(token ? { authorization: `Bearer ${token}` } : {}),
    ...extraHeaders,
  }, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json(),
    allowOrigin: response.headers.get("access-control-allow-origin") };
};
const payload = (action, extra) => ({ action, request_id: randomUUID(), correlation_id: randomUUID(),
  idempotency_key: randomUUID(), ...extra });
const slug = `d3b-${restaurantId.slice(0, 12)}`;
const startBody = payload("start", { restaurant_slug: slug, source_type: "points", entitlement_id: rewardId });
const dbSnapshot = () => execFileSync("docker", ["exec", "-i", "supabase_db_wuxuai-phase7d3b-isolated",
  "psql", "-U", "postgres", "-d", "postgres", "-X", "-qAt", "-v", "ON_ERROR_STOP=1",
  "-c", `select jsonb_build_object(
    'requests',(select count(*) from public.secure_redemption_requests),
    'attempts',(select count(*) from public.secure_redemption_pin_attempts),
    'events',(select count(*) from public.reward_redemption_events),
    'points',(select coalesce(sum(points_balance),0) from public.customers))::text`],
{ encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
const beforeCors = dbSnapshot();
for (const requestOrigin of [origin, "https://evil.test", undefined, "null"]) {
  const response = await fetch(url, { method: "OPTIONS", headers: {
    ...(requestOrigin === undefined ? {} : { origin: requestOrigin }),
    "access-control-request-method": "POST",
    "access-control-request-headers": "authorization, apikey, content-type",
    "x-forwarded-for": "198.51.100.42", forwarded: "for=198.51.100.42",
  } });
  assert.equal(response.status, requestOrigin === undefined ? 403 : 200,
    "LOCAL_KONG_PREFLIGHT_BEHAVIOR_CHANGED");
  assert.equal(response.headers.get("access-control-allow-origin"), "*",
    "LOCAL_KONG_PERMISSIVE_CORS_NOT_OBSERVED");
  const body = await response.text();
  assert.ok(body === "" || body === '{"code":"REDEMPTION_CORS_BLOCKED"}',
    "OPTIONS_EXPOSED_DATA");
}
assert.equal((await post(startBody, customerToken, "https://evil.test")).status, 403);
assert.equal((await post(startBody, customerToken, null)).status, 403);
assert.equal((await post(startBody, customerToken, "null")).status, 403);
const forgedHeaders = { "x-forwarded-for": "198.51.100.42", forwarded: "for=198.51.100.42",
  "client-ip": "198.51.100.42" };
const invalid = await Promise.all(Array.from({ length: 24 }, () =>
  post(startBody, customerToken, "https://evil.test", forgedHeaders)));
assert.ok(invalid.every((item) => item.status === 403 && item.body.code === "REDEMPTION_ORIGIN_BLOCKED"),
  "PARALLEL_INVALID_ORIGIN_NOT_FAIL_CLOSED");
assert.equal(dbSnapshot(), beforeCors, "CORS_REJECTION_OR_OPTIONS_WROTE_DATA");
console.log("D3B_GATEWAY_PERMISSIVE_APPLICATION_GUARD_24_PARALLEL_ZERO_WRITES_PASS");
if (process.env.D3B_CORS_ONLY === "1") process.exit(0);
assert.equal((await post(startBody, undefined)).status, 401, "ANONYMOUS_NOT_BLOCKED");
assert.equal((await post(startBody, customerToken, "https://evil.test")).status, 403, "ORIGIN_NOT_BLOCKED");
assert.equal((await post({ ...startBody, actor_user_id: created[0].id }, customerToken)).status, 400,
  "FORGED_ACTOR_NOT_BLOCKED");
const staffStart = await post(startBody, staffToken);
assert.equal(staffStart.status, 409, "STAFF_START_NOT_BLOCKED");
assert.equal(staffStart.body.code, "REDEMPTION_REQUEST_BLOCKED");
const started = await post(startBody, customerToken);
assert.equal(started.status, 200, `CUSTOMER_START_FAILED:${started.body.error_code ?? started.body.code}`);
assert.ok([origin, "*"].includes(started.allowOrigin), "CORS_HEADER_UNEXPECTED");
assert.equal(started.body.status, "REQUESTED");
const replay = await post(startBody, customerToken);
assert.equal(replay.status, 200, "START_REPLAY_FAILED");
assert.equal(replay.body.redemption_id, started.body.redemption_id);
assert.equal(replay.body.already_started, true);
const approved = await post(payload("approve", { redemption_id: started.body.redemption_id,
  correlation_id: started.body.correlation_id }), staffToken);
assert.equal(approved.status, 200, `STAFF_APPROVAL_FAILED:${approved.body.error_code ?? approved.body.code}`);
assert.equal(approved.body.status, "REDEEMED");
const count = execFileSync("docker", ["exec", "-i", "supabase_db_wuxuai-phase7d3b-isolated",
  "psql", "-U", "postgres", "-d", "postgres", "-X", "-qAt", "-v", "ON_ERROR_STOP=1",
  "-c", `select count(*) from public.reward_redemption_events where restaurant_id='${restaurantId}' and reward_id='${rewardId}'`],
{ encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
assert.equal(count, "1", "EDGE_NOT_EXACTLY_ONCE");
console.log("D3B_LOCAL_EDGE_HTTP_AUTH_CORS_REPLAY_STAFF_FINALIZATION_PASS");
if (started.allowOrigin === "*") console.log("D3B_LOCAL_KONG_CORS_WILDCARD_OBSERVED_RESTGATE_OPEN");
