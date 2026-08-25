export const OFFER_TYPE_PRIORITY: Readonly<Record<string, number>>;
export function isPublicOfferVisible(offer: Record<string, unknown>, now?: Date): boolean;
export type OfferValidityState = "CURRENT" | "LATER_TODAY" | "NOT_CURRENT" | "UPCOMING" | "EXPIRED";
export function getOfferValidityState(offer: Record<string, unknown>, now?: Date): OfferValidityState;
export function validateRestaurantOfferDraft(offer: Record<string, unknown>): string | null;
export function maximumConcurrentOffers(offers: Array<{ valid_from: string; valid_to: string }>): number;
export function sortPublicOffers<T extends { offer_type: string; published_at?: string | null; valid_from: string }>(offers: T[]): T[];
