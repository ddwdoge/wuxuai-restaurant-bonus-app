import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { translateStructural } from "../src/shared/i18n/catalog.mjs";
import { SUPPORTED_UI_LANGUAGES } from "../src/shared/i18n/language.mjs";

const migration = readFileSync(new URL("../supabase/migrations/20260906002000_kassa_compliance_v3.sql", import.meta.url), "utf8");
const staff = readFileSync(new URL("../src/modules/staff/StaffTablet.tsx", import.meta.url), "utf8");
const reports = readFileSync(new URL("../src/modules/reports/BonusActivityReportsPage.tsx", import.meta.url), "utf8");
const gate = readFileSync(new URL("../src/modules/kassa/KassaAcknowledgementGate.tsx", import.meta.url), "utf8");

test("acknowledgement is versioned immutable and server authorized", () => {
  assert.match(migration, /kassa-separation-de-v1/);
  assert.match(migration, /block_kassa_acknowledgement_mutation/);
  assert.match(migration, /m\.role in\('owner','admin'\)/);
  assert.match(migration, /KASSA_DISCLAIMER_ACCEPTED/);
  assert.doesNotMatch(gate, /defaultChecked/);
});

test("Kassa workflow is separate from immutable redemption truth", () => {
  assert.match(migration, /create table public\.kassa_redemption_workflows/);
  assert.match(migration, /'OPEN','RECORDED','OWNER_REVIEWED'/);
  assert.match(migration, /references public\.redemption_activity_journal\(id\) on delete restrict/);
  assert.doesNotMatch(migration, /update public\.redemption_activity_journal/);
});

test("transitions are tenant scoped idempotent and audited", () => {
  assert.match(migration, /where id=input_workflow_id and restaurant_id=input_restaurant_id for update/g);
  assert.match(migration, /already_completed/);
  assert.match(migration, /KASSA_RECORDING_CONFIRMED/);
  assert.match(migration, /KASSA_OWNER_REVIEWED/);
  assert.match(migration, /m\.role='owner'/);
  assert.match(migration, /w\.status<>'RECORDED'/);
});

test("direct browser table access remains revoked", () => {
  assert.match(migration, /revoke all on public\.kassa_compliance_acknowledgements from public, anon, authenticated/);
  assert.match(migration, /revoke all on public\.kassa_redemption_workflows from public, anon, authenticated/);
  assert.match(migration, /PLATFORM_KASSA_DIAGNOSIS_ACCESS_DENIED/);
});

test("visible terminology states the product boundary", () => {
  assert.match(staff, /staff\.kassa\.amountLabel/);
  assert.match(staff, /staff\.kassa\.amountHelp/);
  assert.match(staff, /staff\.kassa\.supportedPurchase/);
  assert.match(reports, /owner\.kassa\.reconcileDescription/);
  assert.equal(translateStructural("staff.kassa.amountLabel", "de"), "Bonusberechnungsbetrag");
  assert.match(translateStructural("staff.kassa.amountHelp", "de"), /keine Kassenbuchung, keinen Gesamtumsatz und keinen steuerlichen Beleg/);
  assert.match(translateStructural("owner.kassa.reconcileDescription", "de"), /keine Umsatz- oder Steuerdaten/);
});

test("owner reconciliation exposes the exact forward statuses", () => {
  for (const key of ["owner.kassa.statusOpen", "owner.kassa.statusRecorded", "owner.kassa.statusReviewed"]) {
    assert.match(reports, new RegExp(key.replaceAll(".", "\\.")));
    for (const language of SUPPORTED_UI_LANGUAGES) assert.notEqual(translateStructural(key, language), key);
  }
  assert.match(reports, /row\.status === "RECORDED" && restaurantRole === "owner"/);
});

test("all Kassa UI keys resolve in seven languages while the legal body remains canonical German", () => {
  const keys = [
    "legal.kassa.title",
    "legal.kassa.shortBoundary",
    "legal.kassa.readFull",
    "legal.kassa.acknowledgement",
    "legal.kassa.immutableThis",
    "owner.kassa.loading",
    "owner.kassa.reconcileTitle",
    "owner.kassa.reconcileDescription",
    "owner.kassa.recordAction",
    "owner.kassa.reviewAction",
    "owner.kassa.helpBody",
    "platform.kassa.title",
    "platform.kassa.description",
    "staff.kassa.supportedPurchase",
    "staff.kassa.amountLabel",
    "staff.kassa.amountHelp",
    "staff.kassa.recordInstruction",
  ];
  for (const language of SUPPORTED_UI_LANGUAGES) {
    for (const key of keys) assert.notEqual(translateStructural(key, language), key, `${language}:${key}`);
  }
  const legalBody = translateStructural("legal.kassa.body", "de");
  for (const language of SUPPORTED_UI_LANGUAGES) assert.equal(translateStructural("legal.kassa.body", language), legalBody);
});
