export const OFFER_TYPE_PRIORITY: Readonly<Record<string, number>>;
export function isPublicOfferVisible(offer: Record<string, unknown>, now?: Date): boolean;
export function validateRestaurantOfferDraft(offer: Record<string, unknown>): string | null;
export function maximumConcurrentOffers(offers: Array<{ valid_from: string; valid_to: string }>): number;
export function sortPublicOffers<T extends { offer_type: string; published_at?: string | null; valid_from: string }>(offers: T[]): T[];
