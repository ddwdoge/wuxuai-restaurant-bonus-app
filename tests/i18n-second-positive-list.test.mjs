import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const first = JSON.parse(readFileSync(new URL("../docs/reports/2026-09-06_I18N_TRANSLATION_DATA_CLASSIFICATION.json", import.meta.url)));
const second = JSON.parse(readFileSync(new URL("../docs/reports/2026-09-06_I18N_SECOND_POSITIVE_LIST.json", import.meta.url)));
const leakage = JSON.parse(readFileSync(new URL("../docs/reports/2026-09-06_I18N_GERMAN_LEAKAGE_BASELINE.json", import.meta.url)));
const categories = new Set([
  "STATIC_UI_COPY_EXTERNAL_OK",
  "LEGAL_UI_LABEL_EXTERNAL_OK",
  "LEGAL_DOCUMENT_BODY_LOCAL_ONLY",
  "PERSONAL_OR_EXAMPLE_DATA_LOCAL_ONLY",
  "TECHNICAL_IDENTIFIER_LOCAL_ONLY",
  "OWNER_OR_USER_CONTENT_LOCAL_ONLY",
  "INTERNAL_LOG_DEBUG_LOCAL_ONLY",
]);

test("second inventory classifies every newly visible source exactly once", () => {
  assert.equal(new Set(second.entries.map(({ source }) => source)).size, second.entries.length);
  assert.ok(second.entries.every(({ classification }) => categories.has(classification)));
  assert.equal(second.counts.user_visible_unclassified, 0);
  const firstApproved = new Set(first.approved.map(({ source }) => source));
  assert.equal(second.entries.filter(({ source }) => firstApproved.has(source)).length, 0);
});

test("second external list contains no personal legal-body secret or provider data", () => {
  assert.deepEqual(second.safety, {
    personal_data_in_external_list: 0,
    legal_document_body_in_external_list: 0,
    secret_or_provider_data_in_external_list: 0,
  });
  const external = second.entries.filter(({ classification }) => classification.endsWith("EXTERNAL_OK"));
  assert.equal(external.some(({ source }) => /rendered_text|draft_rendered_text/.test(source)), false);
});

test("known missed expression copy and legal labels enter the correct recovery classes", () => {
  const bySource = new Map(second.entries.map((entry) => [entry.source, entry]));
  assert.equal(bySource.get("Melde dich an, um deine Lokale und restaurantbezogenen Punkte zu sehen.")?.classification, "STATIC_UI_COPY_EXTERNAL_OK");
  assert.equal(bySource.get("Noch kein Kundenkonto?")?.classification, "STATIC_UI_COPY_EXTERNAL_OK");
  assert.equal(bySource.get("Datenschutz")?.classification, "LEGAL_UI_LABEL_EXTERNAL_OK");
  assert.equal(bySource.get("Teilnahmebedingungen")?.classification, "LEGAL_UI_LABEL_EXTERNAL_OK");
  assert.equal(bySource.get("z. B. Café am Markt")?.classification, "PERSONAL_OR_EXAMPLE_DATA_LOCAL_ONLY");
});

test("placeholder schemas are extracted without mutation", () => {
  const placeholderEntries = second.entries.filter(({ placeholders }) => placeholders.length);
  assert.equal(placeholderEntries.length, second.counts.placeholder_strings);
  for (const entry of placeholderEntries) {
    for (const placeholder of entry.placeholders) assert.ok(entry.source.includes(placeholder));
  }
});

test("German leakage detector covers every non-German locale without fake green", () => {
  assert.equal(leakage.ready, true);
  assert.deepEqual(Object.keys(leakage.locales), ["en", "fr", "it", "es", "zh", "ko"]);
  assert.ok(Object.values(leakage.locales).every(({ untranslated_count }) => Number.isInteger(untranslated_count) && untranslated_count >= 0 && untranslated_count <= second.counts.total_external_eligible));
  assert.equal(leakage.user_visible_unclassified, 0);
});
