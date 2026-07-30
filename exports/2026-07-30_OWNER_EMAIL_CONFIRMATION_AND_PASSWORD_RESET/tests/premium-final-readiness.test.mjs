import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260722002000_premium_portals_final_readiness.sql", import.meta.url),
  "utf8",
);
const rewardService = readFileSync(new URL("../src/modules/rewards/rewardService.ts", import.meta.url), "utf8");
const customerStyles = readFileSync(new URL("../src/modules/customer/customer-premium.css", import.meta.url), "utf8");
const customerUi = readFileSync(new URL("../src/modules/customer/components/PremiumCustomerUi.tsx", import.meta.url), "utf8");

test("ein blockierter zweiter Consume schreibt genau einen sicheren Audit-Aufruf", () => {
  const blockedBranch = migration.match(/if code_record\.status = 'redeemed' then([\s\S]*?)end if;/)?.[1] ?? "";
  assert.equal((blockedBranch.match(/write_audit_event/g) ?? []).length, 1);
  assert.match(blockedBranch, /'REWARD_REDEMPTION_BLOCKED'/);
  assert.match(blockedBranch, /'blocked'/);
  assert.match(blockedBranch, /'staff_portal'/);
  assert.doesNotMatch(blockedBranch, /input_code|input_staff_session_token|customer_token|daily_pin|auth-header/i);
});

test("sichere RPC-Fehlerantwort wird im Staff-Flow als Fehler behandelt", () => {
  assert.match(migration, /'error_code', 'REWARD_REDEMPTION_BLOCKED'/);
  assert.match(migration, /'error_message', 'Einlösecode wurde bereits verwendet\.'/);
  assert.match(rewardService, /data\.success === false/);
  assert.match(rewardService, /consumeError\.code = payload\.error_code/);
});

test("nur frische initiale Registrierungsevents erhalten die verifizierte Testsession", () => {
  assert.match(migration, /current_platform_role\(\)/);
  assert.match(migration, /not coalesce\(was_test_customer, false\)/);
  assert.match(migration, /customer_record\.created_at >= now\(\) - interval '30 minutes'/);
  assert.match(migration, /event_type in \('CUSTOMER_REGISTERED', 'CUSTOMER_JOINED_RESTAURANT'\)/);
  assert.match(migration, /test_session_id is null/);
  assert.match(migration, /set is_test_event = true,[\s\S]*test_session_id = customer_record\.test_session_id/);
});

test("Migration lockert weder RLS noch öffentliche Helper-Rechte", () => {
  assert.doesNotMatch(migration, /disable row level security|drop policy|create policy/i);
  assert.match(migration, /revoke execute on function public\.set_platform_customer_test_mode\(uuid, boolean, text\) from public, anon/);
  assert.match(migration, /revoke execute on function public\.consume_redemption_code\(uuid, text, text\) from public/);
});

test("Info-Button hat eine sichtbare Beschriftung und mindestens 44 Pixel Touchfläche", () => {
  assert.match(customerUi, /aria-label="So funktioniert's öffnen"/);
  const rule = customerStyles.match(/\.premium-icon-button\s*\{([\s\S]*?)\}/)?.[1] ?? "";
  assert.match(rule, /height: 44px/);
  assert.match(rule, /min-height: 44px/);
  assert.match(rule, /min-width: 44px/);
  assert.match(rule, /width: 44px/);
  assert.match(customerStyles, /\.premium-icon-button:focus-visible/);
});
