import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL(
  "../supabase/migrations/20260921003000_customer_capacity_enforcement.sql",
  import.meta.url,
), "utf8");

test("customer capacity uses one canonical half-open active identity set", () => {
  assert.match(migration, /list_restaurant_active_customer_capacity_keys_internal/);
  assert.match(migration, /input_at - interval '365 days'/);
  assert.match(migration, /points\.created_at >= input_at - interval '365 days'/);
  assert.match(migration, /points\.created_at < input_at/);
  assert.match(migration, /journal\.redeemed_at >= input_at - interval '365 days'/);
  assert.match(migration, /journal\.redeemed_at < input_at/);
  assert.match(migration, /coalesce\(membership\.account_id::text, qualifying\.customer_id::text\)/);
});

test("only confirmed non-test points earns and completed non-cancelled redemptions qualify", () => {
  assert.match(migration, /points\.type = 'earn'/);
  assert.match(migration, /points\.points > 0/);
  assert.match(migration, /points\.reversal_of is null/);
  assert.match(migration, /collection_source in \('restaurant_controlled', 'customer_initiated'\)/);
  assert.match(migration, /not exists[\s\S]*reversal\.reversal_of = points\.id/);
  assert.match(migration, /journal\.status = 'ACTIVE'/);
  assert.match(migration, /journal\.cancelled_at is null/);
  assert.match(migration, /journal\.is_test_event = false/);
  assert.match(migration, /customer\.is_test_customer = false/g);
});

test("the central resolver consumes the shared customer identity set", () => {
  const resolver = migration.match(/create or replace function public\.resolve_restaurant_capacity_internal[\s\S]*?revoke execute/)?.[0] ?? "";
  assert.match(resolver, /list_restaurant_active_customer_capacity_keys_internal/);
  assert.match(resolver, /base_customer_limit \+ customer_addon_units \* 5000::bigint/);
  assert.match(resolver, /greatest\(customer_limit_value - customer_usage_value, 0\)/);
  assert.doesNotMatch(resolver, /membership_status/);
});

test("both authoritative activity ledgers enforce the first new active identity", () => {
  assert.match(migration, /create trigger enforce_customer_capacity_points_activity[\s\S]*after insert or update[\s\S]*on public\.points_transactions/);
  assert.match(migration, /create trigger enforce_customer_capacity_redemption_activity[\s\S]*after insert or update[\s\S]*on public\.redemption_activity_journal/);
  assert.match(migration, /pg_advisory_xact_lock\(hashtextextended\([\s\S]*'customer-capacity:' \|\| customer_record\.restaurant_id::text/);
  assert.match(migration, /capacity_snapshot := public\.resolve_restaurant_capacity_internal/);
  assert.match(migration, /if capacity_usage > capacity_limit then/);
  assert.match(migration, /message = 'CUSTOMER_CAPACITY_REACHED'/);
  assert.match(migration, /old\.created_at >= at_value - interval '365 days'[\s\S]*old\.created_at < at_value/);
  assert.match(migration, /old\.redeemed_at >= at_value - interval '365 days'[\s\S]*old\.redeemed_at < at_value/);
});

test("existing active customers remain allowed and block details contain no identity", () => {
  assert.match(migration, /if was_active_before then[\s\S]*return new/);
  const detail = migration.match(/detail = jsonb_build_object\([\s\S]*?\)::text/)?.[0] ?? "";
  assert.match(detail, /'metric', 'ACTIVE_CUSTOMERS'/);
  assert.match(detail, /'activity_kind'/);
  assert.match(detail, /'effective_limit'/);
  assert.doesNotMatch(detail, /customer_id|identity_key|email|phone|token/i);
});

test("registration membership and existing business data are not mutated", () => {
  assert.doesNotMatch(migration, /create trigger[\s\S]*on public\.customers/);
  assert.doesNotMatch(migration, /create trigger[\s\S]*on public\.customer_account_memberships/);
  assert.doesNotMatch(migration, /delete from public\./i);
  assert.doesNotMatch(migration, /update public\.(customers|customer_account_memberships|points_transactions|redemption_activity_journal)/i);
  assert.doesNotMatch(migration, /insert into public\.(customers|customer_account_memberships|points_transactions|redemption_activity_journal)/i);
});

test("internal helpers and trigger functions are not browser-callable", () => {
  assert.match(migration, /revoke execute on function public\.list_restaurant_active_customer_capacity_keys_internal\([\s\S]*public, anon, authenticated, service_role/);
  assert.match(migration, /revoke execute on function public\.resolve_restaurant_capacity_internal\(uuid, timestamptz\)[\s\S]*public, anon, authenticated, service_role/);
  assert.match(migration, /revoke execute on function public\.enforce_customer_capacity_activity\(\)[\s\S]*public, anon, authenticated, service_role/);
  assert.match(migration, /set search_path = pg_catalog, public, pg_temp/g);
});

test("the owner read contract reports both enforcement dimensions without PII", () => {
  const readRpc = migration.match(/create or replace function public\.get_restaurant_capacity[\s\S]*?comment on function/)?.[0] ?? "";
  assert.match(readRpc, /'\{write_enforcement\}'[\s\S]*'offers', true[\s\S]*'active_customers', true/);
  assert.match(readRpc, /is_restaurant_admin/);
  assert.match(readRpc, /is_platform_admin/);
  assert.doesNotMatch(readRpc, /email|phone|auth_metadata|customer_id/);
});
