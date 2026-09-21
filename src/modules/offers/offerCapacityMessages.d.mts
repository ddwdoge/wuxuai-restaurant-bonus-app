import type { UiLanguage } from "../../shared/i18n/language.mjs";

export const OFFER_CAPACITY_REACHED_MESSAGES: Readonly<Record<UiLanguage, string>>;
export function offerCapacityReachedMessage(language: UiLanguage | string): string;
