import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260722001000_staff_redemption_code_preview.sql", import.meta.url),
  "utf8",
);

test("Preview prüft Berechtigung, Restaurant, Hash, Status und Ablauf ohne Verbrauch", () => {
  assert.match(migration, /create or replace function public\.inspect_redemption_code/);
  assert.match(migration, /public\.is_restaurant_member\(input_restaurant_id\)/);
  assert.match(migration, /public\.get_staff_from_session/);
  assert.match(migration, /rc\.restaurant_id = input_restaurant_id/);
  assert.match(migration, /extensions\.digest\(trim\(input_code\), 'sha256'\)/);
  assert.match(migration, /code_record\.status <> 'active'/);
  assert.match(migration, /code_record\.expires_at <= now\(\)/);
  assert.doesNotMatch(migration, /set status = 'redeemed'/);
  assert.doesNotMatch(migration, /redemption_code_consumed/);
});

test("Preview gibt nur Reward- und Gültigkeitsdaten zurück", () => {
  assert.match(migration, /'title', reward_record\.title/);
  assert.match(migration, /'expires_at', code_record\.expires_at/);
  assert.match(migration, /'restaurant_name', restaurant_name/);
  assert.doesNotMatch(migration, /customer_name|phone|email|token_hash/);
});

test("RPC ist nur nach interner Autorisierung für App-Rollen ausführbar", () => {
  assert.match(migration, /security definer/);
  assert.match(migration, /set search_path = public, extensions/);
  assert.match(migration, /revoke execute .* from public/);
  assert.match(migration, /grant execute .* to anon, authenticated/);
});
