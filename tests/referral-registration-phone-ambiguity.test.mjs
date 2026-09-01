import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/20260824006100_referral_registration_phone_ambiguity_fix.sql",
    import.meta.url,
  ),
  "utf8",
);

test("Referral-Registrierung verwendet einen eindeutig benannten Telefonnummernwert", () => {
  assert.match(migration, /normalized_phone_value text/);
  assert.match(migration, /customer\.phone = normalized_phone_value/);
  assert.doesNotMatch(migration, /\bphone\s*=\s*normalized_phone\b/);
});

test("Reparatur erhaelt Welcome Gift, Tenant-Scope und sicheren RPC-Vertrag", () => {
  assert.match(migration, /security definer/);
  assert.match(migration, /set search_path = public, pg_temp/);
  assert.match(migration, /customer\.restaurant_id = restaurant_record\.id/);
  assert.match(migration, /assign_welcome_starter_reward/);
  assert.match(migration, /welcome_gift_assigned/);
  assert.match(migration, /revoke execute[\s\S]*from public/);
  assert.match(migration, /grant execute[\s\S]*to anon, authenticated/);
  assert.doesNotMatch(migration, /create policy|drop policy|disable row level security/i);
});
