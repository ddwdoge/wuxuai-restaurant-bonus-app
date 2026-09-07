import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  SUPPORTED_UI_LANGUAGES,
  browserUiLanguage,
  readExplicitUiLanguage,
  resolveUiLanguage,
  writeExplicitUiLanguage,
} from "../src/shared/i18n/language.mjs";
import { I18N_NAMESPACES, translateStructural } from "../src/shared/i18n/catalog.mjs";
import { formatLocaleCurrency, localeTag } from "../src/shared/i18n/formatters.mjs";
import {
  LEGAL_CONTENT_NOT_AVAILABLE,
  resolveLegalDocumentVersion,
  resolveLegalJurisdiction,
} from "../src/modules/legal/legalJurisdiction.mjs";
import { SUPPORTED_EMAIL_LANGUAGES, normalizeEmailLanguage } from "../src/shared/emailLanguage.mjs";

const migration = readFileSync(new URL("../supabase/migrations/20260906001000_i18n_legal_jurisdiction_architecture.sql", import.meta.url), "utf8");
const panel = readFileSync(new URL("../src/modules/platform/PlatformLegalI18nPanel.tsx", import.meta.url), "utf8");
const service = readFileSync(new URL("../src/modules/platform/platformAdminService.ts", import.meta.url), "utf8");

test("UI and email locale identifiers use the exact approved seven-language contract", () => {
  assert.deepEqual(SUPPORTED_UI_LANGUAGES, ["de", "en", "fr", "it", "es", "zh", "ko"]);
  assert.deepEqual(SUPPORTED_EMAIL_LANGUAGES, SUPPORTED_UI_LANGUAGES);
  assert.equal(normalizeEmailLanguage("zh-CN"), "zh");
  assert.equal(normalizeEmailLanguage("pt-BR"), "en");
});

test("language resolution prioritizes explicit preference, then device, then English", () => {
  assert.deepEqual(resolveUiLanguage({ explicitPreference: "fr", deviceLanguages: ["de-AT"] }), { language: "fr", source: "explicit" });
  assert.deepEqual(resolveUiLanguage({ deviceLanguages: ["pt-BR", "ko-KR"] }), { language: "ko", source: "device" });
  assert.deepEqual(browserUiLanguage({ languages: ["es-ES"], language: "de-DE" }), { language: "es", source: "device" });
  assert.deepEqual(resolveUiLanguage({ deviceLanguages: ["pt-BR"] }), { language: "en", source: "fallback" });
});

test("explicit language preference can be safely persisted without a redundant profile field", () => {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  assert.equal(writeExplicitUiLanguage("it-IT", storage), "it");
  assert.equal(readExplicitUiLanguage(storage), "it");
  assert.throws(() => writeExplicitUiLanguage("pt", storage), /UNSUPPORTED_UI_LANGUAGE/);
});

test("structural catalog exposes application namespaces and English fallback", () => {
  assert.deepEqual(I18N_NAMESPACES, ["common", "auth", "owner", "customer", "staff", "platform", "onboarding", "offers", "points", "rewards", "settings", "errors", "legal", "public"]);
  assert.equal(translateStructural("common.cancel", "de"), "Abbrechen");
  assert.equal(translateStructural("common.cancel", "fr"), "Cancel");
  assert.equal(localeTag("ko"), "ko-KR");
  assert.match(formatLocaleCurrency(59, "de"), /59/);
});

test("legal jurisdiction is derived from business evidence and is independent of UI language", () => {
  assert.deepEqual(resolveLegalJurisdiction({ organizationLegalCountry: "Austria", addressSource: "separate" }), { status: "available", country: "AT", source: "organization_legal_profile" });
  assert.deepEqual(resolveLegalJurisdiction({ addressSource: "restaurant", addressSourceBranchCountry: "FR" }), { status: "available", country: "FR", source: "address_source_branch" });
  assert.equal(resolveLegalJurisdiction({ organizationLegalCountry: "unknown", addressSource: "separate" }).reason, LEGAL_CONTENT_NOT_AVAILABLE);
  assert.doesNotMatch(resolveLegalJurisdiction.toString(), /language/i);
});

test("legal document fallback never crosses a legal country boundary", () => {
  const versions = [
    { id: "at-en", legal_country: "AT", language: "en" },
    { id: "fr-fr", legal_country: "FR", language: "fr" },
  ];
  const sameCountryFallback = resolveLegalDocumentVersion({ versions, legalCountry: "AT", requestedLanguage: "fr" });
  assert.equal(sameCountryFallback.status, "available");
  assert.equal(sameCountryFallback.version.id, "at-en");
  assert.equal(sameCountryFallback.usedFallback, true);
  const unavailable = resolveLegalDocumentVersion({ versions, legalCountry: "DE", requestedLanguage: "fr" });
  assert.deepEqual(unavailable, { status: "unavailable", version: null, reason: LEGAL_CONTENT_NOT_AVAILABLE });
});

test("migration adds immutable jurisdiction evidence without weakening browser access", () => {
  assert.match(migration, /create table if not exists public\.legal_document_version_jurisdictions/);
  assert.match(migration, /before update or delete on public\.legal_document_version_jurisdictions/);
  assert.match(migration, /alter table public\.legal_document_version_jurisdictions enable row level security/);
  assert.match(migration, /revoke all on public\.legal_document_version_jurisdictions from public, anon, authenticated/);
  assert.doesNotMatch(migration, /grant (?:insert|update|delete|select) on public\.legal_document_version_jurisdictions/i);
  assert.doesNotMatch(migration, /alter table public\.(?:customer_legal_acceptances|legal_document_versions) disable row level security/i);
  assert.doesNotMatch(migration, /update public\.customer_legal_acceptances|delete from public\.customer_legal_acceptances/i);
});

test("Platform Admin legal visibility is read-only and server-authorized", () => {
  assert.match(migration, /if not public\.is_platform_admin\(\) then/);
  assert.match(migration, /get_platform_restaurant_legal_i18n_status/);
  assert.match(service, /get_platform_restaurant_legal_i18n_status/);
  assert.match(panel, /Die UI-Sprache bestimmt niemals den Rechtsraum/);
  assert.match(panel, /Veröffentlichte Dokumentstände/);
  assert.match(panel, /primary_business_branch: "Hauptstandort"/);
  assert.doesNotMatch(panel, /update|speichern|bearbeiten/i);
  assert.doesNotMatch(service.slice(service.indexOf("loadPlatformRestaurantLegalI18nStatus")), /\.from\(/);
});

test("SQL jurisdiction resolver has no UI-language input or cross-country legal fallback", () => {
  const resolver = migration.slice(migration.indexOf("create or replace function public.resolve_restaurant_legal_jurisdiction"), migration.indexOf("create table if not exists public.legal_document_version_jurisdictions"));
  assert.doesNotMatch(resolver, /input_(?:language|locale)|requested_(?:language|locale)|ui_(?:language|locale)/i);
  assert.match(resolver, /organization_legal_profiles/);
  assert.match(resolver, /public\.branches/);
  assert.doesNotMatch(migration, /LEGAL CONTENT[\s\S]*insert into public\.legal_document_versions/i);
});
