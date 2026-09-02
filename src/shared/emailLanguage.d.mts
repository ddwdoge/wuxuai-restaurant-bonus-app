export type SupportedEmailLanguage = "de" | "en" | "fr" | "it" | "es" | "zh" | "ko";

export const SUPPORTED_EMAIL_LANGUAGES: readonly SupportedEmailLanguage[];
export function normalizeEmailLanguage(value: unknown, fallback?: SupportedEmailLanguage | ""): SupportedEmailLanguage | "";
export function browserEmailLanguage(navigatorLike?: Pick<Navigator, "language" | "languages"> | null): SupportedEmailLanguage;
