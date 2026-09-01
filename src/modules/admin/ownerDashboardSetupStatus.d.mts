export type OwnerDashboardOfferState = {
  status?: string | null;
  is_active?: boolean | null;
  valid_to?: string | null;
  valid_from?: string | null;
  weekdays?: number[] | null;
  time_from?: string | null;
  time_to?: string | null;
};

export function isOfferSetupReady(offer: OwnerDashboardOfferState, now?: number): boolean;
export function hasUsablePublishedOffer(offers: OwnerDashboardOfferState[], now?: number): boolean;
