export const OFFER_TYPE_PRIORITY = Object.freeze({
  LUNCH_MENU: 1,
  WEEKLY_OFFER: 2,
  MONTHLY_OFFER: 3,
  SEASONAL_OFFER: 4,
  NEW_DISH: 5,
  EVENT: 6,
  NEWS: 7,
});

function viennaClock(now) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Vienna",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  return {
    weekday: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(
      parts.find((part) => part.type === "weekday")?.value,
    ) + 1,
    time: `${parts.find((part) => part.type === "hour")?.value}:${parts.find((part) => part.type === "minute")?.value}`,
  };
}

export function isPublicOfferVisible(offer, now = new Date()) {
  const nowMs = now.getTime();
  const validToMs = new Date(offer?.valid_to).getTime();
  return offer?.status === "PUBLISHED"
    && offer?.is_active === true
    && Number.isFinite(validToMs)
    && validToMs > nowMs;
}

export function getOfferValidityState(offer, now = new Date()) {
  const nowMs = now.getTime();
  const validFromMs = new Date(offer?.valid_from).getTime();
  const validToMs = new Date(offer?.valid_to).getTime();
  if (!Number.isFinite(validFromMs) || !Number.isFinite(validToMs) || validToMs <= nowMs) return "EXPIRED";
  if (validFromMs > nowMs) return "UPCOMING";

  const { weekday, time } = viennaClock(now);
  const matchesWeekday = !Array.isArray(offer?.weekdays)
    || offer.weekdays.length === 0
    || offer.weekdays.includes(weekday);
  if (!matchesWeekday) return "NOT_CURRENT";

  if (!offer?.time_from || !offer?.time_to) return "CURRENT";
  const timeFrom = offer.time_from.slice(0, 5);
  const timeTo = offer.time_to.slice(0, 5);
  if (time < timeFrom) return "LATER_TODAY";
  if (time >= timeTo) return "NOT_CURRENT";
  return "CURRENT";
}

export function validateRestaurantOfferDraft(offer) {
  if (!offer?.title?.trim() || !offer?.shortDescription?.trim() || !offer?.branchId || !offer?.validFrom || !offer?.validTo) {
    return "REQUIRED_FIELDS";
  }
  if (new Date(offer.validTo).getTime() <= new Date(offer.validFrom).getTime()) return "INVALID_PERIOD";
  if (offer.currentPrice != null && (!Number.isFinite(offer.currentPrice) || offer.currentPrice <= 0)) return "INVALID_CURRENT_PRICE";
  if (offer.previousPrice != null && (offer.currentPrice == null || offer.previousPrice <= offer.currentPrice)) return "INVALID_PREVIOUS_PRICE";
  if (offer.offerType === "LUNCH_MENU" && (!offer.weekdays?.length || !offer.timeFrom || !offer.timeTo)) return "LUNCH_WINDOW_REQUIRED";
  if ((offer.timeFrom || offer.timeTo) && (!offer.timeFrom || !offer.timeTo || offer.timeTo <= offer.timeFrom)) return "INVALID_TIME_WINDOW";
  return null;
}

export function maximumConcurrentOffers(offers) {
  const events = offers.flatMap((offer) => [
    { at: new Date(offer.valid_from).getTime(), delta: 1 },
    { at: new Date(offer.valid_to).getTime(), delta: -1 },
  ]).sort((left, right) => left.at - right.at || left.delta - right.delta);
  let active = 0;
  let maximum = 0;
  for (const event of events) {
    active += event.delta;
    maximum = Math.max(maximum, active);
  }
  return maximum;
}

export function sortPublicOffers(offers) {
  return [...offers].sort((left, right) => {
    const typeOrder = (OFFER_TYPE_PRIORITY[left.offer_type] ?? 99) - (OFFER_TYPE_PRIORITY[right.offer_type] ?? 99);
    if (typeOrder) return typeOrder;
    return new Date(right.published_at ?? right.valid_from).getTime() - new Date(left.published_at ?? left.valid_from).getTime();
  });
}
