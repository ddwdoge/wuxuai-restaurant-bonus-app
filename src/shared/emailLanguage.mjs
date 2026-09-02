export const SUPPORTED_EMAIL_LANGUAGES = Object.freeze(["de", "en", "fr", "it", "es", "zh", "ko"]);

const SUPPORTED = new Set(SUPPORTED_EMAIL_LANGUAGES);

export function normalizeEmailLanguage(value, fallback = "en") {
  const candidate = typeof value === "string"
    ? value.trim().toLowerCase().replace("_", "-").split("-")[0]
    : "";
  return SUPPORTED.has(candidate) ? candidate : fallback;
}

export function browserEmailLanguage(navigatorLike = globalThis.navigator ?? null) {
  const candidates = [
    ...(Array.isArray(navigatorLike?.languages) ? navigatorLike.languages : []),
    navigatorLike?.language,
  ];
  for (const candidate of candidates) {
    const normalized = normalizeEmailLanguage(candidate, "");
    if (normalized) return normalized;
  }
  return "en";
}
