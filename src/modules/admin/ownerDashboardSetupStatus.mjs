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
