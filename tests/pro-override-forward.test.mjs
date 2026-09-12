import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sql = readFileSync(new URL('../supabase/migrations/20260911001000_pro_override_window_and_termination.sql', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../src/modules/platform/PlatformPlanEntitlementsPanel.tsx', import.meta.url), 'utf8');
const owner = readFileSync(new URL('../src/modules/admin/pages/RestaurantOffersPage.tsx', import.meta.url), 'utf8');
const activate = sql.slice(sql.indexOf('-- All parameters'), sql.indexOf('create or replace function public.end_platform'));
const end = sql.slice(sql.indexOf('create or replace function public.end_platform'), sql.indexOf('-- Old direct'));

test('plan window is independent, bounded and legacy rows are copied without extending expiry', () => {
  assert.match(sql, /plan_effective_from = effective_from/);
  assert.match(sql, /plan_effective_until = expires_at/);
  assert.match(sql, /isfinite\(effective_from\) and isfinite\(expires_at\)/);
  assert.match(sql, /override_record\.plan_override_id is null[\s\S]*'INVALID_WINDOW'/);
  assert.doesNotMatch(sql, /update public\.branch_subscriptions|disable row level security|truncate/i);
});
test('writes require role, exact confirmation and a specific termination target', () => {
  for (const fn of [activate, end]) {
    assert.match(fn, /actor_id_value is null or role_value is null/);
    assert.match(fn, /input_confirmation is distinct from 'CONFIRMED'/);
    assert.match(fn, /length\(trim\(coalesce\(input_reason, ''\)\)\) < 10/);
    assert.match(fn, /set search_path = public, pg_temp/);
  }
  assert.match(end, /plan_override_id is distinct from input_override_id/);
  assert.match(activate, /input_plan_key is distinct from 'PRO'/);
});
test('idempotent replay is checked before changing state and payload collisions are rejected', () => {
  for (const fn of [activate, end]) {
    assert.match(fn, /IDEMPOTENCY_PAYLOAD_MISMATCH/);
    assert.match(fn, /platform_admin_user_id = actor_id_value and tenant_id = input_restaurant_id/);
    assert.ok(fn.indexOf('for update') < fn.indexOf("'idempotent', true"));
    assert.doesNotMatch(fn, /update public\.platform_admin_operations|delete from public\.platform_admin_operations/);
  }
  assert.ok(activate.indexOf("'idempotent', true") < activate.indexOf('now_value := clock_timestamp()'));
});
test('termination changes only the targeted plan metadata and retains feature rows', () => {
  assert.match(end, /set plan_override_key = null, plan_override_id = null/);
  assert.match(end, /where subscription_id = subscription_record.id and plan_override_id = input_override_id/);
  assert.doesNotMatch(end, /delete from|set offer_limit|set effective_from|set expires_at/);
});
test('legacy browser write paths are revoked and no direct table grant is introduced', () => {
  assert.match(sql, /revoke execute on function public\.update_platform_restaurant_entitlements[\s\S]*from public, anon, authenticated/);
  assert.match(sql, /revoke execute on function public\.set_platform_restaurant_plan_override\(uuid,text,timestamptz,text,text,uuid\)[\s\S]*from public, anon, authenticated/);
  assert.doesNotMatch(sql, /grant.*on table|grant.*to anon/i);
});
test('termination has a separate confirmation dialog and plan timing refreshes from the server', () => {
  assert.match(ui, /<UiDialog open=\{endTarget !== null\}/);
  assert.match(ui, /setEndTarget\(data.override\?\.id/);
  assert.match(ui, /endConfirmation !== "CONFIRMED"/);
  assert.match(ui, /window\.setTimeout\(\(\) => void reload\(\)/);
  assert.doesNotMatch(ui, /PLAN_CHANGED|ENTITLEMENT_OVERRIDE_CLEARED/);
});
test('Owner sees server-resolved plan dates but no activation or termination controls', () => {
  assert.match(owner, /entitlements\.effective_from/);
  assert.match(owner, /entitlements\.effective_until/);
  assert.match(owner, /formatLocaleDate/);
  assert.doesNotMatch(owner, /submitPlatformPlanOverride|set_platform_restaurant_plan_override|end_platform_restaurant_plan_override/);
});
