import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  isLegalBundleReady,
  requiredLegalDocumentStatus,
} from "../src/modules/legal/legalReadiness.mjs";

const migration = await readFile(
  new URL("../supabase/migrations/20260729005000_legal_readiness_effective_date_guard.sql", import.meta.url),
  "utf8",
);
const customerPortal = await readFile(
  new URL("../src/modules/customer/CustomerPortal.tsx", import.meta.url),
  "utf8",
);
const legalCenter = await readFile(
  new URL("../src/modules/legal/LegalCenterPage.tsx", import.meta.url),
  "utf8",
);
const ownerLegal = await readFile(
  new URL("../src/modules/legal/OwnerLegalSettingsPage.tsx", import.meta.url),
  "utf8",
);

const terms = {
  document_type: "participation_terms",
  version: "test-1",
  status: "published",
  effective_date: "2026-07-29",
};
const privacy = {
  document_type: "privacy",
  version: "test-1",
  status: "published",
  effective_date: "2026-07-29",
};

test("beide veröffentlichten und gültigen Pflichtdokumente geben Registrierung frei", () => {
  assert.equal(isLegalBundleReady([terms, privacy], "2026-07-29"), true);
});

test("fehlende Teilnahmebedingungen blockieren", () => {
  assert.equal(isLegalBundleReady([privacy], "2026-07-29"), false);
});

test("fehlende Datenschutzerklärung blockiert", () => {
  assert.equal(isLegalBundleReady([terms], "2026-07-29"), false);
});

test("unveröffentlichte und zukünftige Versionen blockieren", () => {
  assert.equal(isLegalBundleReady([{ ...terms, status: "draft" }, privacy], "2026-07-29"), false);
  assert.equal(isLegalBundleReady([{ ...terms, effective_date: "2026-07-30" }, privacy], "2026-07-29"), false);
});

test("Statusmodell liefert Version, Veröffentlichung und Gültigkeit je Pflichtdokument", () => {
  const statuses = requiredLegalDocumentStatus([terms, privacy], "2026-07-29");
  assert.deepEqual(statuses.map(({ documentType, exists, published, effective, ready }) => ({
    documentType, exists, published, effective, ready,
  })), [
    { documentType: "participation_terms", exists: true, published: true, effective: true, ready: true },
    { documentType: "privacy", exists: true, published: true, effective: true, ready: true },
  ]);
});

test("serverseitiges Gate bleibt restaurantbezogen und berücksichtigt effective_date", () => {
  assert.match(migration, /d\.restaurant_id = input_restaurant_id/);
  assert.match(migration, /v\.restaurant_id = d\.restaurant_id/);
  assert.match(migration, /v\.effective_date <= input_as_of/);
  assert.match(migration, /restaurant_legal_bundle_is_current\(restaurant_record\.id, current_date\)/);
});

test("interner Template-Helper ist für Browserrollen gesperrt", () => {
  assert.match(migration, /revoke execute on function public\.ensure_restaurant_legal_templates\(uuid\)[\s\S]*from public, anon, authenticated/);
  assert.match(migration, /revoke execute on function public\.restaurant_legal_bundle_is_current\(uuid, date\)[\s\S]*from public, anon, authenticated/);
});

test("Public RPC liefert nur veröffentlichte bereits gültige Versionen", () => {
  const publicFunction = migration.slice(
    migration.indexOf("create or replace function public.get_public_legal_center"),
    migration.indexOf("create or replace function public.register_restaurant_customer_legal"),
  );
  assert.match(publicFunction, /v\.status = 'published'/);
  assert.match(publicFunction, /v\.effective_date <= current_date/);
  assert.match(publicFunction, /'status', v\.status/);
  assert.doesNotMatch(publicFunction, /ensure_restaurant_legal_templates/);
});

test("Retry lädt Legal-Daten neu und behält keinen alten Fehlerzustand", () => {
  assert.match(customerPortal, /setLegalCenterState\(\{ status: "loading" \}\);[\s\S]*loadPublicLegalCenter/);
  assert.match(customerPortal, /onClick=\{\(\) => void reloadLegalCenter\(\)\}/);
  assert.match(customerPortal, /disabled=\{legalCenterState\.status !== "ready"\}/);
});

test("Legal-Links und verständliche Owner-Readiness bleiben sichtbar und restaurantbezogen", () => {
  assert.match(customerPortal, /\/legal\/\$\{encodeURIComponent\(restaurant\.slug\)\}#participation_terms/);
  assert.match(customerPortal, /\/legal\/\$\{encodeURIComponent\(restaurant\.slug\)\}#privacy/);
  assert.match(legalCenter, /documentByType\(data, "participation_terms"\)/);
  assert.match(legalCenter, /documentByType\(data, "privacy"\)/);
  assert.match(ownerLegal, /registration\?\.label/);
  assert.match(ownerLegal, /Unternehmensdaten bearbeiten/);
  assert.doesNotMatch(ownerLegal, /DRAFT_LEGAL_REVIEW_REQUIRED/);
});

test("freiwillige Marketingeinwilligungen bleiben außerhalb des Legal-Readiness-Gates", () => {
  assert.doesNotMatch(migration, /restaurant_legal_bundle_is_current[\s\S]{0,500}marketing_/);
  assert.match(customerPortal, /Freiwillige Einwilligungen/);
});
