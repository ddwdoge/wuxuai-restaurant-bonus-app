import type { UiLanguage } from "./language.mjs";
export const I18N_NAMESPACES: readonly string[];
export function isTranslationKey(value: unknown): boolean;
export function translateStructural(key: string, language: UiLanguage | string): string;
