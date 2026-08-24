import { useEffect, useMemo, useState } from "react";
import { Activity, AlertCircle, Building2, CheckCircle2, Clock, Lock, RefreshCw, Search } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import {
  loadPlatformRestaurantControlCenter,
  loadPlatformRestaurants,
  updatePlatformRestaurantSubscription,
  type PaymentStatus,
  type PlatformRestaurant,
  type PlatformRestaurantControlCenter,
  type PlatformSummary,
  type RestaurantStatus,
  type SubscriptionStatus,
} from "./platformAdminService";
import { PlatformRestaurantControlCenter as RestaurantControlCenter } from "./PlatformRestaurantControlCenter";
import { useAuth } from "../auth/AuthProvider";
import { canWritePlatformAdmin } from "./platformAdminAuthorization.mjs";

const emptySummary: PlatformSummary = {
  restaurants_total: 0,
  active_restaurants: 0,
  active_trials: 0,
  expiring_trials: 0,
  expired_trials: 0,
  suspended_restaurants: 0,
  new_restaurants_today: 0,
  active_subscriptions: 0,
  open_payments: 0,
  points_today: 0,
  redemptions_today: 0,
};

const subscriptionLabels: Record<SubscriptionStatus, string> = {
  trialing: "Testphase",
  active: "Abo aktiv",
  past_due: "Überfällig",
  unpaid: "Unbezahlt",
  cancelled: "Gekündigt",
  paused: "Pausiert",
};

const restaurantStatusLabels: Record<RestaurantStatus, string> = {
  active: "Aktiv",
  draft: "Inaktiv",
  suspended: "Gesperrt",
};

const roleLabels: Record<string, string> = {
  platform_owner: "Plattformleitung",
  platform_admin: "Plattform Admin",
  app_admin: "App Admin",
  super_admin: "Super Admin",
  wuxuai_admin: "WUXUAI Admin",
  support: "Support",
  billing_admin: "Abrechnung",
  security_admin: "Sicherheit",
  viewer: "Nur Ansicht",
};

type FilterKey = "all" | "active" | "paused" | "suspended" | "trial" | "setup";

function isToday(value: string | null | undefined) {
  if (!value) return false;
  return new Date(value).toDateString() === new Date().toDateString();
}

function trialLabel(restaurant: PlatformRestaurant) {
  if (!restaurant.subscription_exists) return "Kein Abo eingerichtet";
  if (restaurant.subscription_status !== "trialing") {
    return restaurant.subscription_status ? subscriptionLabels[restaurant.subscription_status] : "Kein Abo eingerichtet";
  }
  if (restaurant.trial_ends_at && new Date(restaurant.trial_ends_at).getTime() < Date.now()) return "Testphase abgelaufen";
  return `Noch ${restaurant.trial_days_left ?? 0} Tage`;
}

function setupLabel(restaurant: PlatformRestaurant) {
  return restaurant.onboarding_status === "completed" || restaurant.onboarding_status === "ready" ? "Ja" : "Nein";
}

function computeSummary(restaurants: PlatformRestaurant[], summary: PlatformSummary): PlatformSummary {
  const now = Date.now();
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  return {
    ...summary,
    active_restaurants: restaurants.filter((restaurant) => restaurant.status === "active").length,
    expiring_trials: restaurants.filter((restaurant) => restaurant.subscription_exists && restaurant.subscription_status === "trialing" && restaurant.trial_ends_at && new Date(restaurant.trial_ends_at).getTime() >= now && new Date(restaurant.trial_ends_at).getTime() <= now + sevenDays).length,
    suspended_restaurants: restaurants.filter((restaurant) => restaurant.status === "suspended").length,
    new_restaurants_today: restaurants.filter((restaurant) => isToday(restaurant.created_at)).length,
  };
}

export function PlatformAdminPage() {
  const { platformRole, signOut } = useAuth();
  const { restaurantId } = useParams();
  const navigate = useNavigate();
  const [summary, setSummary] = useState<PlatformSummary>(emptySummary);
  const [restaurants, setRestaurants] = useState<PlatformRestaurant[]>([]);
  const [selectedRestaurantId, setSelectedRestaurantId] = useState<string | null>(restaurantId ?? null);
  const [detail, setDetail] = useState<PlatformRestaurantControlCenter | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [detailError, setDetailError] = useState("");
  const canWrite = canWritePlatformAdmin(platformRole);

  async function loadData(preferredId = selectedRestaurantId) {
    setLoading(true);
    setErrorMessage("");
    try {
      const data = await loadPlatformRestaurants();
      setSummary(computeSummary(data.restaurants, data.summary));
      setRestaurants(data.restaurants);
      const nextSelectedId = preferredId && data.restaurants.some((restaurant) => restaurant.id === preferredId) ? preferredId : data.restaurants[0]?.id ?? null;
      setSelectedRestaurantId(nextSelectedId);
    } catch (error) {
      console.error("WUXUAI Admin Daten konnten nicht geladen werden.", error);
      setErrorMessage("Admin-Daten konnten gerade nicht geladen werden.");
      setRestaurants([]);
      setSummary(emptySummary);
      setSelectedRestaurantId(null);
    } finally {
      setLoading(false);
    }
  }

  async function loadDetail(id: string) {
    setDetailLoading(true);
    setDetail(null);
    setDetailError("");
    try {
      setDetail(await loadPlatformRestaurantControlCenter(id));
    } catch (error) {
      console.error("Restaurantdetails konnten nicht geladen werden.", error);
      setDetailError("Restaurantdaten konnten nicht geladen werden.");
    } finally {
      setDetailLoading(false);
    }
  }

  useEffect(() => { void loadData(restaurantId ?? null); }, [restaurantId]);
  useEffect(() => {
    if (!selectedRestaurantId) {
      setDetail(null);
      setDetailError("");
      return;
    }
    void loadDetail(selectedRestaurantId);
  }, [selectedRestaurantId]);

  const selectedRestaurant = useMemo(() => restaurants.find((restaurant) => restaurant.id === selectedRestaurantId) ?? null, [restaurants, selectedRestaurantId]);
  const filteredRestaurants = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return restaurants.filter((restaurant) => {
      const matchesSearch = !term || restaurant.name.toLowerCase().includes(term) || restaurant.slug.toLowerCase().includes(term) || (restaurant.owner_email ?? "").toLowerCase().includes(term);
      const matchesFilter = filter === "all" || (filter === "active" && restaurant.status === "active") || (filter === "paused" && restaurant.status === "draft") || (filter === "suspended" && restaurant.status === "suspended") || (filter === "trial" && restaurant.subscription_status === "trialing") || (filter === "setup" && restaurant.onboarding_status !== "completed" && restaurant.onboarding_status !== "ready");
      return matchesSearch && matchesFilter;
    });
  }, [filter, restaurants, searchTerm]);

  function selectRestaurant(id: string) {
    setSelectedRestaurantId(id);
    navigate(`/admin/platform/restaurants/${id}`, { replace: false });
  }

  async function runSubscriptionAction(actionLabel: string, payload: { subscriptionStatus?: SubscriptionStatus | null; paymentStatus?: PaymentStatus | null; restaurantStatus?: RestaurantStatus | null; trialExtensionDays?: number | null; reason?: string | null }) {
    if (!selectedRestaurant) return;
    setSavingId(selectedRestaurant.id);
    setMessage("");
    setErrorMessage("");
    try {
      await updatePlatformRestaurantSubscription({ restaurantId: selectedRestaurant.id, ...payload });
      setMessage(`${actionLabel} wurde gespeichert.`);
      await loadData(selectedRestaurant.id);
      await loadDetail(selectedRestaurant.id);
    } catch (error) {
      console.error("Admin-Aktion konnte nicht gespeichert werden.", error);
      setErrorMessage("Änderung konnte nicht gespeichert werden.");
      throw error;
    } finally {
      setSavingId(null);
    }
  }

  const summaryCards = [
    { label: "Restaurants gesamt", value: summary.restaurants_total, icon: Building2 },
    { label: "Aktive Restaurants", value: summary.active_restaurants ?? 0, icon: CheckCircle2 },
    { label: "Testphasen aktiv", value: summary.active_trials, icon: Clock },
    { label: "Testphasen bald ablaufend", value: summary.expiring_trials ?? 0, icon: AlertCircle },
    { label: "Gesperrte Restaurants", value: summary.suspended_restaurants ?? 0, icon: Lock },
    { label: "Neue Restaurants heute", value: summary.new_restaurants_today ?? 0, icon: RefreshCw },
  ];
  const filterOptions: { key: FilterKey; label: string }[] = [
    { key: "all", label: "Alle" }, { key: "active", label: "Aktiv" }, { key: "paused", label: "Inaktiv" },
    { key: "suspended", label: "Gesperrt" }, { key: "trial", label: "Testphase" }, { key: "setup", label: "Setup offen" },
  ];

  return (
    <main className="platform-admin-shell">
      <header className="platform-admin-header">
        <div><span className="admin-brand-kicker">WUXUAI Admin</span><h1>WUXUAI Admin</h1><p>Restaurants, Testphasen und Plattformstatus verwalten.</p></div>
        <div className="platform-admin-header-actions">
          <span className="pill">{platformRole ? roleLabels[platformRole] ?? "Plattform Admin" : "Plattform Admin"}</span>
          <button className="button secondary" onClick={() => navigate("/admin/platform/audit")} type="button"><Activity size={18} />Audit-Protokoll</button>
          <button className="button secondary" onClick={() => void loadData(selectedRestaurantId)} type="button"><RefreshCw size={18} />Aktualisieren</button>
          <button className="button secondary" onClick={signOut} type="button">Abmelden</button>
        </div>
      </header>

      {message ? <p className="status-message" role="status">{message}</p> : null}
      {errorMessage ? <p className="status-message error" role="alert">{errorMessage}</p> : null}

      <section className="platform-kpi-grid" aria-label="WUXUAI Admin Übersicht">
        {summaryCards.map((card) => { const Icon = card.icon; return <article className="card platform-kpi-card" key={card.label}><Icon size={22} /><strong>{card.value}</strong><span>{card.label}</span></article>; })}
      </section>

      <section className="platform-admin-grid">
        <div className="card platform-restaurant-list-card">
          <div className="section-heading"><h2>Restaurantliste</h2><p className="muted">Nur interne Plattformrollen sehen diese Daten.</p></div>
          <div className="platform-toolbar">
            <label className="platform-search" htmlFor="platform-restaurant-search"><Search size={18} /><input id="platform-restaurant-search" onChange={(event) => setSearchTerm(event.target.value)} placeholder="Restaurant suchen" type="search" value={searchTerm} /></label>
            <div className="platform-filter-row" aria-label="Restaurantfilter">{filterOptions.map((option) => <button className={`chip-button${filter === option.key ? " active" : ""}`} key={option.key} onClick={() => setFilter(option.key)} type="button">{option.label}</button>)}</div>
          </div>
          {loading ? <p className="muted">Restaurants werden geladen …</p> : null}
          {!loading && filteredRestaurants.length === 0 ? <div className="empty-state-card"><Building2 size={32} /><h3>Keine Restaurants gefunden</h3><p>Ändere Suche oder Filter, um weitere Restaurants zu sehen.</p></div> : null}
          <div className="platform-restaurant-list">{filteredRestaurants.map((restaurant) => <article className={`platform-restaurant-row${restaurant.id === selectedRestaurantId ? " selected" : ""}`} key={restaurant.id}><button onClick={() => selectRestaurant(restaurant.id)} type="button"><span><strong>{restaurant.name}</strong><small>{restaurant.slug}</small><small>{restaurant.owner_email ?? "Betreiber nicht bekannt"}</small></span><span className="platform-row-meta"><span>{restaurantStatusLabels[restaurant.status]}</span><span>{trialLabel(restaurant)}</span><span>Setup: {setupLabel(restaurant)}</span><span>{restaurant.customer_count} Gäste</span><span>Details öffnen</span></span></button></article>)}</div>
        </div>

        <div className="platform-control-column">
          {selectedRestaurant ? <RestaurantControlCenter canWrite={canWrite} data={detail} error={detailError} loading={detailLoading} onAction={runSubscriptionAction} onRetry={() => void loadDetail(selectedRestaurant.id)} restaurant={selectedRestaurant} saving={savingId === selectedRestaurant.id} /> : <div className="empty-state-card"><Building2 size={32} /><h3>Kein Restaurant ausgewählt</h3><p>Wähle ein Restaurant aus der Liste, um Details zu sehen.</p></div>}
        </div>
      </section>
    </main>
  );
}
