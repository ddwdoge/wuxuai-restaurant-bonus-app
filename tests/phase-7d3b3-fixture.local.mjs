import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const runtime = "/private/tmp/wuxuai-7d3b-runtime.R81Aj8";
const cli = "/private/tmp/wuxuai-7d2.1uZAeh/repo/node_modules/.bin/supabase";
const status = JSON.parse(execFileSync(cli, ["status", "--output", "json"], {
  cwd: runtime, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
  env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: "1", DO_NOT_TRACK: "1" },
}));
assert.equal(status.API_URL, "http://127.0.0.1:56221");
const sql = (input) => execFileSync("docker", ["exec", "-i", "supabase_db_wuxuai-phase7d3b-isolated",
  "psql", "-U", "postgres", "-d", "postgres", "-X", "-qAt", "-v", "ON_ERROR_STOP=1"],
{ input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
assert.equal(sql("select count(*) from supabase_migrations.schema_migrations"), "171");
const fixtures = sql("select label,owner_id,restaurant_id,branch_id,organization_id from public.d3b3_historical_fixture order by label")
  .split("\n").map((line) => {
    const [label, ownerId, restaurantId, branchId, organizationId] = line.split("|");
    return { label, ownerId, restaurantId, branchId, organizationId };
  });
assert.deepEqual(fixtures.map((item) => item.label), ["A", "B"]);
const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } });
const anon = createClient(status.API_URL, status.ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } });
const authed = (token) => createClient(status.API_URL, status.ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } } });
const birthday = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);

for (const fixture of fixtures) {
  const password = randomUUID() + randomUUID();
  const ownerEmail = sql(`select email from auth.users where id='${fixture.ownerId}'`);
  const updated = await admin.auth.admin.updateUserById(fixture.ownerId, { password });
  assert.equal(updated.error, null, `OWNER_${fixture.label}_PASSWORD_SETUP_FAILED:${updated.error?.code ?? ""}`);
  const ownerLogin = await anon.auth.signInWithPassword({ email: ownerEmail, password });
  assert.equal(ownerLogin.error, null, `OWNER_${fixture.label}_LOGIN_FAILED:${ownerLogin.error?.code ?? ""}`);
  const owner = authed(ownerLogin.data.session.access_token);
  const slug = sql(`select slug from public.restaurants where id='${fixture.restaurantId}'`);
  assert.match(slug, /^d3b3-synthetic-restaurant-/);

  const rewards = [
    { title: `D3B3 ${fixture.label} Points`, required_points: 100, is_starter_reward: false,
      birthday_pool_enabled: false },
    { title: `D3B3 ${fixture.label} Welcome`, required_points: 0, is_starter_reward: true,
      birthday_pool_enabled: false },
    { title: `D3B3 ${fixture.label} Birthday`, required_points: 0, is_starter_reward: true,
      birthday_pool_enabled: true },
  ];
  for (const reward of rewards) {
    const inserted = await owner.from("rewards").insert({
      restaurant_id: fixture.restaurantId, organization_id: fixture.organizationId,
      branch_id: fixture.branchId, description: "Synthetic local only", active: true,
      required_stamps: 0, ...reward,
    }).select("id").single();
    assert.equal(inserted.error, null, `OWNER_${fixture.label}_REWARD_INSERT_FAILED:${inserted.error?.code ?? ""}`);
  }

  const staffEmail = `d3b3-staff-${fixture.label}-${randomUUID()}@example.invalid`;
  const staffCreated = await admin.auth.admin.createUser({ email: staffEmail, password, email_confirm: true });
  assert.equal(staffCreated.error, null, `STAFF_${fixture.label}_AUTH_FAILED`);
  const invitation = await owner.rpc("create_restaurant_staff_invitation", {
    input_restaurant_id: fixture.restaurantId, input_name: `D3B3 Staff ${fixture.label}`,
    input_email: staffEmail,
  });
  assert.equal(invitation.error, null, `STAFF_${fixture.label}_INVITE_FAILED:${invitation.error?.code ?? ""}`);
  const bound = await owner.rpc("bind_restaurant_staff_auth_identity", {
    input_restaurant_id: fixture.restaurantId,
    input_staff_member_id: invitation.data.staff_member_id,
    input_auth_user_id: staffCreated.data.user.id,
  });
  assert.equal(bound.error, null, `STAFF_${fixture.label}_BIND_FAILED:${bound.error?.code ?? ""}`);
  const staffLogin = await anon.auth.signInWithPassword({ email: staffEmail, password });
  assert.equal(staffLogin.error, null, `STAFF_${fixture.label}_LOGIN_FAILED`);
  const staff = authed(staffLogin.data.session.access_token);
  const accepted = await staff.rpc("accept_my_restaurant_staff_invitation", {
    input_staff_member_id: invitation.data.staff_member_id,
  });
  assert.equal(accepted.error, null, `STAFF_${fixture.label}_ACCEPT_FAILED:${accepted.error?.code ?? ""}`);

  const customerEmail = `d3b3-customer-${fixture.label}-${randomUUID()}@example.invalid`;
  const customerCreated = await admin.auth.admin.createUser({
    email: customerEmail, password, email_confirm: true,
    user_metadata: { customer_first_name: `D3B3 Customer ${fixture.label}`,
      customer_phone: fixture.label === "A" ? "+436600001001" : "+436600001002",
      customer_birthday: birthday },
  });
  assert.equal(customerCreated.error, null, `CUSTOMER_${fixture.label}_AUTH_FAILED`);
  const customerLogin = await anon.auth.signInWithPassword({ email: customerEmail, password });
  assert.equal(customerLogin.error, null, `CUSTOMER_${fixture.label}_LOGIN_FAILED`);
  const customer = authed(customerLogin.data.session.access_token);
  const joined = await customer.rpc("join_customer_account_restaurant", {
    input_restaurant_slug: slug, input_terms_accepted: true,
    input_privacy_acknowledged: true, input_device_id: `d3b3-${randomUUID()}`,
    input_existing_customer_token: null,
  });
  assert.equal(joined.error, null, `CUSTOMER_${fixture.label}_JOIN_FAILED:${joined.error?.code ?? ""}`);
  assert.equal(joined.data?.joined, true, `CUSTOMER_${fixture.label}_NOT_JOINED`);
  assert.ok(joined.data?.customer_token, `CUSTOMER_${fixture.label}_TOKEN_MISSING`);
  const giftKinds = sql(`select gift_type,count(*) from public.customer_rewards where restaurant_id='${fixture.restaurantId}' group by gift_type order by gift_type`);
  console.log(`D3B3_${fixture.label}_AUTH_RLS_OWNER_STAFF_CUSTOMER_PASS gift_kinds=${giftKinds.replaceAll("\n", ",")}`);
}
