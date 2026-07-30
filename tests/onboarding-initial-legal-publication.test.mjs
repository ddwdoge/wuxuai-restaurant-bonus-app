import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  onboardingCompletionErrorMessage,
  safeLegalRpcError,
  viennaCalendarDate,
} from "../src/modules/legal/legalPublicationDate.mjs";

const migration = await readFile(
  new URL("../supabase/migrations/20260730002000_onboarding_initial_legal_package_publication.sql", import.meta.url),
  "utf8",
);
const onboarding = await readFile(
  new URL("../src/modules/admin/pages/RestaurantOnboarding.tsx", import.meta.url),
  "utf8",
);
const onboardingService = await readFile(
  new URL("../src/modules/onboarding/pilotOnboardingService.ts", import.meta.url),
  "utf8",
);
const ownerLegal = await readFile(
  new URL("../src/modules/legal/OwnerLegalSettingsPage.tsx", import.meta.url),
  "utf8",
);

function functionBlock(name, nextName) {
  const start = migration.indexOf(`create or replace function public.${name}`);
  const end = nextName
    ? migration.indexOf(`create or replace function public.${nextName}`, start + 1)
    : migration.length;
  assert.ok(start >= 0, `${name} fehlt`);
  return migration.slice(start, end >= 0 ? end : migration.length);
}

const publishBlock = functionBlock("publish_restaurant_legal_drafts", "complete_restaurant_onboarding");
const completionBlock = functionBlock("complete_restaurant_onboarding");

test("Wien-Kalenderdatum bleibt an UTC-Tagesgrenzen korrekt", () => {
  assert.equal(viennaCalendarDate(new Date("2026-01-01T23:30:00.000Z")), "2026-01-02");
  assert.equal(viennaCalendarDate(new Date("2026-07-29T22:30:00.000Z")), "2026-07-30");
});

test("Onboarding verlangt eine ausdrückliche Owner-Veröffentlichungsbestätigung", () => {
  assert.match(onboarding, /legalPublicationConfirmed: false/);
  assert.match(onboarding, /Ich habe meine Unternehmens- und Bonusprogrammdaten geprüft/);
  assert.match(onboarding, /Die Vorlagen wurden automatisch erstellt und ersetzen keine individuelle Rechtsberatung/);
  assert.match(onboarding, /required[\s\S]*type="checkbox"/);
  assert.match(onboardingService, /input_publication_confirmed: input\.legalPublicationConfirmed/);
});

test("Restaurant wird erst nach Paketgenerierung und Veröffentlichung aktiviert", () => {
  const generation = completionBlock.indexOf("perform public.generate_restaurant_legal_package");
  const publication = completionBlock.indexOf("perform public.publish_restaurant_legal_drafts");
  const activation = completionBlock.indexOf("status = 'active'", publication);
  const readiness = completionBlock.indexOf("ONBOARDING_LEGAL_READINESS_FAILED", activation);
  assert.ok(generation >= 0 && publication > generation && activation > publication && readiness > activation);
});

test("fehlgeschlagene Readiness wirft innerhalb derselben RPC-Transaktion zurück", () => {
  assert.match(completionBlock, /if not legal_ready_value[\s\S]*raise exception[\s\S]*ONBOARDING_LEGAL_READINESS_FAILED/);
  assert.doesNotMatch(onboardingService, /from\("restaurants"\)\s*\.update\(/);
});

test("Onboarding verwendet ausschließlich das bestehende Restaurant und verändert keinen Slug", () => {
  assert.match(completionBlock, /from public\.restaurants[\s\S]*where id = input_restaurant_id[\s\S]*for update/);
  assert.doesNotMatch(completionBlock, /insert into public\.restaurants/i);
  assert.doesNotMatch(completionBlock, /\bslug\s*=/i);
});

test("Owner- und Tenantprüfung erfolgen serverseitig", () => {
  assert.match(completionBlock, /public\.is_restaurant_admin\(input_restaurant_id\)/);
  assert.match(completionBlock, /errcode = '42501'/);
  assert.match(migration, /revoke execute on function public\.complete_restaurant_onboarding[\s\S]*from public, anon/);
  assert.match(migration, /grant execute on function public\.complete_restaurant_onboarding[\s\S]*to authenticated/);
});

test("vollständige Pflichtdokumente und unveränderte Inhalte werden geprüft", () => {
  assert.match(publishBlock, /participation_terms', 'privacy/);
  assert.match(publishBlock, /mandatory_draft_count <> 2/);
  assert.match(publishBlock, /LEGAL_REQUIRED_DOCUMENTS_MISSING/);
  assert.match(publishBlock, /document_hash/);
  assert.match(publishBlock, /jsonb_typeof\(v\.content\)/);
  assert.match(migration, /new\.content = old\.content/);
  assert.match(migration, /new\.document_hash = old\.document_hash/);
});

test("Veröffentlichung ist ein vollständiges Paket und meldet keinen Teilerfolg", () => {
  assert.match(publishBlock, /for draft_record in[\s\S]*status = 'published'[\s\S]*published_count := published_count \+ 1/);
  assert.match(completionBlock, /published_count < 2[\s\S]*ONBOARDING_LEGAL_PACKAGE_INCOMPLETE/);
});

test("erneuter Abschluss ist idempotent und erzeugt keine zweite Restaurantanlage", () => {
  assert.match(completionBlock, /onboarding_status = 'completed'[\s\S]*restaurant_legal_bundle_is_current/);
  assert.match(completionBlock, /'already_completed', true/);
  assert.doesNotMatch(completionBlock, /insert into public\.restaurants/i);
  assert.match(onboarding, /submissionInFlightRef\.current/);
});

test("erstmalige Veröffentlichung räumt Dirty-State kontrolliert auf", () => {
  assert.match(publishBlock, /initial_package_value/);
  assert.match(publishBlock, /legal_update_required_at = null/);
  assert.match(completionBlock, /legal_update_required_at = null/);
  assert.match(publishBlock, /'initial_package', initial_package_value/);
});

test("Programmende bleibt eine unabhängige serverseitige Readiness-Bedingung", () => {
  assert.match(completionBlock, /restaurant_registration_readiness/);
  assert.doesNotMatch(completionBlock, /insert into public\.program_terminations|update public\.program_terminations/);
});

test("strukturierte RPC-Fehler werden sicher protokolliert und freundlich angezeigt", () => {
  const safe = safeLegalRpcError({
    code: "P0001",
    message: "LEGAL_DRAFT_INVALID",
    details: "Dokumenttyp participation_terms",
    hint: "Prüfen",
    secret: "nicht übernehmen",
  });
  assert.deepEqual(safe, {
    code: "P0001",
    message: "LEGAL_DRAFT_INVALID",
    details: "Dokumenttyp participation_terms",
    hint: "Prüfen",
  });
  assert.match(onboardingCompletionErrorMessage(safe), /Dokumentpaket konnte nicht freigegeben/);
  assert.match(onboarding, /safeLegalRpcError\(error\)/);
  assert.match(ownerLegal, /safeLegalRpcError\(publicationError\)/);
});

test("manuelle Veröffentlichung und Readiness verwenden kontrollierte Tageswerte", () => {
  assert.match(ownerLegal, /viennaCalendarDate\(\)/);
  assert.match(completionBlock, /time zone 'Europe\/Vienna'/);
  assert.match(publishBlock, /v\.effective_date <= input_effective_date/);
});
