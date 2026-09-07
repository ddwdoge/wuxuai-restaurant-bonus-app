import { normalizeUiLanguage, UI_LOCALE_TAGS } from "./language.mjs";

export function localeTag(language) {
  return UI_LOCALE_TAGS[normalizeUiLanguage(language)];
}

export function formatLocaleDate(value, language, options = {}) {
  return new Intl.DateTimeFormat(localeTag(language), options).format(new Date(value));
}

export function formatLocaleNumber(value, language, options = {}) {
  return new Intl.NumberFormat(localeTag(language), options).format(value);
}

export function formatLocaleCurrency(value, language, currency = "EUR", options = {}) {
  return formatLocaleNumber(value, language, { style: "currency", currency, ...options });
}

export function formatLocalePercentage(value, language, options = {}) {
  return formatLocaleNumber(value, language, { style: "percent", ...options });
}
