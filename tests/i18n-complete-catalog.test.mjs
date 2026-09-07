import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { GENERATED_DYNAMIC_SOURCES, GENERATED_MESSAGES, GENERATED_SOURCE_TO_KEY } from "../src/shared/i18n/messages.generated.mjs";
import { SUPPORTED_UI_LANGUAGES, resolveUiLanguage } from "../src/shared/i18n/language.mjs";
import { formatLocaleCurrency, formatLocaleDate, formatLocaleNumber } from "../src/shared/i18n/formatters.mjs";
import { translateStructural } from "../src/shared/i18n/catalog.mjs";

const classification = JSON.parse(readFileSync(new URL("../docs/reports/2026-09-06_I18N_TRANSLATION_DATA_CLASSIFICATION.json", import.meta.url), "utf8"));
const recovery = JSON.parse(readFileSync(new URL("../docs/reports/2026-09-06_I18N_SECOND_POSITIVE_LIST.json", import.meta.url), "utf8"));
const selector = readFileSync(new URL("../src/shared/i18n/LanguageSelector.tsx", import.meta.url), "utf8");
const provider = readFileSync(new URL("../src/shared/i18n/I18nProvider.tsx", import.meta.url), "utf8");

function placeholders(value) {
  return (value.match(/\{\{[^{}]+\}\}|\{[^{}]+\}|%[a-z]|https?:\/\/\S+|\b(?:WUXUAI® Bonus|WUXUAI®)\b/g) ?? []).sort();
}

test("all seven catalogs have exact key parity and no raw key values", () => {
  const expected = Object.keys(GENERATED_MESSAGES.de).sort();
  assert.equal(expected.length, 2254);
  assert.equal(Object.keys(GENERATED_SOURCE_TO_KEY).length, 2254);
  for (const language of SUPPORTED_UI_LANGUAGES) {
    assert.deepEqual(Object.keys(GENERATED_MESSAGES[language]).sort(), expected, language);
    for (const [key, value] of Object.entries(GENERATED_MESSAGES[language])) {
      assert.equal(typeof value, "string");
      assert.ok(value.trim(), `${language}:${key}`);
      assert.notEqual(value, key, `${language}:${key}`);
    }
  }
});

test("external translation classification contains only the approved frozen static-copy set", () => {
  assert.deepEqual(classification.counts, { total: 1405, static_ui_copy: 1217, not_allowed: 188 });
  assert.equal(classification.approved.length, 1217);
  assert.equal(classification.excluded.length, 188);
  assert.equal(classification.approved.some((entry) => entry.files.some((file) => file.startsWith("src/modules/legal/"))), false);
  assert.equal(classification.approved.some((entry) => /@|https?:\/\/|[0-9a-f]{8}-[0-9a-f-]{20,}/i.test(entry.source)), false);
});

test("protected placeholders and canonical brands are byte-identical in every language", () => {
  const first = [...classification.approved, ...classification.excluded];
  const firstSources = new Set(first.map(({ source }) => source));
  const second = recovery.entries.filter(({ classification: kind, source }) => kind.endsWith("EXTERNAL_OK") && !firstSources.has(source));
  const sourceByKey = new Map([...first, ...second].map((entry) => [entry.key, entry.source]));
  for (const language of SUPPORTED_UI_LANGUAGES) {
    for (const [key, value] of Object.entries(GENERATED_MESSAGES[language])) {
      assert.deepEqual(placeholders(value), placeholders(sourceByKey.get(key)), `${language}:${key}`);
    }
  }
});

test("all recovery template placeholders and dynamic source patterns remain exact", () => {
  const templates = recovery.entries.filter(({ classification: kind, placeholders }) => kind.endsWith("EXTERNAL_OK") && placeholders.length);
  assert.equal(templates.length, 105);
  assert.equal(GENERATED_DYNAMIC_SOURCES.length, 105);
  for (const entry of templates) {
    const key = GENERATED_SOURCE_TO_KEY[entry.source];
    assert.ok(key, entry.source);
    for (const language of SUPPORTED_UI_LANGUAGES) {
      const value = GENERATED_MESSAGES[language][key];
      for (const placeholder of entry.placeholders) assert.equal(value.split(placeholder).length - 1, 1, `${language}:${key}:${placeholder}`);
    }
  }
});

test("language selector exposes exact labels and resolution remains explicit, device, then English", () => {
  for (const label of ["Deutsch", "English", "Français", "Italiano", "Español", "简体中文", "한국어"]) assert.match(selector, new RegExp(label));
  assert.deepEqual(resolveUiLanguage({ explicitPreference: "it", deviceLanguages: ["fr-FR"] }), { language: "it", source: "explicit" });
  assert.deepEqual(resolveUiLanguage({ deviceLanguages: ["zh-TW"] }), { language: "zh", source: "device" });
  assert.deepEqual(resolveUiLanguage({ deviceLanguages: ["nl-NL"] }), { language: "en", source: "fallback" });
  assert.match(provider, /writeExplicitUiLanguage\(next\)/);
  assert.match(provider, /documentElement\.lang = language/);
});

test("commercial plan labels remain canonical in every translated catalog", () => {
  for (const [source, expected] of [["Basic", "BASIC"], ["Pro", "PRO"], ["Premium · technisch vorbereitet", "PREMIUM"]]) {
    const key = GENERATED_SOURCE_TO_KEY[source];
    assert.ok(key, source);
    for (const language of SUPPORTED_UI_LANGUAGES) assert.ok(GENERATED_MESSAGES[language][key].startsWith(expected), `${language}:${source}`);
  }
});

test("locale formatters produce locale-aware date, number and EUR output", () => {
  const date = new Date("2026-09-06T12:00:00Z");
  assert.notEqual(formatLocaleDate(date, "de"), formatLocaleDate(date, "zh"));
  assert.notEqual(formatLocaleNumber(1234.5, "de"), formatLocaleNumber(1234.5, "en"));
  for (const language of SUPPORTED_UI_LANGUAGES) assert.match(formatLocaleCurrency(59, language), /59/);
});

test("dynamic customer reward counts use explicit locale-aware labels", () => {
  const expected = {
    de: ["Belohnungen", "persönliche Vorteile"],
    en: ["rewards", "personal benefits"],
    fr: ["récompenses", "avantages personnels"],
    it: ["premi", "vantaggi personali"],
    es: ["recompensas", "beneficios personales"],
    zh: ["项奖励", "项专属权益"],
    ko: ["개 리워드", "개 개인 혜택"],
  };
  for (const language of SUPPORTED_UI_LANGUAGES) {
    assert.equal(translateStructural("customer.reward.many", language), expected[language][0]);
    assert.equal(translateStructural("customer.personalBenefit.many", language), expected[language][1]);
  }
  assert.match(readFileSync(new URL("../src/modules/customer/CustomerPortal.tsx", import.meta.url), "utf8"), /customer\.personalBenefit\.many/);
});

test("public entry copy keeps the commercial contract localized and explicit", () => {
  const localizeContract = (language) => translateStructural("public.home.registrationDescription", language)
    .replace("{months}", "3")
    .replace("{price}", "59");
  assert.equal(localizeContract("de"), "Bonusprogramm in wenigen Minuten einrichten. 3 Monate kostenlos. Danach 59 € pro Monat exkl. USt.");
  assert.match(localizeContract("ko"), /3개월 무료/);
  assert.doesNotMatch(translateStructural("public.home.registrationDescription", "ko"), /Monate|kostenlos|Danach/);
  const home = readFileSync(new URL("../src/modules/public/PublicHome.tsx", import.meta.url), "utf8");
  assert.match(home, /public\.home\.registrationDescription/);
  assert.match(home, /V1_COMMERCIAL_CONTRACT\.trial\.calendarMonths/);
  assert.match(home, /V1_COMMERCIAL_CONTRACT\.basePlan\.monthlyPrice/);
});

test("registration copy localizes the complete commercial and form-help contract", () => {
  for (const language of SUPPORTED_UI_LANGUAGES) {
    assert.notEqual(translateStructural("auth.register.description", language), "auth.register.description");
    assert.notEqual(translateStructural("auth.register.passwordHint", language), "auth.register.passwordHint");
    assert.notEqual(translateStructural("auth.register.phoneHint", language), "auth.register.phoneHint");
  }
  const register = readFileSync(new URL("../src/modules/auth/RegisterPage.tsx", import.meta.url), "utf8");
  assert.match(register, /auth\.register\.description/);
  assert.match(register, /auth\.register\.passwordHint/);
  assert.match(register, /auth\.register\.phoneHint/);
  assert.match(register, /V1_COMMERCIAL_CONTRACT\.trial\.calendarMonths/);
  assert.match(register, /V1_COMMERCIAL_CONTRACT\.basePlan\.monthlyPrice/);
});

test("runtime localization translates only cataloged static sources and preserves dynamic owner content", () => {
  assert.equal(GENERATED_SOURCE_TO_KEY["Ein absichtlich nicht katalogisierter Restaurantname"], undefined);
  assert.match(provider, /GENERATED_SOURCE_TO_KEY\[normalizedSource\]/);
  assert.match(provider, /GENERATED_DYNAMIC_SOURCES/);
  assert.match(provider, /data-i18n-skip/);
  assert.doesNotMatch(provider, /innerHTML/);
});
