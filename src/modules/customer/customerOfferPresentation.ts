import type { RestaurantOffer, restaurantOfferValidityPresentation } from "../offers/restaurantOfferService";
import { UI_LOCALE_TAGS, normalizeUiLanguage } from "../../shared/i18n/language.mjs";
import { customerPresentationText } from "./customerRewardPresentation.mjs";

// Customer copy only. State/tone, visibility and prices remain owned by the
// existing offer service. Never translate stored restaurant prose.
export function customerOfferPresentation(
  offer: RestaurantOffer,
  language: string,
  validity: ReturnType<typeof restaurantOfferValidityPresentation>,
) {
  const locale = UI_LOCALE_TAGS[normalizeUiLanguage(language) || "en"];
  const text = (key: string, parameters = {}) => customerPresentationText(key, language, parameters);
  const date = (value: string) => new Intl.DateTimeFormat(locale, {
    day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Vienna",
  }).format(new Date(value));
  const weekdays = (offer.weekdays ?? []).filter(day => day >= 1 && day <= 7);
  const weekday = (day: number) => new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" })
    .format(new Date(Date.UTC(2024, 0, day))); // 2024-01-01 is Monday.
  const days = weekdays.length ? weekdays.map(weekday).join(", ") : text("offerDaily");
  const from = offer.time_from?.slice(0, 5) ?? "";
  const to = offer.time_to?.slice(0, 5) ?? "";
  const schedule = from && to ? text("offerTime", { days, from, to })
    : weekdays.length ? days : text("offerWholePeriod");
  const status = validity.state === "CURRENT" ? text("offerCurrent")
    : validity.state === "LATER_TODAY" ? text("offerToday", { from, to })
    : validity.state === "UPCOMING" ? text("offerFrom", { date: date(offer.valid_from) })
    : validity.state === "EXPIRED" ? text("expired") : text("offerNotCurrent");
  return { type: text(`offerType.${offer.offer_type}`), status, schedule,
    period: `${date(offer.valid_from)}–${date(offer.valid_to)}` };
}
