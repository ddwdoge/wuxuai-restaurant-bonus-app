import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL("../supabase/migrations/20260825006000_staff_operational_access_actor_fix.sql", import.meta.url),
  "utf8",
);

test("safe customer listing admits only authoritative operator or active Staff relationships", () => {
  assert.match(migration, /create or replace function public\.list_restaurant_customers_safe/);
  assert.match(migration, /rm\.restaurant_id = r\.id/);
  assert.match(migration, /rm\.user_id = auth\.uid\(\)/);
  assert.match(migration, /rm\.role in \('owner', 'admin', 'manager'\)/);
  assert.match(migration, /rm\.role in \('staff', 'supervisor'\)/);
  assert.match(migration, /sm\.auth_user_id = auth\.uid\(\)/);
  assert.match(migration, /sm\.active = true/);
  assert.match(migration, /sm\.account_status = 'active'/);
  assert.match(migration, /sm\.archived_at is null/);
  assert.match(migration, /r\.status = 'active'/);
});

test("safe customer listing remains data-minimized and tenant scoped", () => {
  assert.match(migration, /where c\.restaurant_id = input_restaurant_id/);
  assert.match(migration, /public\.customer_display_name\(c\.name\)/);
  assert.match(migration, /public\.mask_customer_phone\(c\.phone\)/);
  assert.match(migration, /'email', null/);
  assert.match(migration, /'birthday', null/);
  assert.doesNotMatch(migration, /c\.email|c\.birthday/);
});

test("suspended Staff, cross-tenant users, customers and anon cannot list guests", () => {
  assert.match(migration, /auth\.uid\(\) is null or not exists/);
  assert.match(migration, /STAFF_CUSTOMER_LIST_ACCESS_DENIED/);
  assert.match(migration, /revoke all on function public\.list_restaurant_customers_safe\(uuid\)[\s\S]*from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.list_restaurant_customers_safe\(uuid\)[\s\S]*to authenticated/);
});

test("points action validates the exact operational actor before legacy booking logic", () => {
  assert.match(migration, /actor_role_value in \('staff', 'supervisor'\)/);
  assert.match(migration, /actor_role_value in \('owner', 'admin', 'manager'\)/);
  assert.match(migration, /STAFF_ACTION_ACCESS_DENIED/);
  assert.match(migration, /sm\.restaurant_id = input_restaurant_id/);
  assert.match(migration, /sm\.auth_user_id = auth\.uid\(\)/);
  assert.doesNotMatch(migration, /platform_admins|user_metadata|app_metadata|email\s*=/i);
});

test("successful actions attribute Staff and operators without impersonation", () => {
  assert.match(migration, /actor_id_value := staff_member_id_value/);
  assert.match(migration, /actor_id_value := auth\.uid\(\)/);
  assert.match(migration, /staff_member_id = staff_member_id_value/);
  assert.match(migration, /set actor_type = actor_type_value,[\s\S]*actor_id = actor_id_value/);
  assert.match(migration, /when actor_type_value = 'admin' then 'operator'/);
  assert.doesNotMatch(migration, /insert into public\.staff_members|update public\.staff_members/i);
});

test("failed actions retain the resolved actor without logging PIN or tokens", () => {
  assert.match(migration, /public\.write_audit_event\([\s\S]*actor_type_value,[\s\S]*actor_id_value/);
  assert.doesNotMatch(migration, /jsonb_build_object\([^)]*(daily_pin|input_daily_pin|token)/i);
});

test("security definer functions use fixed search paths and narrow grants", () => {
  assert.equal((migration.match(/security definer/g) ?? []).length, 2);
  assert.equal((migration.match(/set search_path = public, pg_temp/g) ?? []).length, 2);
  assert.match(migration, /revoke all on function public\.apply_staff_daily_pin_loyalty_action_v1\([\s\S]*from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.apply_staff_daily_pin_loyalty_action_v1\([\s\S]*to authenticated/);
});
