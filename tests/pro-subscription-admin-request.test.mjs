import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const sql = read('supabase/migrations/20260911003000_subscription_admin_request_contract.sql');
test('subscription support requires server identity, exact confirmation, reason and request key', () => {
  for (const text of ["actor_id_value is null", "role_value is null", "input_confirmation is distinct from 'CONFIRMED'",
    'input_idempotency_key is null', "length(trim(coalesce(input_reason, ''))) < 10"]) assert.ok(sql.includes(text));
});
test('subscription support serializes and fingerprints retries before writing', () => {
  assert.ok(sql.indexOf('for update') < sql.indexOf("action_type = 'SUBSCRIPTION_UPDATED'"));
  assert.ok(sql.indexOf("return operation_record.after_state") < sql.indexOf('branch_id_value := public.ensure_restaurant_branch'));
  assert.match(sql, /is distinct from request_value/);
});
test('subscription support has fixed search path and tenant binding', () => {
  assert.match(sql, /set search_path = pg_catalog, public, pg_temp/);
  assert.match(sql, /b.restaurant_id = r.id/);
  assert.match(sql, /subscription_record.organization_id = r.organization_id/);
  assert.match(sql, /r.primary_branch_id = b.id/);
});
test('legacy browser entry point revoked without table or RLS broadening', () => {
  assert.match(sql, /revoke execute on function public.update_platform_restaurant_subscription\(uuid,text,text,text,integer,text\)\s+from public, anon, authenticated/);
  assert.doesNotMatch(sql, /disable row level|grant (?:all|update|insert|delete) on table/i);
});
test('subscription service uses confirmed request and never browser subscription DML', () => {
  const service = read('src/modules/platform/platformAdminService.ts').split('export async function updatePlatformRestaurantSubscription')[1].split('export async function')[0];
  assert.match(service, /rpc\("update_platform_restaurant_subscription_confirmed"/);
  assert.match(service, /input_confirmation: input.confirmation/);
  assert.match(service, /input_idempotency_key: input.idempotencyKey/);
  assert.doesNotMatch(service, /\.from\(/);
});
test('support drawer binds target, freezes submitted payload and reuses request key', () => {
  const ui = read('src/modules/platform/PlatformRestaurantControlCenter.tsx');
  assert.match(ui, /pendingAction.restaurantId !== account.restaurant_id/);
  assert.match(ui, /confirmation !== "CONFIRMED"/);
  assert.match(ui, /idempotencyKey: action.idempotencyKey/);
  assert.match(ui, /disabled=\{saving \|\| submitted\}/);
  assert.match(read('src/modules/platform/PlatformAdminPage.tsx'), /payload.restaurantId !== selectedRestaurant.id/);
});
