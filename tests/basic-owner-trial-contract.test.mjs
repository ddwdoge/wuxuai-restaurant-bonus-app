import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  basicTrialDurationLabel,
  formatViennaDateTime,
  inferTrialCalendarMonths,
} from "../src/modules/billing/basicTrialPresentation.mjs";

const migration = await readFile(new URL(
  "../supabase/migrations/20260928003000_basic_owner_trial_contract_read_model.sql",
  import.meta.url,
), "utf8");
const settings = await readFile(new URL("../src/modules/admin/pages/SettingsPage.tsx", import.meta.url), "utf8");
const panel = await readFile(new URL("../src/modules/billing/BasicPaidOfferPanel.tsx", import.meta.url), "utf8");
const service = await readFile(new URL("../src/modules/billing/basicBillingService.ts", import.meta.url), "utf8");

test("owner timing uses Vienna calendar days and an exclusive end", () => {
  assert.match(migration, /basic_owner_trial_timing_internal/);
  assert.match(migration, /at time zone 'Europe\/Vienna'\)-interval '7 days'/);
  assert.match(migration, /'trial_active',input_now<input_ends_at/);
  assert.match(migration, /'checkout_allowed',input_now>=input_ends_at/);
  assert.doesNotMatch(migration, /ends_at-statement_timestamp\(\)>interval '7 days'/);
});

test("owner read model is tenant-bound and exposes no automatic billing", () => {
  assert.match(migration, /get_owner_basic_contract_snapshot/);
  assert.match(migration, /m\.user_id=actor and m\.role='owner'/);
  assert.match(migration, /'boundary_timezone','Europe\/Vienna'/);
  assert.match(migration, /'automatic_charge',false,'automatic_extension',false/);
  assert.match(migration, /post_trial_grace_ends_at/);
});

test("saved pre-expiry acceptance resumes checkout without a second acceptance", () => {
  assert.match(service, /openAcceptedBasicTestCheckout/);
  assert.match(panel, /savedAcceptanceId\s*\?\s*await openAcceptedBasicTestCheckout/);
  assert.match(panel, /setSavedAcceptanceId\(result\.acceptanceId\)/);
  assert.match(panel, /Deine ausdrückliche Entscheidung ist gespeichert/);
  assert.match(settings, /acceptanceId=\{basicContract\?\.acceptance_id\}/);
});

test("owner UI shows duration, Vienna endpoint and post-trial contract", () => {
  assert.equal(basicTrialDurationLabel(1), "Ein Kalendermonat");
  assert.equal(basicTrialDurationLabel(3), "Drei Kalendermonate");
  assert.match(formatViennaDateTime("2026-10-25T01:30:00Z"), /25\.10\.2026/);
  assert.match(settings, /Testphase Ende \(exklusiv\)/);
  assert.match(settings, /60-Kalendertage-Fensters/);
  assert.match(settings, /keinen automatischen Punkteverfall/);
});

test("preserved trials infer one or three Vienna calendar months without inventing a decision", () => {
  assert.equal(inferTrialCalendarMonths("2026-09-11T08:31:00Z", "2026-12-11T08:31:00Z"), 3);
  assert.equal(inferTrialCalendarMonths("2027-01-31T09:00:00Z", "2027-02-28T09:00:00Z"), 1);
  assert.equal(inferTrialCalendarMonths("2026-09-11T08:31:00Z", "2026-11-11T08:31:00Z"), null);
  assert.match(settings, /inferTrialCalendarMonths/);
});

test("no owner trial reminder email is claimed", () => {
  assert.doesNotMatch(settings, /E-Mail.*Testphase|Testphase.*E-Mail/i);
});
