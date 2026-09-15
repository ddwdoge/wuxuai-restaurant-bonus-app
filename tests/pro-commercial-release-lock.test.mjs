import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260915001000_pro_commercial_release_lock.sql", import.meta.url),
  "utf8",
);
const packageMigration = readFileSync(
  new URL("../supabase/migrations/20260905004000_pro_package_entitlements.sql", import.meta.url),
  "utf8",
);
const activation = migration.slice(
  migration.indexOf("create or replace function public.set_platform_restaurant_plan_override"),
  migration.indexOf("notify pgrst"),
);
const resolver = migration.slice(
  migration.indexOf("create or replace function public.resolve_restaurant_entitlements_internal"),
  migration.indexOf("create or replace function public.guard_pro_subscription_elevation"),
);

test("AT PRO starts in a private fail-closed release policy", () => {
  assert.match(migration, /create table if not exists public\.commercial_plan_release_policy/);
  assert.match(migration, /values \('AT', 'PRO', 'LOCKED', 1, null, null\)/);
  assert.match(migration, /primary key \(country_code, plan_key\)/);
  assert.match(migration, /release_state = 'RELEASED'[\s\S]*founder_decision_ref[\s\S]*released_at/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all on table public\.commercial_plan_release_policy[\s\S]*service_role/);
  assert.match(migration, /set_platform_commercial_pro_country_release/);
});

test("release authority is bound to stored tenant country, never URL or locale", () => {
  assert.match(migration, /branch\.id = restaurant\.primary_branch_id/);
  assert.match(migration, /branch\.restaurant_id = restaurant\.id/);
  assert.match(migration, /branch\.organization_id = restaurant\.organization_id/);
  assert.match(migration, /upper\(trim\(branch\.country\)\)/);
  assert.doesNotMatch(resolver, /input_(?:country|locale|url)|window\.|location\.|navigator\./i);
});

test("missing invalid or unreadable policy always resolves locked", () => {
  assert.match(migration, /reason_value text := 'PRO_COMMERCIAL_POLICY_MISSING'/);
  assert.match(migration, /'PRO_COMMERCIAL_COUNTRY_UNRESOLVED'/);
  assert.match(migration, /exception when others then[\s\S]*'release_state', 'LOCKED'[\s\S]*'released', false/);
  assert.match(migration, /coalesce\(\s*\(commercial_release_value->>'released'\)::boolean, false/);
});

test("commercial lock clamps plan unlimited and both notification entitlements", () => {
  assert.match(resolver, /'contract_version', 'restaurant_entitlements_v5'/);
  assert.match(resolver, /source_value := 'COMMERCIAL_RELEASE_LOCK'/);
  assert.match(resolver, /resolved_plan_key := 'BASIC'/);
  assert.match(resolver, /effective_offer_limit := least/);
  assert.match(resolver, /effective_offer_unlimited := false/);
  assert.match(resolver, /effective_offer_notifications := false/);
  assert.match(resolver, /effective_reward_notifications := false/);
  assert.match(resolver, /'stored_plan_key', subscription_record\.plan_key/);
  assert.match(resolver, /'override'[\s\S]*override_record\.plan_override_key/);
});

test("subscription and feature elevation have independent database guards", () => {
  assert.match(migration, /branch_subscriptions_commercial_release_guard/);
  assert.match(migration, /before insert or update of plan_key on public\.branch_subscriptions/);
  assert.match(migration, /branch_entitlement_overrides_commercial_release_guard/);
  assert.match(migration, /new\.offer_limit_unlimited is true/);
  assert.match(migration, /new\.offer_notifications is true/);
  assert.match(migration, /new\.reward_notifications is true/);
  assert.match(migration, /raise exception 'PRO_COMMERCIAL_RELEASE_LOCKED' using errcode = '42501'/);
});

test("Platform Admin activation checks the release lock before idempotent replay or writes", () => {
  const releaseCheck = activation.indexOf("PRO_COMMERCIAL_RELEASE_LOCKED");
  const replay = activation.indexOf("if operation_record.id is not null");
  const write = activation.indexOf("insert into public.branch_entitlement_overrides");
  assert.ok(releaseCheck > 0 && releaseCheck < replay && replay < write);
  assert.match(activation, /role_value not in \('platform_owner', 'platform_admin', 'billing_admin'\)/);
  assert.match(activation, /resolve_commercial_plan_release_internal/);
  assert.doesNotMatch(migration, /grant execute on function public\.resolve_commercial_plan_release_internal/);
});

test("existing PRO data is not rewritten or deleted by the additive migration", () => {
  assert.doesNotMatch(migration, /update public\.branch_subscriptions|delete from public\.branch_subscriptions/i);
  assert.doesNotMatch(migration, /update public\.branch_entitlement_overrides|delete from public\.branch_entitlement_overrides/i);
  assert.doesNotMatch(migration, /truncate|drop table/i);
});

test("Basic core flows Catalog Stripe and usage limits remain outside the change", () => {
  for (const forbidden of [
    "points_transactions",
    "collect_bonus_points",
    "award_points_v1",
    "customer_rewards",
    "reward_redemptions",
    "customer_limit",
    "3000",
    "stripe_checkout",
    "checkout_session",
    "catalog_item",
  ]) {
    assert.doesNotMatch(migration, new RegExp(forbidden, "i"));
  }
});

test("notification Edge and database paths remain bound to the clamped resolver", () => {
  assert.match(packageMigration, /restaurant_entitlement_enabled\(input_restaurant_id, 'offer_notifications'\)/);
  assert.match(packageMigration, /restaurant_entitlement_enabled\(new\.restaurant_id, 'reward_notifications'\)/);
  assert.match(packageMigration, /resolve_restaurant_entitlements_internal\(input_restaurant_id\)/);
});

test("country release mutator is recent-authenticated role checked and country isolated", () => {
  assert.match(migration, /require_recent_platform_auth_internal/);
  assert.match(migration, /claims_value->>'auth_time'/);
  assert.match(migration, /interval '10 minutes'/);
  assert.match(migration, /actor_role_value in \('platform_owner', 'platform_admin'\)/);
  assert.match(migration, /'PRO ' \|\| code_value[\s\S]*' FREIGEBEN'/);
  assert.match(migration, /pg_advisory_xact_lock[\s\S]*commercial-pro-country/);
  assert.match(migration, /where country_code = code_value and plan_key = 'PRO'/);
  assert.match(migration, /revoke execute on function public\.set_platform_commercial_pro_country_release[\s\S]*public, anon/);
  assert.match(migration, /grant execute on function public\.set_platform_commercial_pro_country_release[\s\S]*authenticated/);
});

test("real pilot and TEST_ONLY grants are time bounded revoked and audited", () => {
  assert.match(migration, /commercial_pro_access_grants/);
  assert.match(migration, /REAL_BUSINESS_PILOT/);
  assert.match(migration, /INTERNAL_TEST_ONLY/);
  assert.match(migration, /expires_at > starts_at/);
  assert.match(migration, /revoked_at is null/);
  assert.match(migration, /TEST_ONLY_MARKER_REQUIRED/);
  assert.match(migration, /REAL_BUSINESS_PILOT_COUNTRY_LOCKED/);
  assert.match(migration, /PRO_ACCESS_GRANTED/);
  assert.match(migration, /PRO_ACCESS_EXTENDED/);
  assert.match(migration, /PRO_ACCESS_REVOKED/);
  assert.doesNotMatch(migration, /auto.{0,20}(bill|charge|renew)|stripe.{0,20}(write|update|insert)/i);
});

test("effective PRO formula requires country plus commercial entitlement or TEST_ONLY", () => {
  assert.match(resolver, /effective_pro_valid := internal_test_only_valid[\s\S]*commercial_pro_released[\s\S]*subscription_pro_valid or real_business_pilot_valid/);
  assert.match(resolver, /subscription_pro_valid := upper\(coalesce\(subscription_record\.plan_key/);
  assert.match(resolver, /access_kind = 'REAL_BUSINESS_PILOT'/);
  assert.match(resolver, /access_kind = 'INTERNAL_TEST_ONLY'/);
  assert.match(resolver, /marker\.organization_id = restaurant_record\.organization_id/);
  assert.doesNotMatch(resolver, /resolved_plan_key := override_record\.plan_override_key/);
});

test("commercial audit is append-only and browser tables have no DML", () => {
  assert.match(migration, /create table if not exists public\.commercial_pro_access_audit/);
  assert.match(migration, /before update or delete on public\.commercial_pro_access_audit/);
  assert.match(migration, /COMMERCIAL_PRO_AUDIT_IMMUTABLE/);
  assert.match(migration, /revoke all on table public\.commercial_pro_access_grants[\s\S]*public, anon, authenticated, service_role/);
  assert.match(migration, /revoke all on table public\.commercial_pro_access_audit[\s\S]*public, anon, authenticated, service_role/);
});
