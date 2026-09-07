export const SUPPORTED_UI_LANGUAGES = Object.freeze(["de", "en", "fr", "it", "es", "zh", "ko"]);

export const UI_LOCALE_TAGS = Object.freeze({
  de: "de-AT",
  en: "en",
  fr: "fr",
  it: "it",
  es: "es",
  zh: "zh-CN",
  ko: "ko-KR",
});

export const UI_LANGUAGE_STORAGE_KEY = "wuxuai.ui-language";

const SUPPORTED = new Set(SUPPORTED_UI_LANGUAGES);

export function normalizeUiLanguage(value, fallback = "en") {
  const candidate = typeof value === "string"
    ? value.trim().toLowerCase().replaceAll("_", "-").split("-")[0]
    : "";
  return SUPPORTED.has(candidate) ? candidate : fallback;
}

export function resolveUiLanguage({ explicitPreference, deviceLanguages = [] } = {}) {
  const explicit = normalizeUiLanguage(explicitPreference, "");
  if (explicit) return { language: explicit, source: "explicit" };

  for (const candidate of deviceLanguages) {
    const device = normalizeUiLanguage(candidate, "");
    if (device) return { language: device, source: "device" };
  }

  return { language: "en", source: "fallback" };
}

export function browserUiLanguage(navigatorLike = globalThis.navigator ?? null, explicitPreference = null) {
  const deviceLanguages = [
    ...(Array.isArray(navigatorLike?.languages) ? navigatorLike.languages : []),
    navigatorLike?.language,
  ];
  return resolveUiLanguage({ explicitPreference, deviceLanguages });
}

export function readExplicitUiLanguage(storage = globalThis.localStorage ?? null) {
  try {
    return normalizeUiLanguage(storage?.getItem(UI_LANGUAGE_STORAGE_KEY), "") || null;
  } catch {
    return null;
  }
}

export function writeExplicitUiLanguage(language, storage = globalThis.localStorage ?? null) {
  const normalized = normalizeUiLanguage(language, "");
  if (!normalized) throw new Error("UNSUPPORTED_UI_LANGUAGE");
  storage?.setItem(UI_LANGUAGE_STORAGE_KEY, normalized);
  return normalized;
}

export function clearExplicitUiLanguage(storage = globalThis.localStorage ?? null) {
  storage?.removeItem(UI_LANGUAGE_STORAGE_KEY);
}
