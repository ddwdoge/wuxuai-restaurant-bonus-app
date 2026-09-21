import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260921001000_central_capacity_entitlements.sql", import.meta.url),
  "utf8",
);
const contract = readFileSync(
  new URL("../docs/V1_CURRENT_CANONICAL_PRODUCT_CONTRACT.md", import.meta.url),
  "utf8",
);
const concurrencyHarness = readFileSync(
  new URL("./phase-7c2-capacity-concurrency.local.mjs", import.meta.url),
  "utf8",
);
const resolver = migration.slice(
  migration.indexOf("create or replace function public.resolve_restaurant_capacity_internal"),
  migration.indexOf("create or replace function public.get_restaurant_capacity"),
);
const publicRead = migration.slice(
  migration.indexOf("create or replace function public.get_restaurant_capacity"),
  migration.indexOf("notify pgrst"),
);

test("Founder contract is recorded before the implementation artifact", () => {
  assert.match(contract, /Founder Phase 7C Basic-\/Pro-\/Capacity-Vertrag/);
  assert.match(contract, /BASIC: 59 EUR netto[\s\S]*5[\s\S]*3\.000/);
  assert.match(contract, /PRO: 149 EUR netto[\s\S]*15[\s\S]*15\.000/);
  assert.match(contract, /PRO ist niemals unlimited/);
  assert.match(contract, /Offer Capacity Add-on: 19 EUR[\s\S]*5/);
  assert.match(contract, /Customer Capacity Add-on: 29 EUR[\s\S]*5\.000/);
});

test("plan and add-on prices are versioned in minor units", () => {
  assert.match(migration, /commercial_capacity_plan_versions/);
  assert.match(migration, /'BASIC', 1, 5900, 'EUR', 'EX_VAT', 5, 3000/);
  assert.match(migration, /'PRO', 1, 14900, 'EUR', 'EX_VAT', 15, 15000/);
  assert.match(migration, /'OFFER_CAPACITY', 'OFFERS', 1, 5, 1900/);
  assert.match(migration, /'CUSTOMER_CAPACITY', 'ACTIVE_CUSTOMERS', 1, 5000, 2900/);
  assert.match(migration, /unique \(plan_key, version\)/);
  assert.match(migration, /unique \(addon_key, version\)/);
});

test("capacity is always finite and calculated with bigint", () => {
  assert.match(migration, /base_offer_limit bigint not null/);
  assert.match(migration, /base_customer_limit bigint not null/);
  assert.match(migration, /units bigint not null check \(units between 1 and 1000000\)/);
  assert.match(resolver, /offer_limit_value := plan_record\.base_offer_limit \+ offer_addon_units \* 5::bigint/);
  assert.match(resolver, /customer_limit_value := plan_record\.base_customer_limit \+ customer_addon_units \* 5000::bigint/);
  assert.match(resolver, /'unlimited', false/);
  assert.doesNotMatch(resolver, /offer_limit_unlimited|2147483647|9223372036854775807/);
});

test("add-on lifecycle is append-only, auditable and fail closed", () => {
  assert.match(migration, /Rows are append-only revisions/);
  assert.match(migration, /unique \(restaurant_id, entitlement_key, revision\)/);
  assert.match(migration, /unique \(request_id\)/);
  assert.match(migration, /status in \('ACTIVE', 'CANCELLED', 'PAST_DUE', 'EXPIRED', 'CHARGEBACK', 'REVOKED'\)/);
  assert.match(resolver, /distinct on \(row\.entitlement_key\)/);
  assert.match(resolver, /row\.status = 'CANCELLED'/);
  assert.match(resolver, /row\.past_due_started_at \+ interval '7 days' > at_value/);
  assert.doesNotMatch(resolver, /row\.status = 'CHARGEBACK'|row\.status = 'EXPIRED'|row\.status = 'REVOKED'/);
  assert.match(migration, /restaurant_capacity_addon_entitlements_immutable/);
});

test("country lock remains the sole plan authority", () => {
  assert.match(resolver, /resolve_restaurant_entitlements_internal\(input_restaurant_id\)/);
  assert.match(resolver, /when entitlement_value->>'effective_plan' = 'PRO' then 'PRO'[\s\S]*else 'BASIC'/);
  assert.doesNotMatch(resolver, /branch_entitlement_overrides|commercial_plan_release_policy|input_country|input_locale|window\.|location\./i);
});

test("offer usage includes current and future published active offers only", () => {
  assert.match(resolver, /from public\.restaurant_offers offer/);
  assert.match(resolver, /offer\.status = 'PUBLISHED'/);
  assert.match(resolver, /offer\.is_active = true/);
  assert.match(resolver, /offer\.valid_to > at_value/);
  assert.doesNotMatch(resolver, /offer\.valid_from <= at_value/);
});

test("active customers use the exact rolling 365-day server evidence contract", () => {
  assert.match(resolver, /at_value - interval '365 days'/);
  assert.match(resolver, /points\.created_at < at_value/);
  assert.match(resolver, /points\.type = 'earn'/);
  assert.match(resolver, /points\.collection_source in \('restaurant_controlled', 'customer_initiated'\)/);
  assert.match(resolver, /not exists \([\s\S]*reversal\.reversal_of = points\.id/);
  assert.match(resolver, /journal\.status = 'ACTIVE'/);
  assert.match(resolver, /journal\.cancelled_at is null/);
  assert.match(resolver, /journal\.is_test_event = false/);
  assert.match(resolver, /customer\.is_test_customer = false/);
  assert.match(resolver, /coalesce\(membership\.account_id::text, qualifying\.customer_id::text\)/);
  assert.doesNotMatch(resolver, /last_opened_at|last_seen_at|customers?\.created_at|login|page_view/i);
});

test("resolver returns usage, effective limits, remaining and explicit over-limit state", () => {
  for (const token of [
    "'effective_limit'",
    "'usage'",
    "'remaining'",
    "'status'",
    "'over_limit'",
    "'write_enforcement_active', false",
  ]) assert.ok(resolver.includes(token), token);
  assert.match(resolver, /when offer_usage_value > offer_limit_value then 'OVER_LIMIT'/);
  assert.match(resolver, /when customer_usage_value > customer_limit_value then 'OVER_LIMIT'/);
});

test("public resolver is authenticated, tenant-authorized, read-only and server-timed", () => {
  assert.match(publicRead, /auth\.uid\(\) is null/);
  assert.match(publicRead, /is_restaurant_admin\(input_restaurant_id\)/);
  assert.match(publicRead, /is_platform_admin\(\)/);
  assert.match(publicRead, /statement_timestamp\(\)/);
  assert.match(migration, /grant execute on function public\.get_restaurant_capacity\(uuid\) to authenticated/);
  assert.doesNotMatch(publicRead, /\binsert\b|\bupdate\b|\bdelete\b|\bmerge\b/i);
});

test("browser roles have no direct table access and internal resolver stays private", () => {
  for (const tableName of [
    "commercial_capacity_plan_versions",
    "commercial_capacity_addon_versions",
    "restaurant_capacity_addon_entitlements",
  ]) {
    assert.match(migration, new RegExp(`revoke all on table public\\.${tableName} from public, anon, authenticated`));
  }
  assert.match(migration, /revoke execute on function public\.resolve_restaurant_capacity_internal\(uuid, timestamptz\)[\s\S]*public, anon, authenticated, service_role/);
});

test("migration is additive and does not modify protected product flows", () => {
  assert.doesNotMatch(migration, /update public\.(commercial_plan_catalog|branch_subscriptions|branch_entitlement_overrides)/i);
  assert.doesNotMatch(migration, /delete from|truncate|drop table|drop column|disable row level security/i);
  assert.doesNotMatch(migration, /create or replace function public\.(collect|redeem|confirm|publish|save|register)/i);
  assert.doesNotMatch(migration, /stripe_price|stripe_product|checkout|webhook/i);
  assert.doesNotMatch(migration, /set_platform_commercial_pro_country_release|commercial_pro_access_grants/i);
});

test("opt-in parallel resolver harness is loopback guarded and write-free", () => {
  assert.match(concurrencyHarness, /loadVerifiedLocalSupabaseTestTarget/);
  assert.match(concurrencyHarness, /Array\.from\(\{ length: 24 \}/);
  assert.match(concurrencyHarness, /RESTAURANT_NOT_FOUND/);
  assert.match(concurrencyHarness, /parallel read attempts must write nothing/);
  assert.doesNotMatch(concurrencyHarness, /\binsert\b|\bupdate\b|\bdelete\b|\btruncate\b/i);
});
