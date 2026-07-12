import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Building2, CheckCircle2, Clock, CreditCard, PauseCircle, RefreshCw } from "lucide-react";
import {
  loadPlatformRestaurants,
  updatePlatformRestaurantSubscription,
  type PaymentStatus,
  type PlatformRestaurant,
  type PlatformSummary,
  type SubscriptionStatus,
} from "./platformAdminService";
import { useAuth } from "../auth/AuthProvider";

const emptySummary: PlatformSummary = {
  restaurants_total: 0,
  active_trials: 0,
  expired_trials: 0,
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

const roleLabels: Record<string, string> = {
  platform_owner: "Plattformleitung",
  platform_admin: "Plattform Admin",
  support: "Support",
  billing_admin: "Abrechnung",
  security_admin: "Sicherheit",
  viewer: "Leserechte",
};

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

export function PlatformAdminPage() {
  const { platformRole, signOut } = useAuth();
  const [summary, setSummary] = useState<PlatformSummary>(emptySummary);
  const [restaurants, setRestaurants] = useState<PlatformRestaurant[]>([]);
  const [selectedRestaurantId, setSelectedRestaurantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  async function loadData() {
    setLoading(true);
    setErrorMessage("");
    try {
      const data = await loadPlatformRestaurants();
      setSummary(data.summary);
      setRestaurants(data.restaurants);
      setSelectedRestaurantId((current) =>
        current && data.restaurants.some((restaurant) => restaurant.id === current)
          ? current
          : data.restaurants[0]?.id ?? null,
      );
    } catch (error) {
      console.error("WUXUAI Admin Daten konnten nicht geladen werden.", error);
      setErrorMessage("Plattformdaten konnten nicht geladen werden.");
      setRestaurants([]);
      setSummary(emptySummary);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const selectedRestaurant = useMemo(
    () => restaurants.find((restaurant) => restaurant.id === selectedRestaurantId) ?? null,
    [restaurants, selectedRestaurantId],
  );
  const canWrite = platformRole === "platform_owner" || platformRole === "platform_admin" || platformRole === "billing_admin";

  async function runAction(
    restaurant: PlatformRestaurant,
    actionLabel: string,
    payload: {
      subscriptionStatus?: SubscriptionStatus | null;
      paymentStatus?: PaymentStatus | null;
      restaurantStatus?: "active" | "draft" | "suspended" | null;
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
      await loadData();
      setSelectedRestaurantId(restaurant.id);
    } catch (error) {
      console.error("Admin-Aktion konnte nicht gespeichert werden.", error);
      setErrorMessage("Änderung konnte nicht gespeichert werden.");
    } finally {
      setSavingId(null);
    }
  }

  const summaryCards = [
    { label: "Restaurants gesamt", value: summary.restaurants_total, icon: Building2 },
    { label: "Aktive Testphasen", value: summary.active_trials, icon: Clock },
    { label: "Abgelaufene Testphasen", value: summary.expired_trials, icon: AlertCircle },
    { label: "Aktive Abos", value: summary.active_subscriptions, icon: CheckCircle2 },
    { label: "Zahlung offen", value: summary.open_payments, icon: CreditCard },
    { label: "Punkte heute", value: summary.points_today, icon: RefreshCw },
    { label: "Einlösungen heute", value: summary.redemptions_today, icon: PauseCircle },
  ];

  return (
    <div className="platform-admin-shell">
      <header className="platform-admin-header">
        <div>
          <span className="admin-brand-kicker">WUXUAI Admin</span>
          <h1>Restaurants verwalten</h1>
          <p>Interne Übersicht für Testphase, Abo-Status und Zahlungsstatus.</p>
        </div>
        <div className="platform-admin-header-actions">
          <span className="pill">{platformRole ? roleLabels[platformRole] ?? "Plattform" : "Plattform"}</span>
          <button className="button secondary" onClick={loadData} type="button">
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

          {loading ? <p className="muted">Restaurants werden geladen...</p> : null}
          {!loading && restaurants.length === 0 ? (
            <div className="empty-state-card">
              <Building2 size={32} />
              <h3>Noch keine Restaurants</h3>
              <p>Es wurden keine Restaurants für die Plattformübersicht gefunden.</p>
            </div>
          ) : null}

          <div className="platform-restaurant-list">
            {restaurants.map((restaurant) => (
              <article
                className={`platform-restaurant-row${restaurant.id === selectedRestaurantId ? " selected" : ""}`}
                key={restaurant.id}
              >
                <button onClick={() => setSelectedRestaurantId(restaurant.id)} type="button">
                  <span>
                    <strong>{restaurant.name}</strong>
                    <small>{restaurant.owner_email ?? "Besitzer-E-Mail fehlt"}</small>
                  </span>
                  <span className="platform-row-meta">
                    <span>{trialLabel(restaurant)}</span>
                    <span>{restaurant.payment_status ? paymentLabels[restaurant.payment_status] : "Kein Zahlungsstatus"}</span>
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
              <div className="section-heading">
                <h2>{selectedRestaurant.name}</h2>
                <p className="muted">{selectedRestaurant.slug}</p>
              </div>

              <dl className="platform-detail-list">
                <div>
                  <dt>Besitzer</dt>
                  <dd>{selectedRestaurant.owner_email ?? selectedRestaurant.owner_name ?? "Nicht bekannt"}</dd>
                </div>
                <div>
                  <dt>Restaurantstatus</dt>
                  <dd>{selectedRestaurant.status === "active" ? "Aktiv" : selectedRestaurant.status === "draft" ? "Entwurf" : "Pausiert"}</dd>
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
                  <dt>Verbleibende Testtage</dt>
                  <dd>{trialLabel(selectedRestaurant)}</dd>
                </div>
                <div>
                  <dt>Abo-Status</dt>
                  <dd>
                    {selectedRestaurant.subscription_status
                      ? subscriptionLabels[selectedRestaurant.subscription_status]
                      : "Kein Abo eingerichtet"}
                  </dd>
                </div>
                <div>
                  <dt>Zahlungsstatus</dt>
                  <dd>
                    {selectedRestaurant.payment_status
                      ? paymentLabels[selectedRestaurant.payment_status]
                      : "Kein Zahlungsstatus"}
                  </dd>
                </div>
                <div>
                  <dt>Pausiert seit</dt>
                  <dd>{formatDateTime(selectedRestaurant.paused_at)}</dd>
                </div>
                <div>
                  <dt>Sperrgrund</dt>
                  <dd>{selectedRestaurant.lock_reason ?? "Kein Sperrgrund"}</dd>
                </div>
                <div>
                  <dt>Letzte Aktivität</dt>
                  <dd>{formatDateTime(selectedRestaurant.last_activity_at)}</dd>
                </div>
                <div>
                  <dt>Gäste</dt>
                  <dd>{selectedRestaurant.customer_count}</dd>
                </div>
                <div>
                  <dt>Punkte heute / gesamt</dt>
                  <dd>{selectedRestaurant.points_today} / {selectedRestaurant.points_total}</dd>
                </div>
                <div>
                  <dt>Einlösungen</dt>
                  <dd>{selectedRestaurant.redemptions_count}</dd>
                </div>
              </dl>

              {canWrite ? (
                <div className="platform-actions">
                  <button
                    className="button primary"
                    disabled={savingId === selectedRestaurant.id}
                    onClick={() =>
                      runAction(selectedRestaurant, "Restaurant aktiviert", {
                        subscriptionStatus: "active",
                        restaurantStatus: "active",
                        reason: "Manuell im WUXUAI Admin aktiviert",
                      })
                    }
                    type="button"
                  >
                    Restaurant aktivieren
                  </button>
                  <button
                    className="button secondary"
                    disabled={savingId === selectedRestaurant.id}
                    onClick={() =>
                      runAction(selectedRestaurant, "Restaurant pausiert", {
                        subscriptionStatus: "paused",
                        reason: "Manuell im WUXUAI Admin pausiert",
                      })
                    }
                    type="button"
                  >
                    Restaurant pausieren
                  </button>
                  <button
                    className="button secondary"
                    disabled={savingId === selectedRestaurant.id}
                    onClick={() =>
                      runAction(selectedRestaurant, "Testphase verlängert", {
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
                      runAction(selectedRestaurant, "Zahlung manuell bestätigt", {
                        paymentStatus: "manual",
                        reason: "Zahlung manuell bestätigt",
                      })
                    }
                    type="button"
                  >
                    Zahlung manuell bestätigt
                  </button>
                </div>
              ) : (
                <p className="muted">Nur Ansicht. Deine Plattformrolle darf keine Änderungen speichern.</p>
              )}
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
    </div>
  );
}
