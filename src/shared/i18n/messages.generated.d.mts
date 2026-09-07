import type { UiLanguage } from "./language.mjs";

export const GENERATED_SOURCE_TO_KEY: Readonly<Record<string, string>>;
export const GENERATED_DYNAMIC_SOURCES: readonly Readonly<{
  source: string;
  key: string;
  placeholders: readonly string[];
}>[];
export const GENERATED_MESSAGES: Readonly<Record<UiLanguage, Readonly<Record<string, string>>>>;
