import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("../supabase/migrations/20260911002000_subscription_browser_write_lock.sql", import.meta.url), "utf8");
const settings = readFileSync(new URL("../src/modules/admin/pages/SettingsPage.tsx", import.meta.url), "utf8");
const owner = sql.split("create or replace function public.start_restaurant_owner_trial(")[1].split("-- Close the NULL-role")[0];
const branch = sql.split("create or replace function public.ensure_restaurant_branch(")[1].split("create or replace function public.start_restaurant_owner_trial(")[0];

test("subscription lock revokes all browser mutation classes and column grants", () => {
  assert.match(sql, /revoke insert, update, delete, truncate, references, trigger\s+on public.branch_subscriptions from public, anon, authenticated/);
  assert.match(sql, /quote_ident\(attname\)/);
  assert.match(sql, /revoke insert \('/);
  assert.match(sql, /drop policy if exists "branch subscriptions admin write"/);
  assert.doesNotMatch(sql, /disable row level security/i);
  assert.doesNotMatch(sql, /drop policy[^;]*member select/i);
});
test("subscription settings are read-only even when no subscription exists", () => {
  const loader = settings.split("async function loadPrimarySubscription(")[1].split("export function SettingsPage")[0];
  assert.doesNotMatch(loader, /\.(insert|update|upsert|delete|rpc)\(/);
  assert.doesNotMatch(loader, /pilot|new Date|addV1TrialMonthsIso/);
  assert.match(loader, /return normalizeSubscription\(data/);
});
test("canonical onboarding accepts no plan, payment or lifecycle inputs", () => {
  const signature = owner.split("returns jsonb")[0];
  assert.match(signature, /input_owner_name text, input_restaurant_name text, input_phone text default null/);
  assert.doesNotMatch(signature, /input_(plan|payment|trial|period|override)/);
  assert.match(owner, /auth.uid\(\)/);
  assert.match(owner, /where owner_id = user_id_value/);
  assert.match(owner, /pg_advisory_xact_lock/);
});
test("onboarding defaults are fixed BASIC and three calendar months", () => {
  assert.match(branch, /'trialing', 'BASIC', 'trialing'/);
  assert.match(branch, /'not_required', now\(\), now\(\) \+ interval '3 months'/);
  assert.match(branch, /on conflict \(branch_id\) do nothing/);
  assert.doesNotMatch(owner, /(?:update|insert into) public.branch_subscriptions/);
  assert.doesNotMatch(branch, /update public.branch_subscriptions/);
});
test("legacy subscription RPC fails closed for missing identity and platform role", () => {
  assert.match(sql, /auth.uid\(\) is null or role_value is null or role_value not in/);
  assert.match(sql, /length\(trim\(coalesce\(input_reason, ''\)\)\) < 10/);
  assert.match(sql, /input_payment_status is not null or input_restaurant_status is not null/);
  assert.match(sql, /revoke all on function public.update_platform_restaurant_subscription_internal_v1[^;]+from public, anon, authenticated/);
});
test("browser parent cascade and identity changes cannot reset subscriptions", () => {
  assert.match(sql, /security invoker\s+set search_path = pg_catalog, pg_temp/);
  for (const table of ["branches", "organizations", "restaurants"]) {
    assert.match(sql, new RegExp(`before update or delete on public\\.${table}`));
  }
  for (const key of ["id", "owner_id", "restaurant_id", "organization_id", "primary_branch_id"]) {
    assert.ok(sql.includes(`to_jsonb(new) -> '${key}'`));
  }
});
test("migration does not rewrite existing subscriptions or implement billing", () => {
  assert.doesNotMatch(sql, /\b(update|delete from) public.branch_subscriptions/i);
  assert.doesNotMatch(sql, /stripe\.(?:subscriptions|checkout)|sk_live_|fuqhljgesclipzduhykl/);
  assert.match(sql, /revoke all on function public.ensure_restaurant_branch\(uuid\) from public, anon, authenticated/);
});
