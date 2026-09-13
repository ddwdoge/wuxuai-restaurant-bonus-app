import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ChevronRight,
  ExternalLink,
  Gift,
  List,
  LocateFixed,
  Map as MapIcon,
  MapPin,
  Newspaper,
  Search,
  Store,
  Trophy,
  UserPlus,
  X,
} from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { AppDrawer } from "../../shared/components/AppDrawer";
import { AppShell, EmptyState, ErrorState, LoadingState, StatusBadge } from "./components/PremiumCustomerUi";
import { CentralCustomerNavigation } from "./components/CentralCustomerNavigation";
import { RestaurantHeroImage, RestaurantLogoImage } from "./components/RestaurantHeroImage";
import { readStoredCustomerToken } from "./customerTokenStorage";
import {
  distanceInKilometers,
  filterPartnerRestaurants,
  filterPartnerRestaurantsByCategory,
  googleMapsUrl,
  isRewardNear,
  sortPartnerRestaurants,
} from "./partnerRestaurantFinder.mjs";
import { loadPartnerRestaurants, type PartnerRestaurant } from "./partnerRestaurantService";
import { LazyPartnerRestaurantMap } from "./LazyPartnerRestaurantMap";
import { partnerOpeningStatus } from "../../shared/openingHours.mjs";
import { formatLocaleDate, formatLocaleNumber } from "../../shared/i18n/formatters.mjs";
import type { UiLanguage } from "../../shared/i18n/language.mjs";
import { useI18n } from "../../shared/i18n/I18nProvider";
import { recordRestaurantOfferEvent, restaurantOfferPricePresentation } from "../offers/restaurantOfferService";
import { customerPresentationText } from "./customerRewardPresentation.mjs";
import "./partner-restaurant-finder.css";

type FinderView = "map" | "list";
type PartnerFilter = "all" | "nearby" | "visited" | "points" | "near_reward" | "open";

const partnerFilters: Array<{ key: PartnerFilter; label: string }> = [
  { key: "all", label: "Alle Partner" },
  { key: "nearby", label: "In meiner Nähe" },
  { key: "visited", label: "Bereits besucht" },
  { key: "points", label: "Meine Punkte" },
  { key: "near_reward", label: "Belohnung bald erreichbar" },
  { key: "open", label: "Jetzt geöffnet" },
];

function formatDistance(value: number | null, language: UiLanguage) {
  if (value === null) return null;
  const distance = formatLocaleNumber(value < 10 ? value : Math.round(value), language, { maximumFractionDigits: value < 10 ? 1 : 0 });
  return customerPresentationText("finderDistance", language, { distance });
}

function formatVisit(value: string | null | undefined, language: UiLanguage) {
  if (!value) return customerPresentationText("finderNoVisit", language);
  const date = formatLocaleDate(value, language, { day: "2-digit", month: "2-digit", year: "numeric" });
  return customerPresentationText("finderLastVisit", language, { date });
}

function openingStatusPresentation(status: NonNullable<PartnerRestaurant["opening_status"]>, language: UiLanguage) {
  const messageTimes = status.message.match(/\d{2}:\d{2}/g) ?? [];
  const todayTimes = status.todayHours?.match(/\d{2}:\d{2}/g) ?? [];
  const message = status.state === "unknown"
    ? customerPresentationText("openingUnavailable", language)
    : status.state === "opens_later" && messageTimes[0]
      ? customerPresentationText("openingOpensAt", language, { time: messageTimes[0] })
      : status.state === "lunch_break" && messageTimes[0]
        ? customerPresentationText("openingLunchBreakUntil", language, { time: messageTimes[0] })
        : status.state === "open" && messageTimes[0]
          ? customerPresentationText("openingOpenUntil", language, { time: messageTimes[0] })
          : status.state === "closed"
            ? customerPresentationText("openingTodayClosed", language)
            : status.message;
  const todayHours = !status.todayHours
    ? null
    : todayTimes.length === 4
      ? customerPresentationText("openingTodaySplit", language, {
          open: todayTimes[0],
          close: todayTimes[1],
          secondOpen: todayTimes[2],
          secondClose: todayTimes[3],
        })
      : todayTimes.length === 2
        ? customerPresentationText("openingTodaySingle", language, { open: todayTimes[0], close: todayTimes[1] })
        : customerPresentationText("openingTodayClosed", language);
  return { message, todayHours };
}

function locationAddress(location: PartnerRestaurant) {
  return [location.address, `${location.postal_code} ${location.city}`.trim()].filter(Boolean).join(", ");
}

function recommendation(location: PartnerRestaurant, language: UiLanguage) {
  const membership = location.membership;
  if (membership?.available_rewards.length) return customerPresentationText("nowRedeemable", language);
  if (membership?.next_reward && isRewardNear(location)) return customerPresentationText("finderNearReward", language, {
    count: membership.next_reward.missing_points,
    title: membership.next_reward.title,
  });
  if (membership?.next_reward) return customerPresentationText("nextRewardPoints", language, {
    count: membership.next_reward.missing_points,
    title: membership.next_reward.title,
  });
  if (membership?.registered) return customerPresentationText("finderBonusMember", language);
  return location.welcome_reward_available
    ? customerPresentationText("finderWelcomeAvailable", language)
    : customerPresentationText("finderRewardsAvailable", language, { count: location.active_reward_count });
}

function visitLabel(location: PartnerRestaurant, language: UiLanguage) {
  if ((location.membership?.visits_count ?? 0) > 0) return customerPresentationText("finderVisited", language);
  return customerPresentationText("finderNotVisited", language);
}

function PartnerResultCard({ language, location, onSelect, selected }: { language: UiLanguage; location: PartnerRestaurant; onSelect: () => void; selected: boolean }) {
  const opening = location.opening_status ? openingStatusPresentation(location.opening_status, language) : null;
  return (
    <button
      aria-pressed={selected}
      className={`partner-result-card${selected ? " selected" : ""}`}
      onClick={onSelect}
      type="button"
    >
      <RestaurantLogoImage alt="" className="partner-result-logo" logoUrl={location.logo_url} name={location.name} />
      <span className="partner-result-copy">
        <strong data-i18n-skip="true">{location.name}</strong>
        <small data-i18n-skip="true">{locationAddress(location)}</small>
        {formatDistance(location.distance_km, language) ? <small>{formatDistance(location.distance_km, language)}</small> : null}
        <span className="partner-result-statuses">
          <em>{visitLabel(location, language)}</em>
          <em className={location.opening_status?.isOpen ? "open" : "closed"}>{opening?.message}</em>
        </span>
        {location.offers[0] ? <span className="partner-offer-badge"><Newspaper aria-hidden="true" size={14} />{location.offers[0].offer_type === "LUNCH_MENU" ? "Mittagsmenü" : location.offers[0].offer_type === "WEEKLY_OFFER" ? "Wochenangebot" : "Neues Angebot"}</span> : null}
        <span>{location.membership ? `${customerPresentationText("points", language, { count: location.membership.points_balance })} · ${recommendation(location, language)}` : recommendation(location, language)}</span>
      </span>
      <ChevronRight aria-hidden="true" size={19} />
    </button>
  );
}

function PartnerDetail({ current, language, location, onClose }: { current: boolean; language: UiLanguage; location: PartnerRestaurant; onClose: () => void }) {
  const text = (key: string, parameters?: Record<string, string | number>) => customerPresentationText(key, language, parameters);
  const membership = location.membership;
  const isMember = membership?.registered === true;
  const customerToken = readStoredCustomerToken(location.slug);
  const portalUrl = `/customer/${encodeURIComponent(location.slug)}${customerToken ? `?token=${encodeURIComponent(customerToken)}` : ""}`;
  const currentOffer = location.offers[0];
  const currentOfferPrice = currentOffer
    ? restaurantOfferPricePresentation(currentOffer.current_price, currentOffer.previous_price)
    : null;
  const opening = location.opening_status ? openingStatusPresentation(location.opening_status, language) : null;

  return (
    <article aria-label={text("detailAria", { name: location.name })} className="partner-detail-card">
      <button aria-label={text("detailClose")} className="partner-detail-close" onClick={onClose} type="button"><X aria-hidden="true" size={19} /></button>
      <RestaurantHeroImage
        coverAlt={text("detailCoverAlt", { name: location.name })}
        coverUnavailableLabel={text("detailCoverUnavailable", { name: location.name })}
        coverImageUrl={location.cover_image_url}
        logoAlt={text("detailLogoAlt", { name: location.name })}
        logoUrl={location.logo_url}
        name={location.name}
        presentation={{
          zoom: location.cover_image_zoom ?? 1,
          positionX: location.cover_image_position_x ?? 0.5,
          positionY: location.cover_image_position_y ?? 0.5,
        }}
      />
      <div className="partner-detail-heading">
        <RestaurantLogoImage alt={`${location.name} Logo`} className="partner-detail-logo" logoUrl={location.logo_url} name={location.name} />
        <div><StatusBadge tone={current || isMember ? "warning" : "neutral"}>{current ? text("mapCurrentContext") : (membership?.visits_count ?? 0) > 0 ? text("finderVisited") : isMember ? text("detailMember") : text("detailNoMember")}</StatusBadge><h2 data-i18n-skip="true">{location.name}</h2><p data-i18n-skip="true">{locationAddress(location)}</p>{formatDistance(location.distance_km, language) ? <small>{formatDistance(location.distance_km, language)}</small> : null}</div>
      </div>
      {location.short_description ? <p className="partner-detail-description" data-i18n-skip="true">{location.short_description}</p> : null}
      {location.opening_status ? <p className={`partner-detail-hours ${location.opening_status.isOpen ? "open" : "closed"}`}>{opening?.message}{opening?.todayHours && opening.message !== opening.todayHours ? ` · ${opening.todayHours}` : ""}</p> : null}
      <div className="partner-detail-stats">
        <div><span>{text("detailPoints")}</span><strong>{membership ? membership.points_balance : "–"}</strong></div>
        <div><span>{text("detailVisits")}</span><strong>{membership ? membership.visits_count : "–"}</strong></div>
        <div><span>{text("detailRewards")}</span><strong>{location.active_reward_count}</strong></div>
      </div>
      <div className="partner-recommendation">
        {membership?.available_rewards.length ? <Gift aria-hidden="true" size={21} /> : <Trophy aria-hidden="true" size={21} />}
        <div><strong>{recommendation(location, language)}</strong><span>{formatVisit(membership?.last_visit_at, language)}</span></div>
      </div>
      {membership?.available_rewards.length ? (
        <div className="partner-available-rewards">
          <span>{text("detailAvailable")}</span>
          {membership.available_rewards.slice(0, 3).map((reward) => <strong data-i18n-skip="true" key={reward.id}>{reward.title}</strong>)}
        </div>
      ) : null}
      <div className="partner-detail-actions">
        <Link className="premium-button premium-button-primary" onClick={() => { if (location.offers[0]) void recordRestaurantOfferEvent(location.offers[0].id, "OFFER_BONUS_OPENED"); }} to={portalUrl}>
          {isMember ? <><Store aria-hidden="true" size={18} /> {text("detailOpen")}</> : <><UserPlus aria-hidden="true" size={18} /> {text("detailJoin")}</>}
        </Link>
        <a className="premium-button premium-button-secondary" href={googleMapsUrl(location, "directions")} onClick={() => { if (location.offers[0]) void recordRestaurantOfferEvent(location.offers[0].id, "OFFER_ROUTE_CLICKED"); }} rel="noreferrer" target="_blank">
          <ExternalLink aria-hidden="true" size={18} /> {text("detailDirections")}
        </a>
      </div>
      {currentOffer ? (
        <div className="partner-current-offer">
          <span>{currentOffer.offer_type === "LUNCH_MENU" ? text("offerType.LUNCH_MENU") : text("detailCurrentOffer")}</span>
          <strong data-i18n-skip="true">{currentOffer.title}</strong>
          <p data-i18n-skip="true">{currentOffer.short_description}</p>
          <small className="partner-current-offer-price">{currentOfferPrice?.discountLabel ? <b>{currentOfferPrice.discountLabel}</b> : null}{currentOfferPrice?.previousPrice ? <del>{currentOfferPrice.previousPrice}</del> : null}{currentOfferPrice?.currentPrice ? <strong>{currentOfferPrice.currentPrice}</strong> : null}<span>{customerPresentationText("validUntil", language)} {formatLocaleDate(currentOffer.valid_to, language)}</span></small>
          <Link className="premium-button premium-button-secondary" onClick={() => void recordRestaurantOfferEvent(currentOffer.id, "OFFER_CTA_CLICKED")} to={`/customer/${encodeURIComponent(location.slug)}/offers`}>{text("detailOfferView")}</Link>
        </div>
      ) : null}
      {!isMember ? <p className="partner-detail-note">{text("detailJoinNote")}</p> : null}
    </article>
  );
}

export function PartnerRestaurantFinderPage() {
  const { language } = useI18n();
  const [searchParams] = useSearchParams();
  const currentSlug = searchParams.get("current");
  const [locations, setLocations] = useState<PartnerRestaurant[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<PartnerFilter>("all");
  const [view, setView] = useState<FinderView>("map");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationMessage, setLocationMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasCustomerAccess, setHasCustomerAccess] = useState(false);
  const [total, setTotal] = useState(0);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await loadPartnerRestaurants();
      setLocations(result.locations);
      setHasCustomerAccess(result.hasCustomerAccess);
      setTotal(result.total);
      setSelectedId((current) => {
        if (current && result.locations.some((item) => item.branch_id === current)) return current;
        return result.locations.find((item) => item.slug === currentSlug)?.branch_id ?? null;
      });
    } catch {
      setLocations([]);
      setSelectedId(null);
      setHasCustomerAccess(false);
      setTotal(0);
      setError("Partnerrestaurants konnten gerade nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, [currentSlug]);

  useEffect(() => { void reload(); }, [reload]);

  const filteredLocations = useMemo(() => {
    const matches = filterPartnerRestaurants(locations, query).map((location) => ({
      ...location,
      distance_km: userLocation ? distanceInKilometers(userLocation, location) : null,
      opening_status: partnerOpeningStatus(location.opening_hours, new Date(), location.special_days, location.holidays),
    }));
    return sortPartnerRestaurants(filterPartnerRestaurantsByCategory(matches, filter));
  }, [filter, locations, query, userLocation]);

  const selected = selectedId ? filteredLocations.find((location) => location.branch_id === selectedId) ?? null : null;
  const detailOpenInDrawer = Boolean(selected);

  function requestLocation() {
    setLocationMessage("Dein Standort wird nur für diese Suche verwendet.");
    if (!("geolocation" in navigator)) {
      setLocationMessage("Die Standortsuche wird von diesem Browser nicht unterstützt.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude });
        setFilter("nearby");
        setLocationMessage("Restaurants werden nach deiner Nähe sortiert.");
      },
      () => setLocationMessage("Standort nicht freigegeben. Die Ortssuche bleibt verfügbar."),
      { enableHighAccuracy: false, maximumAge: 300_000, timeout: 10_000 },
    );
  }

  function selectLocation(location: PartnerRestaurant) {
    setSelectedId(location.branch_id);
  }

  return (
    <AppShell>
      <main className="partner-finder-shell">
        <header className="partner-finder-header">
          <Link aria-label="Zurück" className="partner-finder-back" to="/customer"><ArrowLeft aria-hidden="true" size={21} /></Link>
          <div><span>WUXUAI Bonus</span><h1>Lokale entdecken</h1></div>
          <MapPin aria-hidden="true" size={24} />
        </header>
        <div className="partner-finder-intro">
          <p>Finde teilnehmende Lokale in deiner Nähe und sieh, wo du bereits Punkte gesammelt hast.</p>
          <small>Punkte und Punkteeinlösungen werden für jedes Lokal getrennt geführt.</small>
        </div>

        <section className="partner-finder-controls" aria-label="Restaurantsuche">
          <label className="partner-search-field">
            <Search aria-hidden="true" size={20} />
            <span className="visually-hidden">Restaurant, Ort, Postleitzahl oder Adresse suchen</span>
            <input onChange={(event) => setQuery(event.target.value)} placeholder="Restaurant, Ort oder PLZ" type="search" value={query} />
          </label>
          <button className="partner-location-button" onClick={requestLocation} type="button"><LocateFixed aria-hidden="true" size={19} /> In meiner Nähe</button>
          <div className="partner-view-toggle" aria-label="Darstellung wählen">
            <button aria-pressed={view === "map"} onClick={() => setView("map")} type="button"><MapIcon aria-hidden="true" size={18} /> Karte</button>
            <button aria-pressed={view === "list"} onClick={() => setView("list")} type="button"><List aria-hidden="true" size={18} /> Liste</button>
          </div>
          <p aria-live="polite">{locationMessage ?? customerPresentationText("finderResults", language, { shown: filteredLocations.length, total })}</p>
        </section>

        <div aria-label="Lokale filtern" className="partner-filter-scroll" role="group">
          {partnerFilters.map((option) => (
            <button aria-pressed={filter === option.key} key={option.key} onClick={() => setFilter(option.key)} type="button">
              {option.label}
            </button>
          ))}
        </div>

        {!loading && !hasCustomerAccess ? (
          <p className="partner-customer-access-note">Wähle ein Lokal und tritt dem Bonusprogramm direkt bei.</p>
        ) : null}

        {loading ? <LoadingState description="Partnerrestaurants werden geladen …" /> : null}
        {!loading && error ? <ErrorState action={<button className="premium-button premium-button-secondary" onClick={() => void reload()} type="button">Erneut versuchen</button>} description={error} title="Restaurantsuche nicht verfügbar" /> : null}
        {!loading && !error && filteredLocations.length === 0 ? (
          <EmptyState description="In diesem Gebiet gibt es derzeit noch keine teilnehmenden Restaurants." title="Keine teilnehmenden Lokale gefunden" />
        ) : null}

        {!loading && !error && filteredLocations.length ? (
          <div className={`partner-finder-content view-${view}`}>
            <section className="partner-map-panel" aria-label="Karte der Partnerrestaurants">
              <LazyPartnerRestaurantMap
                currentSlug={currentSlug}
                errorFallback={(
                  <div className="partner-map-fallback" role="status">
                    <p>Die Karte konnte nicht geladen werden. Alle Partnerrestaurants bleiben in der Liste verfügbar.</p>
                    <button className="premium-button premium-button-secondary" onClick={() => setView("list")} type="button">Liste anzeigen</button>
                  </div>
                )}
                locations={filteredLocations}
                onSelect={selectLocation}
                selectedId={selected?.branch_id ?? null}
                userLocation={userLocation}
              />
            </section>
            <section className="partner-list-panel" aria-label="Liste der Partnerrestaurants">
              <div className="partner-results-list">
                {filteredLocations.map((location) => (
                  <PartnerResultCard key={location.branch_id} language={language} location={location} onSelect={() => selectLocation(location)} selected={selected?.branch_id === location.branch_id} />
                ))}
              </div>
            </section>
          </div>
        ) : null}
      </main>
      <CentralCustomerNavigation />
      <AppDrawer
        closeLabel={customerPresentationText("close", language)}
        description={customerPresentationText("restaurantDetailDescription", language)}
        className="partner-detail-responsive-drawer"
        onClose={() => setSelectedId(null)}
        open={detailOpenInDrawer}
        size="large"
        title={customerPresentationText("detailTitle", language)}
      >
        {selected ? (
          <div className="partner-detail-drawer-content">
            <PartnerDetail current={selected.slug === currentSlug} language={language} location={selected} onClose={() => setSelectedId(null)} />
          </div>
        ) : null}
      </AppDrawer>
    </AppShell>
  );
}
