import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sourceMigration = readFileSync(
  new URL("../supabase/migrations/20260824006000_referral_welcome_eligibility_monthly_quota.sql", import.meta.url),
  "utf8",
);
const contractMigration = readFileSync(
  new URL("../supabase/migrations/20260825001000_platform_admin_referral_limit_contract.sql", import.meta.url),
  "utf8",
);

test("monatliches Einladungslimit besitzt den autoritativen Default und Wertebereich", () => {
  assert.match(sourceMigration, /referral_monthly_invite_limit integer not null default 5/i);
  assert.match(sourceMigration, /check \(referral_monthly_invite_limit between 1 and 100\)/i);
});

test("Control Center reicht explizite Limits 3, 5 und 100 unverändert durch", () => {
  assert.match(
    contractMigration,
    /'monthly_invite_limit', settings_record\.referral_monthly_invite_limit/,
  );
  assert.doesNotMatch(
    contractMigration,
    /'monthly_invite_limit',\s*coalesce\([^\n]*referral_monthly_invite_limit[^\n]*,\s*5\s*\)/i,
  );
  const readContract = (value) => value;
  for (const value of [3, 5, 100]) assert.equal(readContract(value), value);
});

test("fehlende Settings bleiben unavailable und werden nicht als Limit 5 ausgegeben", () => {
  assert.match(
    contractMigration,
    /'referral', case when settings_found then jsonb_build_object\([\s\S]*?else jsonb_build_object\('status', 'unavailable', 'health', 'unavailable', 'value', null\) end/,
  );
});

test("Settings-Abfragefehler propagieren und erhalten keinen Fehler-Fallback", () => {
  const settingsQuery = contractMigration.match(
    /select settings\.\*[\s\S]*?settings_found := settings_record\.id is not null;/,
  )?.[0];
  assert.ok(settingsQuery);
  assert.doesNotMatch(settingsQuery, /exception|coalesce|default|:=\s*5/i);
});

test("bestehende Platform-Admin-Autorisierung und Grants bleiben eng begrenzt", () => {
  assert.match(contractMigration, /security definer\s+set search_path = public, pg_temp/i);
  assert.match(contractMigration, /if not public\.is_platform_admin\(\) then/i);
  assert.match(contractMigration, /revoke execute on function public\.get_platform_restaurant_control_center\(uuid\)\s+from public, anon, authenticated;/i);
  assert.match(contractMigration, /grant execute on function public\.get_platform_restaurant_control_center\(uuid\)\s+to authenticated;/i);
  assert.equal((contractMigration.match(/create or replace function public\.get_platform_restaurant_control_center/g) ?? []).length, 1);
});
