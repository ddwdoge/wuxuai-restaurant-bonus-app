import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  addV1TrialMonthsIso,
  V1_COMMERCIAL_CONTRACT,
  V1_COMMERCIAL_COPY,
} from "../src/shared/commercialContract.mjs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const registerPage = read("../src/modules/auth/RegisterPage.tsx");
const publicHome = read("../src/modules/public/PublicHome.tsx");
const settingsPage = read("../src/modules/admin/pages/SettingsPage.tsx");
const migration = read("../supabase/migrations/20260830001000_v1_commercial_contract_three_month_trial.sql");

test("der kanonische V1-Vertrag definiert Trial, Preis und Steuerdarstellung", () => {
  assert.equal(V1_COMMERCIAL_CONTRACT.trial.calendarMonths, 3);
  assert.equal(V1_COMMERCIAL_CONTRACT.basePlan.monthlyPrice, 59);
  assert.equal(V1_COMMERCIAL_CONTRACT.basePlan.currency, "EUR");
  assert.equal(V1_COMMERCIAL_CONTRACT.basePlan.vat, "exclusive");
  assert.equal(V1_COMMERCIAL_CONTRACT.basePlan.billingInterval, "monthly");
  assert.equal(V1_COMMERCIAL_COPY.registrationCta, "3 Monate kostenlos starten");
  assert.equal(V1_COMMERCIAL_COPY.price, "Danach 59 € pro Monat exkl. USt.");
});

test("die Dreimonatsfrist folgt Kalendermonaten einschließlich Monatsende", () => {
  assert.equal(addV1TrialMonthsIso("2026-01-15T10:20:30.000Z"), "2026-04-15T10:20:30.000Z");
  assert.equal(addV1TrialMonthsIso("2026-11-30T23:00:00.000Z"), "2027-02-28T23:00:00.000Z");
  assert.equal(addV1TrialMonthsIso("invalid"), null);
});

test("alle aktiven Owner-Akquiseflächen verwenden die zentrale Vertragsquelle", () => {
  for (const source of [registerPage, publicHome, settingsPage]) {
    assert.match(source, /commercialContract\.mjs/);
    assert.doesNotMatch(source, /30 Tage kostenlos|149\s*(?:€|EUR)/);
  }
  assert.match(registerPage, /V1_COMMERCIAL_COPY\.registrationCta/);
  assert.match(registerPage, /V1_COMMERCIAL_COPY\.price/);
  assert.match(publicHome, /V1_COMMERCIAL_COPY\.trial/);
  assert.match(settingsPage, /addV1TrialMonthsIso/);
});

test("Stripe und zukünftige Zusatzpakete bleiben deaktiviert und unsichtbar", () => {
  assert.equal(V1_COMMERCIAL_CONTRACT.automaticBillingActive, false);
  assert.equal(V1_COMMERCIAL_CONTRACT.stripeStatus, "deferred");
  assert.deepEqual(V1_COMMERCIAL_CONTRACT.addOns, []);
  assert.doesNotMatch([registerPage, publicHome, settingsPage].join("\n"), /advanced marketing automation|multi-location \/ branch package|premium campaign tools/i);
});

test("die additive Migration setzt nur neue Trials auf drei Kalendermonate", () => {
  assert.match(migration, /create or replace function public\.start_restaurant_owner_trial/);
  assert.match(migration, /now\(\) \+ interval '3 months'/);
  assert.doesNotMatch(migration, /update\s+public\.branch_subscriptions\s+set\s+trial_ends_at/i);
  assert.match(migration, /on conflict \(branch_id\) do update/);
  assert.match(migration, /coalesce\(branch_subscriptions\.trial_ends_at, excluded\.trial_ends_at\)/);
  assert.match(migration, /security definer[\s\S]*set search_path = public, extensions/);
  assert.match(migration, /revoke execute[\s\S]*from public, anon/);
  assert.match(migration, /grant execute[\s\S]*to authenticated/);
});
