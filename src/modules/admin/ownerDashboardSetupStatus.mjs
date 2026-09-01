export function isOfferSetupReady(offer, now = Date.now()) {
  const validTo = new Date(offer?.valid_to ?? "").getTime();
  return offer?.status === "PUBLISHED"
    && offer?.is_active === true
    && Number.isFinite(validTo)
    && validTo > now;
}

export function hasUsablePublishedOffer(offers, now = Date.now()) {
  return Array.isArray(offers) && offers.some((offer) => isOfferSetupReady(offer, now));
}

export function hasUsableStaffAccess(staffMembers) {
  return Array.isArray(staffMembers)
    && staffMembers.some((member) => member?.status === "active");
}

export function isQrSetupReady(restaurant) {
  const slug = typeof restaurant?.slug === "string" ? restaurant.slug.trim() : "";
  return restaurant?.status === "active"
    && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}

export function isAuthoritativePublicationReady(input) {
  return input?.restaurantActive === true
    && input?.registrationAllowed === true
    && input?.publicDiscoveryReady === true;
}
