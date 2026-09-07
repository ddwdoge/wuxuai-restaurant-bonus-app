import type { UiLanguage } from "./language.mjs";
export function localeTag(language: UiLanguage | string): string;
export function formatLocaleDate(value: string | number | Date, language: UiLanguage | string, options?: Intl.DateTimeFormatOptions): string;
export function formatLocaleNumber(value: number, language: UiLanguage | string, options?: Intl.NumberFormatOptions): string;
export function formatLocaleCurrency(value: number, language: UiLanguage | string, currency?: string, options?: Intl.NumberFormatOptions): string;
export function formatLocalePercentage(value: number, language: UiLanguage | string, options?: Intl.NumberFormatOptions): string;
