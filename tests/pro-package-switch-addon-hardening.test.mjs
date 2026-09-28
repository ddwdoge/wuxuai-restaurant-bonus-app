import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL(
  "../supabase/migrations/20260928006000_pro_addon_cancellation_boundary.sql",
  import.meta.url,
), "utf8");
const entitlements = readFileSync(new URL(
  "../supabase/migrations/20260922007000_billing_catalog_reconciliation.sql",
  import.meta.url,
), "utf8");
const capacity = readFileSync(new URL(
  "../supabase/migrations/20260922006000_pending_activation_registration_and_live_gates.sql",
  import.meta.url,
), "utf8");
const capacityBase = readFileSync(new URL(
  "../supabase/migrations/20260921001000_central_capacity_entitlements.sql",
  import.meta.url,
), "utf8");
const release = readFileSync(new URL(
  "../supabase/migrations/20260915001000_pro_commercial_release_lock.sql",
  import.meta.url,
), "utf8");
const contract = readFileSync(new URL(
  "../docs/V1_CURRENT_CANONICAL_PRODUCT_CONTRACT.md",
  import.meta.url,
), "utf8");

test("the active canonical catalog is finite and uses current prices", () => {
  assert.match(contract, /BASIC: 59 EUR netto[\s\S]*5[\s\S]*3\.000/);
  assert.match(contract, /PRO:\s*149 EUR netto[\s\S]*15[\s\S]*15\.000/);
  assert.match(contract, /Offer Add-on: \+5 Angebote fuer 19 EUR/);
  assert.match(contract, /Customer[\s\S]*Add-on: \+5\.000 Kunden fuer 29 EUR/);
  assert.match(capacity, /resolved_plan_key := case[\s\S]*effective_plan' = 'PRO'[\s\S]*else 'BASIC'/);
  assert.match(capacity, /'unlimited', false/);
});

test("PRO rights require an effective release or exact internal test grant", () => {
  assert.match(entitlements, /effective_pro_valid := internal_test_only_valid[\s\S]*commercial_pro_released/);
  assert.match(entitlements, /if not effective_pro_valid[\s\S]*resolved_plan_key := 'BASIC'/);
  assert.match(entitlements, /effective_offer_notifications := false/);
  assert.match(entitlements, /effective_reward_notifications := false/);
  assert.match(release, /TEST_ONLY_MARKER_REQUIRED/);
  assert.match(release, /grant_row\.revoked_at is null/);
  assert.match(release, /grant_row\.expires_at > at_value/);
});

test("direct browser plan and add-on DML remains unavailable", () => {
  assert.match(release, /revoke all on table public\.commercial_pro_access_grants[\s\S]*public, anon, authenticated, service_role/);
  assert.match(capacityBase, /revoke all on table public\.restaurant_capacity_addon_entitlements[\s\S]*from public, anon, authenticated/);
  assert.match(capacity, /distinct on \(row\.entitlement_key\)/);
  assert.match(capacity, /order by row\.entitlement_key, row\.revision desc, row\.created_at desc, row\.id desc/);
});

test("cancelled add-ons require a finite exclusive period end", () => {
  assert.match(migration, /status <> 'CANCELLED' or effective_until is not null/);
  assert.match(migration, /not valid/);
  assert.match(migration, /validate constraint restaurant_capacity_addon_cancelled_period_required/);
  assert.doesNotMatch(migration, /update|delete from|insert into/i);
  assert.match(capacity, /row\.status = 'CANCELLED'/);
  assert.match(capacity, /row\.effective_until is null or row\.effective_until > at_value/);
});

test("expired, revoked and chargeback revisions cannot retain capacity", () => {
  const resolver = capacity.slice(
    capacity.indexOf("create or replace function public.resolve_restaurant_capacity_internal"),
    capacity.indexOf("create or replace function public.get_restaurant_capacity"),
  );
  assert.match(resolver, /row\.status = 'ACTIVE'/);
  assert.match(resolver, /row\.status = 'PAST_DUE'/);
  assert.doesNotMatch(resolver, /row\.status = 'EXPIRED'/);
  assert.doesNotMatch(resolver, /row\.status = 'REVOKED'/);
  assert.doesNotMatch(resolver, /row\.status = 'CHARGEBACK'/);
});

test("the hardening migration cannot activate billing or PRO", () => {
  assert.doesNotMatch(migration, /branch_subscriptions|commercial_pro_access_grants|stripe|checkout|webhook/i);
  assert.doesNotMatch(migration, /disable row level security|grant execute|grant .* on table/i);
});
