import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const second = JSON.parse(readFileSync(resolve(process.cwd(), "docs/reports/2026-09-06_I18N_SECOND_POSITIVE_LIST.json"), "utf8"));
const messages = await import(resolve(process.cwd(), "src/shared/i18n/messages.generated.mjs"));
const locales = ["en", "fr", "it", "es", "zh", "ko"];
const eligible = second.entries.filter(({ classification }) => classification.endsWith("EXTERNAL_OK"));
const sourceToKey = messages.GENERATED_SOURCE_TO_KEY;
const germanLexeme = /[ÄÖÜäöüß]|\b(?:aber|abbrechen|aktivieren|alle|als|am|an|angezeigt|angebot|angebote|aus|auswählen|bei|belohnung|bereits|bestätigen|bitte|bis|das|dein|deine|dem|den|der|die|dies|diese|dieser|du|durch|ein|eine|einem|einen|einer|einlösen|erforderlich|für|gast|gäste|geschenk|heute|ihr|ihre|im|in|ist|jetzt|kein|keine|kann|können|mit|mitarbeiter|monat|monate|nach|nicht|noch|nur|oder|ohne|punkte|restaurant|schließen|so|speichern|tag|tage|und|verfügbar|von|vor|wird|werden|zu|zum|zur|zurück)\b/iu;
const staticSurface = ({ source, placeholders = [] }) => placeholders.reduce((value, placeholder) => value.replace(placeholder, ""), source).trim();
const isGermanLeakage = (entry, value) => value === entry.source && germanLexeme.test(staticSurface(entry));
const leakageFor = (locale) => eligible.filter(({ source }) => {
  const key = sourceToKey[source];
  return !key || isGermanLeakage(eligible.find((entry) => entry.source === source), messages.GENERATED_MESSAGES[locale]?.[key]);
});
const invariantFor = (locale) => eligible.filter((entry) => {
  const key = sourceToKey[entry.source];
  return key && messages.GENERATED_MESSAGES[locale]?.[key] === entry.source && !isGermanLeakage(entry, entry.source);
});
const untranslatedByLocale = Object.fromEntries(locales.map((locale) => [locale, leakageFor(locale)]));
const report = {
  generated_at: new Date().toISOString(),
  detector: "Static rendered-copy recovery inventory; physical DOM QA remains mandatory after translation.",
  ready: Object.values(untranslatedByLocale).every((entries) => entries.length === 0)
    && second.counts.user_visible_unclassified === 0,
  locales: Object.fromEntries(locales.map((locale) => {
    const leakage = untranslatedByLocale[locale];
    return [locale, {
      untranslated_count: leakage.length,
      examples: leakage.slice(0, 20).map(({ source }) => source),
      intentionally_invariant_count: invariantFor(locale).length,
    }];
  })),
  excluded_local_only_count: second.entries.filter(({ classification }) => classification.endsWith("LOCAL_ONLY")).length,
  user_visible_unclassified: second.counts.user_visible_unclassified,
};
writeFileSync(resolve(process.cwd(), "docs/reports/2026-09-06_I18N_GERMAN_LEAKAGE_BASELINE.json"), `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ ready: report.ready, untranslatedPerNonGermanLocale: Object.fromEntries(locales.map((locale) => [locale, untranslatedByLocale[locale].length])), userVisibleUnclassified: report.user_visible_unclassified })}\n`);
