import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL(
  "../supabase/migrations/20260813001000_fix_legacy_rpc_lint_errors.sql",
  import.meta.url,
), "utf8");

test("Forward-Fix definiert exakt die sieben beanstandeten RPC-Verträge neu", () => {
  assert.equal((migration.match(/create or replace function public\./gi) ?? []).length, 7);
  for (const rpc of [
    "redeem_reward",
    "redeem_reward_with_pin",
    "redeem_reward_with_staff_session",
    "register_campaign_customer",
    "register_referral_customer",
    "register_restaurant_customer",
  ]) {
    assert.match(migration, new RegExp(`create or replace function public\\.${rpc}\\(`, "i"));
  }
});

test("Registrierungs-RPCs trennen die normalisierte Variable eindeutig von Tabellenspalten", () => {
  assert.doesNotMatch(migration, /\bnormalized_phone\b/);
  assert.match(migration, /normalized_phone_value text/g);
  assert.match(migration, /from public\.customers as existing_customer/g);
  assert.match(migration, /existing_customer\.restaurant_id = restaurant_record\.id/g);
  assert.match(migration, /existing_customer\.phone = normalized_phone_value/g);
});

test("Telefon-Normalisierung, Tenant-Lock und Duplicate-Erkennung bleiben erhalten", () => {
  assert.match(migration, /regexp_replace\(trim\(coalesce\(input_phone, ''\)\), '\\s\+', '', 'g'\)/g);
  assert.match(migration, /pg_advisory_xact_lock\(hashtextextended\(restaurant_record\.id::text \|\| ':' \|\| normalized_phone_value, 0\)\)/g);
  assert.match(migration, /limit 1\s+for update/g);
});

test("Legacy-Redemption verwendet keinen ungültigen allgemeinen ON-CONFLICT-Vertrag", () => {
  assert.doesNotMatch(migration, /on conflict \(restaurant_id, customer_id, reward_id\)/i);
  assert.match(migration, /update public\.customer_rewards as existing_redemption/g);
  assert.match(migration, /select candidate\.id[\s\S]*for update/g);
  assert.match(migration, /if redemption_id is null then[\s\S]*insert into public\.customer_rewards/g);
});

test("Normale Punkteeinlösungen bleiben wiederholbar und erhalten keinen breiten Unique-Constraint", () => {
  assert.doesNotMatch(migration, /add constraint[\s\S]*unique\s*\(restaurant_id, customer_id, reward_id\)/i);
  assert.doesNotMatch(migration, /create unique index[\s\S]*\(restaurant_id, customer_id, reward_id\)/i);
  assert.match(migration, /Normal point rewards intentionally remain repeatable/);
});

test("Kampagnen-Legacy-Zuteilung dedupliziert explizit ohne falschen Constraint", () => {
  assert.match(migration, /from public\.customer_rewards as existing_offer/);
  assert.match(migration, /where not exists \([\s\S]*existing_offer\.reward_id = offer_id_value/);
});

test("Alle reparierten SECURITY-DEFINER-Funktionen behalten einen festen search_path", () => {
  assert.equal((migration.match(/security definer/gi) ?? []).length, 7);
  assert.equal((migration.match(/set search_path to 'public'(?:, 'extensions')?/gi) ?? []).length, 7);
});

test("Direkte Browser-Ausführung bleibt für alle sieben Verträge entzogen", () => {
  assert.equal((migration.match(/revoke execute on function public\./gi) ?? []).length, 7);
  assert.equal((migration.match(/from public, anon, authenticated;/gi) ?? []).length, 7);
  assert.doesNotMatch(migration, /grant execute/i);
});

test("Aktive V1-Registrierungs- und Präsentationsverträge werden nicht ersetzt", () => {
  for (const activeRpc of [
    "register_restaurant_customer_legal",
    "register_referral_customer_legal",
    "redeem_customer_reward",
    "start_customer_points_presentation",
    "start_customer_gift_presentation",
  ]) {
    assert.doesNotMatch(migration, new RegExp(`create or replace function public\\.${activeRpc}\\(`, "i"));
  }
});
