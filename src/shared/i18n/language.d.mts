export type UiLanguage = "de" | "en" | "fr" | "it" | "es" | "zh" | "ko";
export type UiLanguageSource = "explicit" | "device" | "fallback";

export const SUPPORTED_UI_LANGUAGES: readonly UiLanguage[];
export const UI_LOCALE_TAGS: Readonly<Record<UiLanguage, string>>;
export const UI_LANGUAGE_STORAGE_KEY: string;
export function normalizeUiLanguage(value: unknown, fallback?: UiLanguage | ""): UiLanguage | "";
export function resolveUiLanguage(input?: { explicitPreference?: unknown; deviceLanguages?: unknown[] }): { language: UiLanguage; source: UiLanguageSource };
export function browserUiLanguage(navigatorLike?: Pick<Navigator, "language" | "languages"> | null, explicitPreference?: unknown): { language: UiLanguage; source: UiLanguageSource };
export function readExplicitUiLanguage(storage?: Pick<Storage, "getItem"> | null): UiLanguage | null;
export function writeExplicitUiLanguage(language: unknown, storage?: Pick<Storage, "setItem"> | null): UiLanguage;
export function clearExplicitUiLanguage(storage?: Pick<Storage, "removeItem"> | null): void;
