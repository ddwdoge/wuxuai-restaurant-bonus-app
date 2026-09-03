import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL("../supabase/migrations/20260903003000_customer_identity_support_audit_actor_fix.sql", import.meta.url),
  "utf8",
);

test("identity support detail uses the canonical Owner audit actor", () => {
  assert.match(migration, /get_customer_identity_support_detail/);
  assert.match(migration, /'admin',[\s\S]*auth\.uid\(\),[\s\S]*'CUSTOMER_SENSITIVE_DATA_VIEWED'/);
  assert.doesNotMatch(migration, /'restaurant_user'/);
});

test("identity support detail preserves same-tenant Owner authorization", () => {
  assert.match(migration, /can_manage_customer_identity\(input_restaurant_id\)/);
  assert.match(migration, /id = input_customer_id[\s\S]*restaurant_id = input_restaurant_id/);
  assert.match(migration, /security definer[\s\S]*set search_path = public/i);
});

test("identity support detail keeps browser grants minimal", () => {
  assert.match(migration, /revoke execute[\s\S]*from public, anon/);
  assert.match(migration, /grant execute[\s\S]*to authenticated/);
  assert.doesNotMatch(migration, /grant (select|insert|update|delete)/i);
});
