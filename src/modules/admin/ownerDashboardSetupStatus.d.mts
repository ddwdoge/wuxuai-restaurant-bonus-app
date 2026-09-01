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
export function hasUsableStaffAccess(staffMembers: Array<{ status?: string | null }>): boolean;
export function hasOperationalStaffReadiness(input: {
  ownerOperationalAccess?: boolean;
  staffMembers?: Array<{ status?: string | null }>;
}): boolean;
export function isQrSetupReady(restaurant: { status?: string | null; slug?: string | null } | null | undefined): boolean;
export function isAuthoritativePublicationReady(input: {
  restaurantActive?: boolean;
  registrationAllowed?: boolean;
  publicDiscoveryReady?: boolean;
}): boolean;
