import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Building2, CheckCircle2, Clock, CreditCard, ExternalLink, Lock, PauseCircle, RefreshCw, Search } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import {
  loadPlatformRestaurantDetail,
  loadPlatformRestaurants,
  updatePlatformRestaurantSubscription,
  type PaymentStatus,
  type PlatformRestaurant,
  type PlatformRestaurantDetail,
  type PlatformSummary,
  type RestaurantStatus,
  type SubscriptionStatus,
} from "./platformAdminService";
import { useAuth } from "../auth/AuthProvider";

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

const paymentLabels: Record<PaymentStatus, string> = {
  not_required: "Nicht erforderlich",
  pending: "Offen",
  paid: "Bezahlt",
  failed: "Fehlgeschlagen",
  manual: "Manuell",
};

const restaurantStatusLabels: Record<RestaurantStatus, string> = {
  active: "Aktiv",
  draft: "Pausiert",
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

function formatDate(value: string | null | undefined) {
  if (!value) return "Nicht gesetzt";
  return new Intl.DateTimeFormat("de-AT", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value));
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "Keine Aktivität";
  return new Intl.DateTimeFormat("de-AT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function isToday(value: string | null | undefined) {
  if (!value) return false;
  const date = new Date(value);
  const now = new Date();
  return date.toDateString() === now.toDateString();
}

function trialLabel(restaurant: PlatformRestaurant) {
  if (!restaurant.subscription_exists) {
    return "Kein Abo eingerichtet";
  }

  if (restaurant.subscription_status !== "trialing") {
    return restaurant.subscription_status ? subscriptionLabels[restaurant.subscription_status] : "Kein Abo eingerichtet";
  }

  if (restaurant.trial_ends_at && new Date(restaurant.trial_ends_at).getTime() < Date.now()) {
    return "Testphase abgelaufen";
  }

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
    expiring_trials: restaurants.filter((restaurant) =>
      restaurant.subscription_exists &&
      restaurant.subscription_status === "trialing" &&
      restaurant.trial_ends_at &&
      new Date(restaurant.trial_ends_at).getTime() >= now &&
      new Date(restaurant.trial_ends_at).getTime() <= now + sevenDays,
    ).length,
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
  const [detail, setDetail] = useState<PlatformRestaurantDetail | null>(null);
  const [statusDraft, setStatusDraft] = useState<RestaurantStatus>("active");
  const [searchTerm, setSearchTerm] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const canWrite =
    platformRole === "platform_owner" ||
    platformRole === "platform_admin" ||
    platformRole === "app_admin" ||
    platformRole === "super_admin" ||
    platformRole === "wuxuai_admin" ||
    platformRole === "billing_admin";

  async function loadData(preferredId = selectedRestaurantId) {
    setLoading(true);
    setErrorMessage("");
    try {
      const data = await loadPlatformRestaurants();
      const nextSummary = computeSummary(data.restaurants, data.summary);
      setSummary(nextSummary);
      setRestaurants(data.restaurants);
      const nextSelectedId = preferredId && data.restaurants.some((restaurant) => restaurant.id === preferredId)
        ? preferredId
        : data.restaurants[0]?.id ?? null;
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
    try {
      const nextDetail = await loadPlatformRestaurantDetail(id);
      setDetail(nextDetail);
      setStatusDraft(nextDetail.restaurant.status);
    } catch (error) {
      console.error("Restaurantdetails konnten nicht geladen werden.", error);
      setDetail(null);
      setErrorMessage("Restaurantdetails konnten gerade nicht geladen werden.");
    } finally {
      setDetailLoading(false);
    }
  }

  useEffect(() => {
    loadData(restaurantId ?? null);
  }, [restaurantId]);

  useEffect(() => {
    if (!selectedRestaurantId) {
      setDetail(null);
      return;
    }
    loadDetail(selectedRestaurantId);
  }, [selectedRestaurantId]);

  const selectedRestaurant = useMemo(
    () => restaurants.find((restaurant) => restaurant.id === selectedRestaurantId) ?? null,
    [restaurants, selectedRestaurantId],
  );

  const filteredRestaurants = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return restaurants.filter((restaurant) => {
      const matchesSearch = !term ||
        restaurant.name.toLowerCase().includes(term) ||
        restaurant.slug.toLowerCase().includes(term) ||
        (restaurant.owner_email ?? "").toLowerCase().includes(term);
      const matchesFilter =
        filter === "all" ||
        (filter === "active" && restaurant.status === "active") ||
        (filter === "paused" && restaurant.status === "draft") ||
        (filter === "suspended" && restaurant.status === "suspended") ||
        (filter === "trial" && restaurant.subscription_status === "trialing") ||
        (filter === "setup" && restaurant.onboarding_status !== "completed" && restaurant.onboarding_status !== "ready");
      return matchesSearch && matchesFilter;
    });
  }, [filter, restaurants, searchTerm]);

  function selectRestaurant(id: string) {
    setSelectedRestaurantId(id);
    navigate(`/admin/platform/restaurants/${id}`, { replace: false });
  }

  async function runSubscriptionAction(
    restaurant: PlatformRestaurant,
    actionLabel: string,
    payload: {
      subscriptionStatus?: SubscriptionStatus | null;
      paymentStatus?: PaymentStatus | null;
      restaurantStatus?: RestaurantStatus | null;
      trialExtensionDays?: number | null;
      reason?: string | null;
    },
  ) {
    setSavingId(restaurant.id);
    setMessage("");
    setErrorMessage("");
    try {
      await updatePlatformRestaurantSubscription({
        restaurantId: restaurant.id,
        ...payload,
      });
      setMessage(`${actionLabel} wurde gespeichert.`);
      await loadData(restaurant.id);
      await loadDetail(restaurant.id);
    } catch (error) {
      console.error("Admin-Aktion konnte nicht gespeichert werden.", error);
      setErrorMessage("Änderung konnte nicht gespeichert werden.");
    } finally {
      setSavingId(null);
    }
  }

  async function saveRestaurantStatus() {
    if (!selectedRestaurant) return;
    await runSubscriptionAction(selectedRestaurant, "Restaurantstatus", {
      restaurantStatus: statusDraft,
      reason: `Restaurantstatus im WUXUAI Admin auf ${restaurantStatusLabels[statusDraft]} gesetzt`,
    });
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
    { key: "all", label: "Alle" },
    { key: "active", label: "Aktiv" },
    { key: "paused", label: "Pausiert" },
    { key: "suspended", label: "Gesperrt" },
    { key: "trial", label: "Trial aktiv" },
    { key: "setup", label: "Setup offen" },
  ];

  const portalOrigin = window.location.origin;

  return (
    <main className="platform-admin-shell">
      <header className="platform-admin-header">
        <div>
          <span className="admin-brand-kicker">WUXUAI Admin</span>
          <h1>WUXUAI Admin</h1>
          <p>Restaurants, Testphasen und Plattformstatus verwalten.</p>
        </div>
        <div className="platform-admin-header-actions">
          <span className="pill">{platformRole ? roleLabels[platformRole] ?? "Plattform Admin" : "Plattform Admin"}</span>
          <button className="button secondary" onClick={() => loadData(selectedRestaurantId)} type="button">
            <RefreshCw size={18} />
            Aktualisieren
          </button>
          <button className="button secondary" onClick={signOut} type="button">
            Abmelden
          </button>
        </div>
      </header>

      {message ? <p className="status-message" role="status">{message}</p> : null}
      {errorMessage ? <p className="status-message error" role="alert">{errorMessage}</p> : null}

      <section className="platform-kpi-grid" aria-label="WUXUAI Admin Übersicht">
        {summaryCards.map((card) => {
          const Icon = card.icon;
          return (
            <article className="card platform-kpi-card" key={card.label}>
              <Icon size={22} />
              <strong>{card.value}</strong>
              <span>{card.label}</span>
            </article>
          );
        })}
      </section>

      <section className="platform-admin-grid">
        <div className="card platform-restaurant-list-card">
          <div className="section-heading">
            <h2>Restaurantliste</h2>
            <p className="muted">Nur interne Plattformrollen sehen diese Daten.</p>
          </div>

          <div className="platform-toolbar">
            <label className="platform-search" htmlFor="platform-restaurant-search">
              <Search size={18} />
              <input
                id="platform-restaurant-search"
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Restaurant suchen"
                type="search"
                value={searchTerm}
              />
            </label>
            <div className="platform-filter-row" aria-label="Restaurantfilter">
              {filterOptions.map((option) => (
                <button
                  className={`chip-button${filter === option.key ? " active" : ""}`}
                  key={option.key}
                  onClick={() => setFilter(option.key)}
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {loading ? <p className="muted">Restaurants werden geladen...</p> : null}
          {!loading && filteredRestaurants.length === 0 ? (
            <div className="empty-state-card">
              <Building2 size={32} />
              <h3>Keine Restaurants gefunden</h3>
              <p>Ändere Suche oder Filter, um weitere Restaurants zu sehen.</p>
            </div>
          ) : null}

          <div className="platform-restaurant-list">
            {filteredRestaurants.map((restaurant) => (
              <article
                className={`platform-restaurant-row${restaurant.id === selectedRestaurantId ? " selected" : ""}`}
                key={restaurant.id}
              >
                <button onClick={() => selectRestaurant(restaurant.id)} type="button">
                  <span>
                    <strong>{restaurant.name}</strong>
                    <small>{restaurant.slug}</small>
                    <small>{restaurant.owner_email ?? "Betreiber nicht bekannt"}</small>
                  </span>
                  <span className="platform-row-meta">
                    <span>{restaurantStatusLabels[restaurant.status]}</span>
                    <span>{trialLabel(restaurant)}</span>
                    <span>Setup: {setupLabel(restaurant)}</span>
                    <span>{restaurant.customer_count} Gäste</span>
                    <span>Details öffnen</span>
                  </span>
                </button>
              </article>
            ))}
          </div>
        </div>

        <aside className="card platform-detail-card">
          {selectedRestaurant ? (
            <>
              <div className="platform-detail-heading">
                {detail?.branding?.logo_url ? (
                  <img alt={`${selectedRestaurant.name} Logo`} src={detail.branding.logo_url} />
                ) : (
                  <span className="platform-logo-placeholder">{selectedRestaurant.name.charAt(0).toUpperCase()}</span>
                )}
                <div>
                  <h2>{selectedRestaurant.name}</h2>
                  <p className="muted">{selectedRestaurant.slug}</p>
                </div>
              </div>

              {detailLoading ? <p className="muted">Restaurantdetails werden geladen...</p> : null}

              <dl className="platform-detail-list">
                <div>
                  <dt>Betreiber</dt>
                  <dd>{selectedRestaurant.owner_email ?? selectedRestaurant.owner_name ?? "Nicht bekannt"}</dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>{restaurantStatusLabels[selectedRestaurant.status]}</dd>
                </div>
                <div>
                  <dt>Trial</dt>
                  <dd>{trialLabel(selectedRestaurant)}</dd>
                </div>
                <div>
                  <dt>Erstellt am</dt>
                  <dd>{formatDate(selectedRestaurant.created_at)}</dd>
                </div>
                <div>
                  <dt>Setup abgeschlossen</dt>
                  <dd>{setupLabel(selectedRestaurant)}</dd>
                </div>
                <div>
                  <dt>Abo-Status</dt>
                  <dd>{selectedRestaurant.subscription_status ? subscriptionLabels[selectedRestaurant.subscription_status] : "Kein Abo eingerichtet"}</dd>
                </div>
                <div>
                  <dt>Zahlungsstatus</dt>
                  <dd>{selectedRestaurant.payment_status ? paymentLabels[selectedRestaurant.payment_status] : "Abo-Verwaltung noch nicht aktiviert"}</dd>
                </div>
                <div>
                  <dt>Testphase Start</dt>
                  <dd>{formatDate(selectedRestaurant.trial_started_at)}</dd>
                </div>
                <div>
                  <dt>Testphase Ende</dt>
                  <dd>{formatDate(selectedRestaurant.trial_ends_at)}</dd>
                </div>
                <div>
                  <dt>Letzte Aktivität</dt>
                  <dd>{formatDateTime(selectedRestaurant.last_activity_at)}</dd>
                </div>
              </dl>

              <section className="platform-metric-grid" aria-label="Restaurant Kennzahlen">
                <article>
                  <strong>{detail?.metrics.customer_count ?? selectedRestaurant.customer_count}</strong>
                  <span>Gäste</span>
                </article>
                <article>
                  <strong>{detail?.metrics.points_today ?? selectedRestaurant.points_today}</strong>
                  <span>Punkte heute</span>
                </article>
                <article>
                  <strong>{detail?.metrics.redemptions_today ?? 0}</strong>
                  <span>Einlösungen heute</span>
                </article>
                <article>
                  <strong>{detail?.metrics.welcome_gifts_active ?? 0}</strong>
                  <span>Willkommensgeschenke aktiv</span>
                </article>
                <article>
                  <strong>{detail?.metrics.bonus_boosts_active ?? 0}</strong>
                  <span>Bonus Boost aktiv</span>
                </article>
              </section>

              <section className="platform-link-grid" aria-label="Restaurant Links">
                <a className="button secondary" href={`${portalOrigin}/admin`} rel="noreferrer" target="_blank">
                  <ExternalLink size={18} />
                  Restaurant Portal öffnen
                </a>
                <a className="button secondary" href={`${portalOrigin}/customer/${selectedRestaurant.slug}`} rel="noreferrer" target="_blank">
                  <ExternalLink size={18} />
                  Gäste-QR-Link öffnen
                </a>
                <a className="button secondary" href={`${portalOrigin}/staff/${selectedRestaurant.slug}`} rel="noreferrer" target="_blank">
                  <ExternalLink size={18} />
                  Staff Portal öffnen
                </a>
                <a className="button secondary" href={`${portalOrigin}/admin/qr`} rel="noreferrer" target="_blank">
                  <ExternalLink size={18} />
                  QR Center öffnen
                </a>
              </section>

              <section className="platform-status-panel">
                <div className="section-heading">
                  <h3>Status ändern</h3>
                  <p className="muted">Keine Löschung in V1. Daten bleiben erhalten.</p>
                </div>
                <label className="field" htmlFor="platform-status">
                  <span>Restaurantstatus</span>
                  <select
                    className="input"
                    disabled={!canWrite || savingId === selectedRestaurant.id}
                    id="platform-status"
                    onChange={(event) => setStatusDraft(event.target.value as RestaurantStatus)}
                    value={statusDraft}
                  >
                    <option value="active">Aktiv</option>
                    <option value="draft">Pausiert</option>
                    <option value="suspended">Gesperrt</option>
                  </select>
                </label>
                {canWrite ? (
                  <button
                    className="button primary"
                    disabled={savingId === selectedRestaurant.id}
                    onClick={saveRestaurantStatus}
                    type="button"
                  >
                    Status speichern
                  </button>
                ) : (
                  <p className="muted">Nur Ansicht. Deine Plattformrolle darf keine Änderungen speichern.</p>
                )}
              </section>

              {canWrite ? (
                <div className="platform-actions">
                  <button
                    className="button secondary"
                    disabled={savingId === selectedRestaurant.id}
                    onClick={() =>
                      runSubscriptionAction(selectedRestaurant, "Abo aktiviert", {
                        subscriptionStatus: "active",
                        reason: "Abo manuell im WUXUAI Admin aktiviert",
                      })
                    }
                    type="button"
                  >
                    Abo aktivieren
                  </button>
                  <button
                    className="button secondary"
                    disabled={savingId === selectedRestaurant.id}
                    onClick={() =>
                      runSubscriptionAction(selectedRestaurant, "Abo pausiert", {
                        subscriptionStatus: "paused",
                        reason: "Abo manuell im WUXUAI Admin pausiert",
                      })
                    }
                    type="button"
                  >
                    Abo pausieren
                  </button>
                  <button
                    className="button secondary"
                    disabled={savingId === selectedRestaurant.id}
                    onClick={() =>
                      runSubscriptionAction(selectedRestaurant, "Testphase verlängert", {
                        trialExtensionDays: 14,
                        reason: "Testphase manuell um 14 Tage verlängert",
                      })
                    }
                    type="button"
                  >
                    Testphase verlängern
                  </button>
                  <button
                    className="button secondary"
                    disabled={savingId === selectedRestaurant.id}
                    onClick={() =>
                      runSubscriptionAction(selectedRestaurant, "Zahlung manuell bestätigt", {
                        paymentStatus: "manual",
                        reason: "Zahlung manuell bestätigt",
                      })
                    }
                    type="button"
                  >
                    Zahlung manuell bestätigt
                  </button>
                </div>
              ) : null}

              <section className="platform-audit-panel">
                <div className="section-heading">
                  <h3>Letzte Aktivitäten</h3>
                  <p className="muted">Audit-Auszug für dieses Restaurant.</p>
                </div>
                {detail?.audit?.length ? (
                  <div className="platform-audit-list">
                    {detail.audit.map((entry) => (
                      <article key={entry.id}>
                        <strong>{entry.action}</strong>
                        <span>{formatDateTime(entry.created_at)}</span>
                        <small>{entry.actor_type}</small>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="muted">Audit-Daten konnten gerade nicht geladen werden.</p>
                )}
              </section>
            </>
          ) : (
            <div className="empty-state-card">
              <Building2 size={32} />
              <h3>Kein Restaurant ausgewählt</h3>
              <p>Wähle ein Restaurant aus der Liste, um Details zu sehen.</p>
            </div>
          )}
        </aside>
      </section>
    </main>
  );
}
