import { supabase } from "../../shared/lib/supabase";
import {
  calculateOfferDiscountPercentage,
  getOfferValidityState,
  isPublicOfferVisible,
  type OfferValidityState,
} from "./restaurantOffers.mjs";

export const restaurantOfferTypes = [
  "WEEKLY_OFFER",
  "MONTHLY_OFFER",
  "LUNCH_MENU",
  "NEW_DISH",
  "SEASONAL_OFFER",
  "EVENT",
  "NEWS",
] as const;

export type RestaurantOfferType = (typeof restaurantOfferTypes)[number];
export type RestaurantOfferStatus = "DRAFT" | "PUBLISHED" | "DISABLED" | "ARCHIVED";
export type RestaurantOfferEvent = "OFFER_VIEWED" | "OFFER_CTA_CLICKED" | "OFFER_ROUTE_CLICKED" | "OFFER_BONUS_OPENED";

export type RestaurantOffer = {
  id: string;
  restaurant_id: string;
  branch_id: string;
  branch_name?: string | null;
  restaurant_name?: string;
  restaurant_slug?: string;
  offer_type: RestaurantOfferType;
  title: string;
  short_description: string;
  description: string | null;
  image_url: string | null;
  image_zoom?: number | null;
  image_position_x?: number | null;
  image_position_y?: number | null;
  image_aspect_ratio?: string | null;
  image_crop_version?: number | null;
  current_price: number | null;
  previous_price: number | null;
  currency: "EUR";
  valid_from: string;
  valid_to: string;
  weekdays: number[] | null;
  time_from: string | null;
  time_to: string | null;
  button_label: string;
  status: RestaurantOfferStatus;
  is_active: boolean;
  published_at: string | null;
  published_by?: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  views?: number;
  clicks?: number;
};

export type RestaurantOfferBranch = {
  id: string;
  name: string;
  status: string;
};

export type RestaurantOfferEmailSummary = {
  available: boolean;
  provider_status: "NOT_CONFIGURED" | "STAGING_ONLY" | "ACTIVE" | "PAUSED";
  confirmed_recipients: number;
  weekly_recipients: number;
  monthly_recipients: number;
  sent: number;
  delivered: number;
  bounces: number;
  withdrawn: number;
  last_sent_at: string | null;
  next_weekly_period: string;
  next_monthly_period: string;
};

export type RestaurantOfferInput = {
  id?: string | null;
  restaurantId: string;
  branchId: string;
  offerType: RestaurantOfferType;
  title: string;
  shortDescription: string;
  description?: string | null;
  imageUrl?: string | null;
  imageZoom?: number | null;
  imagePositionX?: number | null;
  imagePositionY?: number | null;
  currentPrice?: number | null;
  previousPrice?: number | null;
  validFrom: string;
  validTo: string;
  weekdays?: number[] | null;
  timeFrom?: string | null;
  timeTo?: string | null;
  buttonLabel?: string | null;
};

export const restaurantOfferTypeLabels: Record<RestaurantOfferType, string> = {
  WEEKLY_OFFER: "Wochenangebot",
  MONTHLY_OFFER: "Monatsangebot",
  LUNCH_MENU: "Mittagsmenü",
  NEW_DISH: "Neues Gericht",
  SEASONAL_OFFER: "Saisonangebot",
  EVENT: "Veranstaltung",
  NEWS: "Neuigkeit",
};

const offerWeekdayLabels = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

function formatOfferDate(value: string) {
  return new Intl.DateTimeFormat("de-AT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Europe/Vienna",
  }).format(new Date(value));
}

export function formatRestaurantOfferSchedule(offer: RestaurantOffer) {
  const weekdays = offer.weekdays ?? [];
  let weekdayText = "Täglich";
  if (weekdays.join(",") === "1,2,3,4,5") weekdayText = "Mo–Fr";
  else if (weekdays.join(",") === "6,7") weekdayText = "Sa–So";
  else if (weekdays.length > 0) weekdayText = weekdays.map((day) => offerWeekdayLabels[day - 1]).filter(Boolean).join(", ");

  if (offer.time_from && offer.time_to) {
    return `${weekdayText} · ${offer.time_from.slice(0, 5)}–${offer.time_to.slice(0, 5)} Uhr`;
  }
  return weekdays.length > 0 ? weekdayText : "Während des gesamten Angebotszeitraums";
}

export function formatRestaurantOfferPeriod(offer: RestaurantOffer) {
  return `${formatOfferDate(offer.valid_from)}–${formatOfferDate(offer.valid_to)}`;
}

export function restaurantOfferValidityPresentation(offer: RestaurantOffer, now = new Date()): {
  state: OfferValidityState;
  label: string;
  tone: "current" | "upcoming" | "not-current" | "expired";
} {
  const state = getOfferValidityState(offer, now);
  if (state === "CURRENT") return { state, label: "Jetzt gültig", tone: "current" };
  if (state === "LATER_TODAY" && offer.time_from && offer.time_to) {
    return { state, label: `Heute ${offer.time_from.slice(0, 5)}–${offer.time_to.slice(0, 5)} Uhr`, tone: "upcoming" };
  }
  if (state === "UPCOMING") return { state, label: `Gültig ab ${formatOfferDate(offer.valid_from)}`, tone: "upcoming" };
  if (state === "EXPIRED") return { state, label: "Abgelaufen", tone: "expired" };
  return { state, label: "Heute nicht gültig", tone: "not-current" };
}

export function restaurantOfferCustomerVisibility(offer: RestaurantOffer, now = new Date()) {
  return isPublicOfferVisible(offer, now) ? "Sichtbar" : "Nicht sichtbar";
}

function requireClient() {
  if (!supabase) throw new Error("Live-Daten sind gerade nicht verfügbar.");
  return supabase;
}

function offerError(error: { message?: string } | null) {
  const message = error?.message ?? "";
  if (message.includes("OFFER_ACTIVE_LIMIT_REACHED")) return new Error("Du kannst maximal fünf Angebote gleichzeitig veröffentlichen.");
  if (message.includes("OFFER_ACCESS_DENIED")) return new Error("Du darfst Angebote für dieses Restaurant nicht verwalten.");
  if (message.includes("OFFER_BRANCH")) return new Error("Bitte wähle den Standort dieses Restaurants aus.");
  if (message.includes("OFFER_LUNCH_WINDOW_REQUIRED")) return new Error("Für ein Mittagsmenü werden mindestens ein Wochentag und ein Zeitfenster benötigt.");
  if (message.includes("OFFER_PERIOD_EXPIRED")) return new Error("Der gewählte Zeitraum ist bereits abgelaufen.");
  if (message.includes("restaurant_offers_previous_price")) return new Error("Der vorherige Preis muss über dem aktuellen Preis liegen.");
  return new Error("Das Angebot konnte gerade nicht gespeichert werden. Bitte versuche es erneut.");
}

function offerLoadError() {
  return new Error("Angebote konnten nicht geladen werden.");
}

export async function loadRestaurantOffers(restaurantId: string): Promise<RestaurantOffer[]> {
  const { data, error } = await requireClient().rpc("list_restaurant_offers", { input_restaurant_id: restaurantId });
  if (error) throw offerLoadError();
  return Array.isArray(data) ? data as RestaurantOffer[] : [];
}

export async function loadRestaurantOfferBranches(restaurantId: string): Promise<RestaurantOfferBranch[]> {
  const { data, error } = await requireClient()
    .from("branches")
    .select("id, name, status")
    .eq("restaurant_id", restaurantId)
    .eq("status", "active")
    .order("created_at", { ascending: true });
  if (error) throw offerLoadError();
  return (data ?? []) as RestaurantOfferBranch[];
}

export async function loadRestaurantOfferEmailSummary(restaurantId: string): Promise<RestaurantOfferEmailSummary> {
  const { data, error } = await requireClient().rpc("get_restaurant_offer_email_summary", {
    input_restaurant_id: restaurantId,
  });
  if (error) throw new Error("Der E-Mail-Status konnte gerade nicht geladen werden.");
  return data as RestaurantOfferEmailSummary;
}

export async function saveRestaurantOffer(input: RestaurantOfferInput): Promise<RestaurantOffer> {
  const { data, error } = await requireClient().rpc("save_restaurant_offer", {
    input_restaurant_id: input.restaurantId,
    input_offer_id: input.id ?? null,
    input_branch_id: input.branchId,
    input_offer_type: input.offerType,
    input_title: input.title,
    input_short_description: input.shortDescription,
    input_description: input.description ?? null,
    input_image_url: input.imageUrl ?? null,
    input_current_price: input.currentPrice ?? null,
    input_previous_price: input.previousPrice ?? null,
    input_valid_from: input.validFrom,
    input_valid_to: input.validTo,
    input_weekdays: input.weekdays ?? null,
    input_time_from: input.timeFrom ?? null,
    input_time_to: input.timeTo ?? null,
    input_button_label: input.buttonLabel || "Angebot ansehen",
  });
  if (error) throw offerError(error);
  const saved = data as RestaurantOffer;
  if (input.imageUrl && input.imageZoom != null && input.imagePositionX != null && input.imagePositionY != null) {
    const { data: presented, error: presentationError } = await requireClient().rpc("save_restaurant_offer_image_presentation", {
      input_restaurant_id: input.restaurantId,
      input_offer_id: saved.id,
      input_image_zoom: input.imageZoom,
      input_image_position_x: input.imagePositionX,
      input_image_position_y: input.imagePositionY,
    });
    if (presentationError) throw offerError(presentationError);
    return presented as RestaurantOffer;
  }
  return saved;
}

export async function changeRestaurantOfferStatus(
  restaurantId: string,
  offerId: string,
  action: "PUBLISH" | "DISABLE" | "ARCHIVE",
): Promise<RestaurantOffer> {
  const { data, error } = await requireClient().rpc("change_restaurant_offer_status", {
    input_restaurant_id: restaurantId,
    input_offer_id: offerId,
    input_action: action,
  });
  if (error) throw offerError(error);
  return data as RestaurantOffer;
}

export async function duplicateRestaurantOffer(restaurantId: string, offerId: string): Promise<RestaurantOffer> {
  const { data, error } = await requireClient().rpc("duplicate_restaurant_offer", {
    input_restaurant_id: restaurantId,
    input_offer_id: offerId,
  });
  if (error) throw offerError(error);
  return data as RestaurantOffer;
}

export async function deleteRestaurantOfferDraft(restaurantId: string, offerId: string) {
  const { error } = await requireClient().rpc("delete_restaurant_offer_draft", {
    input_restaurant_id: restaurantId,
    input_offer_id: offerId,
  });
  if (error) throw offerError(error);
}

export async function loadPublicRestaurantOffers(restaurantSlug?: string | null, limit = 20): Promise<RestaurantOffer[]> {
  const { data, error } = await requireClient().rpc("get_public_restaurant_offers", {
    input_restaurant_slug: restaurantSlug || null,
    input_limit: limit,
  });
  if (error) throw new Error("Aktuelles konnte gerade nicht geladen werden.");
  return Array.isArray(data) ? data as RestaurantOffer[] : [];
}

export async function recordRestaurantOfferEvent(offerId: string, eventType: RestaurantOfferEvent) {
  const client = supabase;
  if (!client) return;
  await client.rpc("record_public_restaurant_offer_event", {
    input_offer_id: offerId,
    input_event_type: eventType,
  });
}

export function restaurantOfferDisplayStatus(offer: RestaurantOffer, now = new Date()) {
  if (offer.status === "ARCHIVED") return "Archiviert";
  if (offer.status === "DISABLED" || !offer.is_active) return offer.status === "DRAFT" ? "Entwurf" : "Deaktiviert";
  if (new Date(offer.valid_to).getTime() <= now.getTime()) return "Abgelaufen";
  return "Veröffentlicht";
}

export function formatRestaurantOfferPrice(value: number | null | undefined) {
  if (value == null) return null;
  return new Intl.NumberFormat("de-AT", { style: "currency", currency: "EUR" }).format(Number(value));
}

export function restaurantOfferPricePresentation(
  currentPrice: number | null | undefined,
  previousPrice: number | null | undefined,
) {
  const discountPercentage = calculateOfferDiscountPercentage(currentPrice, previousPrice);
  return {
    currentPrice: formatRestaurantOfferPrice(currentPrice),
    previousPrice: discountPercentage == null ? null : formatRestaurantOfferPrice(previousPrice),
    discountPercentage,
    discountLabel: discountPercentage == null ? null : `-${discountPercentage}%`,
  };
}
