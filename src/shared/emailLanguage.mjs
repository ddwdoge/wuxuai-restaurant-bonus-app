import {
  normalizeUiLanguage,
  resolveUiLanguage,
  SUPPORTED_UI_LANGUAGES,
} from "./i18n/language.mjs";

export const SUPPORTED_EMAIL_LANGUAGES = SUPPORTED_UI_LANGUAGES;

export function normalizeEmailLanguage(value, fallback = "en") {
  return normalizeUiLanguage(value, fallback);
}

export function browserEmailLanguage(navigatorLike = globalThis.navigator ?? null) {
  const deviceLanguages = [
    ...(Array.isArray(navigatorLike?.languages) ? navigatorLike.languages : []),
    navigatorLike?.language,
  ];
  return resolveUiLanguage({ deviceLanguages }).language;
}
