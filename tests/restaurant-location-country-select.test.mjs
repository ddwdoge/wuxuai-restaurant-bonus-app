import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  countryNameForCode,
  filterCountryOptions,
  getCountryOptions,
  isIsoAlpha2CountryCode,
  ISO_ALPHA_2_COUNTRY_CODES,
} from "../src/shared/countries.mjs";

const settings = await readFile(new URL("../src/modules/admin/pages/SettingsPage.tsx", import.meta.url), "utf8");
const countrySelect = await readFile(new URL("../src/shared/components/CountrySelect.tsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
const geocoding = await readFile(new URL("../supabase/functions/_shared/ownerGeocoding.mjs", import.meta.url), "utf8");

test("vollständige ISO-3166-1-Alpha-2-Liste bleibt eindeutig und validierbar", () => {
  assert.equal(ISO_ALPHA_2_COUNTRY_CODES.length, 249);
  assert.equal(new Set(ISO_ALPHA_2_COUNTRY_CODES).size, 249);
  assert.ok(ISO_ALPHA_2_COUNTRY_CODES.every((code) => /^[A-Z]{2}$/.test(code)));
  assert.equal(isIsoAlpha2CountryCode("at"), true);
  assert.equal(isIsoAlpha2CountryCode("Austria123"), false);
});

test("Ländernamen folgen DE EN FR IT ES bei unverändertem ISO-Code", () => {
  assert.equal(countryNameForCode("AT", "de"), "Österreich");
  assert.equal(countryNameForCode("AT", "en"), "Austria");
  assert.equal(countryNameForCode("DE", "fr"), "Allemagne");
  assert.equal(countryNameForCode("CH", "it"), "Svizzera");
  assert.equal(countryNameForCode("FR", "es"), "Francia");
  for (const locale of ["de", "en", "fr", "it", "es"]) {
    assert.equal(getCountryOptions(locale).length, 249);
  }
});

test("Suche unterstützt lokale Namen, Akzente und die fünf Sprachaliasse", () => {
  assert.equal(filterCountryOptions("de", "Öst")[0].code, "AT");
  assert.equal(filterCountryOptions("de", "Ost")[0].code, "AT");
  assert.ok(filterCountryOptions("de", "Germany").some((option) => option.code === "DE"));
  assert.ok(filterCountryOptions("en", "Österreich").some((option) => option.code === "AT"));
});

test("Standort verwendet die gemeinsame Combobox ohne stillen AT-Fallback", () => {
  assert.match(settings, /<CountrySelect[\s\S]*id="location-country"[\s\S]*value=\{partnerLocation\.country\}/);
  assert.match(settings, /isIsoAlpha2CountryCode\(partnerLocation\.country\)/);
  assert.doesNotMatch(settings, /country: locationData\.country \?\? "AT"/);
  assert.doesNotMatch(settings, /partnerLocation\.country\.trim\(\)\.toUpperCase\(\) \|\| "AT"/);
});

test("Combobox ist suchbar, tastaturbedienbar und akzeptiert keine freie Eingabe als Auswahl", () => {
  assert.match(countrySelect, /role="combobox"/);
  assert.match(countrySelect, /role="listbox"/);
  assert.match(countrySelect, /event\.key === "ArrowDown"/);
  assert.match(countrySelect, /event\.key === "ArrowUp"/);
  assert.match(countrySelect, /event\.key === "Enter"/);
  assert.match(countrySelect, /event\.key === "Escape"/);
  assert.match(countrySelect, /onChange\(""\)/);
  assert.match(styles, /\.country-select \.country-select-input \{[^}]*min-height: 48px/);
  assert.match(styles, /\.country-select-option \{[^}]*min-height: 44px/);
});

test("Geocoding bleibt auf ISO-Code und bestehendem countrycodes-Filter", () => {
  assert.match(settings, /country: partnerLocation\.country/);
  assert.match(geocoding, /rawCountry\.length !== 2/);
  assert.match(geocoding, /countrycodes", address\.country\.toLowerCase\(\)/);
});
