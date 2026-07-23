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
  Search,
  Store,
  Trophy,
} from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { AppShell, EmptyState, ErrorState, LoadingState, StatusBadge } from "./components/PremiumCustomerUi";
import { readStoredCustomerToken } from "./customerTokenStorage";
import {
  distanceInKilometers,
  filterPartnerRestaurants,
  googleMapsUrl,
  sortPartnerRestaurants,
} from "./partnerRestaurantFinder.mjs";
import { loadPartnerRestaurants, type PartnerRestaurant } from "./partnerRestaurantService";
import { PartnerRestaurantMap } from "./PartnerRestaurantMap";
import "./partner-restaurant-finder.css";

type FinderView = "map" | "list";

function formatDistance(value: number | null) {
  if (value === null) return null;
  return value < 10 ? `${value.toLocaleString("de-AT", { maximumFractionDigits: 1 })} km entfernt` : `${Math.round(value)} km entfernt`;
}

function formatVisit(value: string | null | undefined) {
  if (!value) return "Noch kein Besuch gespeichert";
  return `Zuletzt am ${new Intl.DateTimeFormat("de-AT", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value))}`;
}

const openingDayKeys = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

function todayOpeningHours(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const hours = value as Record<string, { enabled?: boolean; open?: string; close?: string }>;
  const day = hours[openingDayKeys[new Date().getDay()]];
  if (!day?.enabled) return "Heute geschlossen";
  if (!day.open || !day.close) return null;
  return `Heute ${day.open}–${day.close} Uhr`;
}

function locationAddress(location: PartnerRestaurant) {
  return [location.address, `${location.postal_code} ${location.city}`.trim()].filter(Boolean).join(", ");
}

function recommendation(location: PartnerRestaurant) {
  const membership = location.membership;
  if (membership?.available_rewards.length) return "Jetzt einlösbar";
  if (membership?.next_reward) return `Nur noch ${membership.next_reward.missing_points} Punkte bis ${membership.next_reward.title}`;
  if (membership?.registered) return "Du bist hier Bonus-Mitglied";
  return location.welcome_reward_available ? "Willkommensgeschenk verfügbar" : `${location.active_reward_count} Punkteeinlösungen`;
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
        {location.logo_url ? <img alt="" src={location.logo_url} /> : <Store aria-hidden="true" size={24} />}
      </span>
      <span className="partner-result-copy">
        <strong>{location.name}</strong>
        <small>{locationAddress(location)}</small>
        <span>{formatDistance(location.distance_km) ?? recommendation(location)}</span>
      </span>
      <ChevronRight aria-hidden="true" size={19} />
    </button>
  );
}

function PartnerDetail({ current, location }: { current: boolean; location: PartnerRestaurant }) {
  const membership = location.membership;
  const customerToken = readStoredCustomerToken(location.slug);
  const portalUrl = `/customer/${encodeURIComponent(location.slug)}${customerToken ? `?token=${encodeURIComponent(customerToken)}` : ""}`;

  return (
    <article className="partner-detail-card">
      {location.cover_image_url ? <img alt={`${location.name} Titelbild`} className="partner-detail-cover" src={location.cover_image_url} /> : null}
      <div className="partner-detail-heading">
        <span className="partner-detail-logo">
          {location.logo_url ? <img alt={`${location.name} Logo`} src={location.logo_url} /> : <Store aria-hidden="true" size={25} />}
        </span>
        <div><StatusBadge tone={current || membership?.registered ? "warning" : "neutral"}>{current ? "Aktueller Kontext" : membership?.registered ? "Dein Restaurant" : "WUXUAI Partner"}</StatusBadge><h2>{location.name}</h2><p>{locationAddress(location)}</p></div>
      </div>
      {location.short_description ? <p className="partner-detail-description">{location.short_description}</p> : null}
      {todayOpeningHours(location.opening_hours) ? <p className="partner-detail-hours">{todayOpeningHours(location.opening_hours)}</p> : null}
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
      {!membership ? <p className="partner-detail-note">Besuche das Restaurant und scanne dort den Bonus-QR, um Punkte zu sammeln.</p> : null}
      <div className="partner-detail-actions">
        <Link className="premium-button premium-button-primary" to={portalUrl}>Restaurant ansehen</Link>
        <a className="premium-button premium-button-secondary" href={googleMapsUrl(location, "directions")} rel="noreferrer" target="_blank">
          <ExternalLink aria-hidden="true" size={18} /> In Google Maps öffnen
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
  const [view, setView] = useState<FinderView>("map");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationMessage, setLocationMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const nextLocations = await loadPartnerRestaurants();
      setLocations(nextLocations);
      setSelectedId((current) => current && nextLocations.some((item) => item.branch_id === current) ? current : nextLocations[0]?.branch_id ?? null);
    } catch {
      setLocations([]);
      setSelectedId(null);
      setError("Partnerrestaurants konnten gerade nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  const filteredLocations = useMemo(() => {
    const matches = filterPartnerRestaurants(locations, query).map((location) => ({
      ...location,
      distance_km: userLocation ? distanceInKilometers(userLocation, location) : null,
    }));
    return sortPartnerRestaurants(matches);
  }, [locations, query, userLocation]);

  const selected = filteredLocations.find((location) => location.branch_id === selectedId) ?? filteredLocations[0] ?? null;

  function requestLocation() {
    setLocationMessage("Dein Standort wird nur für diese Suche verwendet.");
    if (!("geolocation" in navigator)) {
      setLocationMessage("Die Standortsuche wird von diesem Browser nicht unterstützt.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude });
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
          <div><span>WUXUAI Bonus</span><h1>Restaurants entdecken</h1></div>
          <MapPin aria-hidden="true" size={24} />
        </header>

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
          <p aria-live="polite">{locationMessage ?? `${filteredLocations.length} Partnerrestaurant${filteredLocations.length === 1 ? "" : "s"} gefunden`}</p>
        </section>

        {loading ? <LoadingState description="Partnerrestaurants werden geladen …" /> : null}
        {!loading && error ? <ErrorState action={<button className="premium-button premium-button-secondary" onClick={() => void reload()} type="button">Erneut versuchen</button>} description={error} title="Restaurantsuche nicht verfügbar" /> : null}
        {!loading && !error && filteredLocations.length === 0 ? (
          <EmptyState description="In diesem Gebiet gibt es derzeit noch keine teilnehmenden Restaurants." title="Keine Partnerrestaurants gefunden" />
        ) : null}

        {!loading && !error && filteredLocations.length ? (
          <div className={`partner-finder-content view-${view}`}>
            <section className="partner-map-panel" aria-label="Karte der Partnerrestaurants">
              <PartnerRestaurantMap currentSlug={currentSlug} locations={filteredLocations} onSelect={selectLocation} selectedId={selected?.branch_id ?? null} userLocation={userLocation} />
            </section>
            <section className="partner-list-panel" aria-label="Liste der Partnerrestaurants">
              <div className="partner-results-list">
                {filteredLocations.map((location) => (
                  <PartnerResultCard key={location.branch_id} location={location} onSelect={() => selectLocation(location)} selected={selected?.branch_id === location.branch_id} />
                ))}
              </div>
              {selected ? <PartnerDetail current={selected.slug === currentSlug} location={selected} /> : null}
            </section>
          </div>
        ) : null}
      </main>
    </AppShell>
  );
}
