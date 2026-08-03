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
  X,
} from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { AppShell, EmptyState, ErrorState, LoadingState, StatusBadge } from "./components/PremiumCustomerUi";
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
import { formatRestaurantOfferPrice, recordRestaurantOfferEvent } from "../offers/restaurantOfferService";
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

function formatDistance(value: number | null) {
  if (value === null) return null;
  return value < 10 ? `${value.toLocaleString("de-AT", { maximumFractionDigits: 1 })} km entfernt` : `${Math.round(value)} km entfernt`;
}

function formatVisit(value: string | null | undefined) {
  if (!value) return "Noch kein Besuch gespeichert";
  return `Zuletzt am ${new Intl.DateTimeFormat("de-AT", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value))}`;
}

function locationAddress(location: PartnerRestaurant) {
  return [location.address, `${location.postal_code} ${location.city}`.trim()].filter(Boolean).join(", ");
}

function recommendation(location: PartnerRestaurant) {
  const membership = location.membership;
  if (membership?.available_rewards.length) return "Jetzt einlösbar";
  if (membership?.next_reward && isRewardNear(location)) return `Bald erreichbar: noch ${membership.next_reward.missing_points} Punkte bis ${membership.next_reward.title}`;
  if (membership?.next_reward) return `Noch ${membership.next_reward.missing_points} Punkte bis ${membership.next_reward.title}`;
  if (membership?.registered) return "Du bist hier Bonus-Mitglied";
  return location.welcome_reward_available ? "Willkommensgeschenk verfügbar" : `${location.active_reward_count} Punkteeinlösungen`;
}

function visitLabel(location: PartnerRestaurant) {
  if ((location.membership?.visits_count ?? 0) > 0) return "Bereits besucht";
  return "Noch nicht besucht";
}

function PartnerResultCard({ location, onSelect, selected }: { location: PartnerRestaurant; onSelect: () => void; selected: boolean }) {
  return (
    <button
      aria-pressed={selected}
      className={`partner-result-card${selected ? " selected" : ""}`}
      onClick={onSelect}
      type="button"
    >
      <span className="partner-result-logo">
        {location.logo_url ? <img alt="" loading="lazy" src={location.logo_url} /> : <Store aria-hidden="true" size={24} />}
      </span>
      <span className="partner-result-copy">
        <strong>{location.name}</strong>
        <small>{locationAddress(location)}</small>
        {formatDistance(location.distance_km) ? <small>{formatDistance(location.distance_km)}</small> : null}
        <span className="partner-result-statuses">
          <em>{visitLabel(location)}</em>
          <em className={location.opening_status?.isOpen ? "open" : "closed"}>{location.opening_status?.message}</em>
        </span>
        {location.offers[0] ? <span className="partner-offer-badge"><Newspaper aria-hidden="true" size={14} />{location.offers[0].offer_type === "LUNCH_MENU" ? "Mittagsmenü" : location.offers[0].offer_type === "WEEKLY_OFFER" ? "Wochenangebot" : "Neues Angebot"}</span> : null}
        <span>{location.membership ? `${location.membership.points_balance} Punkte · ${recommendation(location)}` : recommendation(location)}</span>
      </span>
      <ChevronRight aria-hidden="true" size={19} />
    </button>
  );
}

function PartnerDetail({ current, location, onClose }: { current: boolean; location: PartnerRestaurant; onClose: () => void }) {
  const membership = location.membership;
  const customerToken = readStoredCustomerToken(location.slug);
  const portalUrl = `/customer/${encodeURIComponent(location.slug)}${customerToken ? `?token=${encodeURIComponent(customerToken)}` : ""}`;

  return (
    <article aria-label={`Details zu ${location.name}`} className="partner-detail-card">
      <button aria-label="Restaurantdetails schließen" className="partner-detail-close" onClick={onClose} type="button"><X aria-hidden="true" size={19} /></button>
      {location.cover_image_url ? <img alt={`${location.name} Titelbild`} className="partner-detail-cover" loading="lazy" src={location.cover_image_url} /> : null}
      <div className="partner-detail-heading">
        <span className="partner-detail-logo">
          {location.logo_url ? <img alt={`${location.name} Logo`} loading="lazy" src={location.logo_url} /> : <Store aria-hidden="true" size={25} />}
        </span>
        <div><StatusBadge tone={current || membership?.registered ? "warning" : "neutral"}>{current ? "Aktueller Kontext" : (membership?.visits_count ?? 0) > 0 ? "Bereits besucht" : membership?.registered ? "Dein Bonus" : "WUXUAI Partner"}</StatusBadge><h2>{location.name}</h2><p>{locationAddress(location)}</p>{formatDistance(location.distance_km) ? <small>{formatDistance(location.distance_km)}</small> : null}</div>
      </div>
      {location.short_description ? <p className="partner-detail-description">{location.short_description}</p> : null}
      {location.opening_status ? <p className={`partner-detail-hours ${location.opening_status.isOpen ? "open" : "closed"}`}>{location.opening_status.message}{location.opening_status.todayHours && location.opening_status.message !== location.opening_status.todayHours ? ` · ${location.opening_status.todayHours}` : ""}</p> : null}
      <div className="partner-detail-stats">
        <div><span>Punkte</span><strong>{membership ? membership.points_balance : "–"}</strong></div>
        <div><span>Besuche</span><strong>{membership ? membership.visits_count : "–"}</strong></div>
        <div><span>Punkteeinlösungen</span><strong>{location.active_reward_count}</strong></div>
      </div>
      <div className="partner-recommendation">
        {membership?.available_rewards.length ? <Gift aria-hidden="true" size={21} /> : <Trophy aria-hidden="true" size={21} />}
        <div><strong>{recommendation(location)}</strong><span>{formatVisit(membership?.last_visit_at)}</span></div>
      </div>
      {membership?.available_rewards.length ? (
        <div className="partner-available-rewards">
          <span>Für dich verfügbar</span>
          {membership.available_rewards.slice(0, 3).map((reward) => <strong key={reward.id}>{reward.title}</strong>)}
        </div>
      ) : null}
      {location.offers[0] ? (
        <div className="partner-current-offer">
          <span>{location.offers[0].offer_type === "LUNCH_MENU" ? "Mittagsmenü" : "Aktuelles Angebot"}</span>
          <strong>{location.offers[0].title}</strong>
          <p>{location.offers[0].short_description}</p>
          <small>{location.offers[0].current_price != null ? `${formatRestaurantOfferPrice(location.offers[0].current_price)} · ` : ""}Gültig bis {new Date(location.offers[0].valid_to).toLocaleDateString("de-AT")}</small>
          <Link className="premium-button premium-button-secondary" onClick={() => void recordRestaurantOfferEvent(location.offers[0].id, "OFFER_CTA_CLICKED")} to={`/customer/offers?current=${encodeURIComponent(location.slug)}`}>Angebot ansehen</Link>
        </div>
      ) : null}
      {!membership ? <p className="partner-detail-note">Besuche das Restaurant und scanne dort den Bonus-QR, um Punkte zu sammeln.</p> : null}
      <div className="partner-detail-actions">
        <Link className="premium-button premium-button-primary" onClick={() => { if (location.offers[0]) void recordRestaurantOfferEvent(location.offers[0].id, "OFFER_BONUS_OPENED"); }} to={portalUrl}>Bonus öffnen</Link>
        <a className="premium-button premium-button-secondary" href={googleMapsUrl(location, "directions")} onClick={() => { if (location.offers[0]) void recordRestaurantOfferEvent(location.offers[0].id, "OFFER_ROUTE_CLICKED"); }} rel="noreferrer" target="_blank">
          <ExternalLink aria-hidden="true" size={18} /> Route starten
        </a>
      </div>
    </article>
  );
}

export function PartnerRestaurantFinderPage() {
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
          <Link aria-label="Zurück" className="partner-finder-back" to="/"><ArrowLeft aria-hidden="true" size={21} /></Link>
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
          <p aria-live="polite">{locationMessage ?? `${filteredLocations.length} von ${total} teilnehmenden Lokalen angezeigt`}</p>
        </section>

        <div aria-label="Lokale filtern" className="partner-filter-scroll" role="group">
          {partnerFilters.map((option) => (
            <button aria-pressed={filter === option.key} key={option.key} onClick={() => setFilter(option.key)} type="button">
              {option.label}
            </button>
          ))}
        </div>

        {!loading && !hasCustomerAccess ? (
          <p className="partner-customer-access-note">Melde dich an, um deine Punkte bei teilnehmenden Lokalen zu sehen.</p>
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
                  <PartnerResultCard key={location.branch_id} location={location} onSelect={() => selectLocation(location)} selected={selected?.branch_id === location.branch_id} />
                ))}
              </div>
              {selected ? <PartnerDetail current={selected.slug === currentSlug} location={selected} onClose={() => setSelectedId(null)} /> : null}
            </section>
          </div>
        ) : null}
      </main>
    </AppShell>
  );
}
