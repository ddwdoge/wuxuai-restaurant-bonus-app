import type { UiLanguage } from "../../shared/i18n/language.mjs";

export type OwnerCapacityMessages = Record<string, string>;
export function ownerCapacityMessages(language: UiLanguage | string): OwnerCapacityMessages;
export function capacityMessage(template: string, values?: Record<string, string | number>): string;
export function ownerCapacityPaymentLabel(language: UiLanguage | string, status: string, fallback: string): string;
