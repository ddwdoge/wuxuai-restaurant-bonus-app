import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, ArrowRight, CakeSlice, Gift, MapPinned, Newspaper, QrCode, RefreshCw, Smartphone, Sparkles, Star, UserPlus, Users } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AppDrawer } from "../../../shared/components/AppDrawer";
import { loadRewardKpis, type RewardKpis } from "../../rewards/rewardService";
import { loadBonusBoostKpis, type BonusBoostKpis } from "../../loyalty/loyaltyService";
import { useTenant } from "../../tenant/TenantProvider";
import { loadRestaurantLegalSetup, type RestaurantLegalSetup } from "../../legal/legalService";
import { useAuth } from "../../auth/AuthProvider";
import {
  loadDashboardSetupStatus,
  loadSeenDashboardNotices,
  markDashboardNoticeSeen,
  type DashboardSetupStatus,
} from "../dashboardNoticeService";
import { resolveOwnerDashboardRecommendation } from "../ownerDashboardRecommendation.mjs";
import { buildStaffLoginPath } from "../../auth/staffLoginFlow.mjs";
import { loadOwnerPointAnomalyWarnings, type OwnerPointAnomalyWarning } from "../pointAnomalyService";
import { pointAnomalyNoticeKey } from "../pointAnomalyPolicy.mjs";
import {
  ownerSmartSetupLaunchState,
  readOwnerSmartSetupSuccessState,
} from "../ownerSmartSetupContinuation.mjs";

const emptyKpis: RewardKpis = {
  rewardsRedeemedToday: 0,
  pointsIssuedToday: 0,
  stampsIssuedToday: 0,
  activeRewards: 0,
  activeCustomers: 0,
  newMembersToday: 0,
  newMembersThisWeek: 0,
  activeTodayCount: 0,
};
const emptyBoostKpis: BonusBoostKpis = { guestsCurrentlyBoosted: 0, guestsReturnedBecauseOfBoost: 0, successfulReferrals: 0, newCustomersFromReferrals: 0, boostExtraPoints: 0 };

function formatAnomalyAmount(cents: number) {
  return new Intl.NumberFormat("de-AT", { style: "currency", currency: "EUR" }).format(cents / 100);
}

function formatAnomalyTimestamp(value: string) {
  return new Intl.DateTimeFormat("de-AT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

export function AdminDashboard() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { activeRestaurant } = useTenant();
  const [rewardKpis, setRewardKpis] = useState<RewardKpis>(emptyKpis);
  const [boostKpis, setBoostKpis] = useState<BonusBoostKpis>(emptyBoostKpis);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [legalSetup, setLegalSetup] = useState<RestaurantLegalSetup | null>(null);
  const [legalLoadFailed, setLegalLoadFailed] = useState(false);
  const [setupStatus, setSetupStatus] = useState<DashboardSetupStatus | null>(null);
  const [setupLoadFailed, setSetupLoadFailed] = useState(false);
  const [seenNoticeIds, setSeenNoticeIds] = useState<Set<string>>(new Set());
  const [nextStepLoading, setNextStepLoading] = useState(true);
  const [pointAnomalies, setPointAnomalies] = useState<OwnerPointAnomalyWarning[]>([]);
  const [selectedPointAnomaly, setSelectedPointAnomaly] = useState<OwnerPointAnomalyWarning | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [smartSetupSuccess, setSmartSetupSuccess] = useState(
    () => readOwnerSmartSetupSuccessState(location.state)?.message ?? null,
  );

  useEffect(() => {
    const success = readOwnerSmartSetupSuccessState(location.state);
    if (!success) return;
    setSmartSetupSuccess(success.message);
    navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, location.state, navigate]);

  const reloadDashboard = useCallback(() => {
    setReloadKey((current) => current + 1);
  }, []);

  useEffect(() => {
    if (!activeRestaurant?.id) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setLoadError(false);

    Promise.all([loadRewardKpis(activeRestaurant.id), loadBonusBoostKpis(activeRestaurant.id)])
      .then(([nextRewardKpis, nextBoostKpis]) => {
        if (!cancelled) {
          setRewardKpis(nextRewardKpis);
          setBoostKpis(nextBoostKpis);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          console.error("Dashboard-Daten konnten nicht geladen werden.", error);
          setLoadError(true);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeRestaurant?.id, reloadKey]);

  useEffect(() => {
    if (!activeRestaurant?.id) {
      setLegalSetup(null);
      setSetupStatus(null);
      setSeenNoticeIds(new Set());
      setPointAnomalies([]);
      setSelectedPointAnomaly(null);
      setNextStepLoading(false);
      return;
    }
    let cancelled = false;
    setLegalSetup(null);
    setLegalLoadFailed(false);
    setSetupStatus(null);
    setSetupLoadFailed(false);
    setSeenNoticeIds(new Set());
    setPointAnomalies([]);
    setSelectedPointAnomaly(null);
    setNextStepLoading(true);

    Promise.allSettled([
      loadRestaurantLegalSetup(activeRestaurant.id),
      loadDashboardSetupStatus(activeRestaurant.id),
      loadSeenDashboardNotices(activeRestaurant.id),
      loadOwnerPointAnomalyWarnings(activeRestaurant.id, activeRestaurant.name),
    ]).then(([legalResult, setupResult, noticesResult, anomalyResult]) => {
      if (cancelled) return;
      if (legalResult.status === "fulfilled") setLegalSetup(legalResult.value);
      else setLegalLoadFailed(true);
      if (setupResult.status === "fulfilled") setSetupStatus(setupResult.value);
      else setSetupLoadFailed(true);
      if (noticesResult.status === "fulfilled") {
        setSeenNoticeIds(noticesResult.value);
      }
      if (anomalyResult.status === "fulfilled") setPointAnomalies(anomalyResult.value);
      else console.error("Hinweise zur Punktevergabe konnten nicht geladen werden.", anomalyResult.reason);
      setNextStepLoading(false);
    });
    return () => { cancelled = true; };
  }, [activeRestaurant?.id, activeRestaurant?.name, reloadKey]);

  const staffPath = activeRestaurant ? buildStaffLoginPath(activeRestaurant.slug) : "/admin";
  const dashboardKpis = [
    { icon: Users, label: "Kunden gesamt", value: String(rewardKpis.activeCustomers) },
    { icon: UserPlus, label: "Neue Kunden heute", value: String(rewardKpis.newMembersToday) },
    { icon: UserPlus, label: "Neue Kunden diese Woche", value: String(rewardKpis.newMembersThisWeek) },
    { icon: Activity, label: "Heute aktiv", value: String(rewardKpis.activeTodayCount) },
    { icon: Gift, label: "Einlösungen heute", value: String(rewardKpis.rewardsRedeemedToday) },
    { icon: Star, label: "Vergebene Bonuspunkte heute", value: String(rewardKpis.pointsIssuedToday) },
  ];
  const quickLinks = [
    { label: "QR Center", to: "/admin/qr", icon: QrCode },
    { label: "Punkteeinlösung", to: "/admin/rewards", icon: Gift },
    { label: "Gäste", to: "/admin/customers", icon: Users },
    { label: "Mitarbeiter", to: staffPath, icon: Smartphone },
  ];
  const dashboardIsEmpty = dashboardKpis.every((kpi) => kpi.value === "0");
  const legalRegistration = legalSetup?.readiness.registration;
  const recommendation = useMemo(() => nextStepLoading ? null : resolveOwnerDashboardRecommendation({
    restaurantStatus: { active: activeRestaurant?.status === "active" },
    onboardingStatus: activeRestaurant?.onboarding_status,
    legalStatus: legalRegistration ?? null,
    publicationStatus: { ready: setupStatus?.publicationReady ?? false },
    rewardStatus: {
      pointsRedemptionReady: setupStatus?.pointsRedemptionReady ?? false,
      birthdayPoolReady: setupStatus?.birthdayPoolReady ?? false,
    },
    offerStatus: { ready: setupStatus?.offerReady ?? false },
    qrStatus: { ready: Boolean(activeRestaurant?.slug) },
    staffStatus: { ready: setupStatus?.staffReady ?? false },
    emailStatus: { confirmed: Boolean(user?.email_confirmed_at) },
    statusLoadFailed: legalLoadFailed || setupLoadFailed,
  }), [activeRestaurant, legalLoadFailed, legalRegistration, nextStepLoading, setupLoadFailed, setupStatus, user?.email_confirmed_at]);
  const RecommendationIcon = recommendation?.icon === "publication"
    ? MapPinned
    : recommendation?.icon === "reward"
      ? Gift
      : recommendation?.icon === "birthday"
        ? CakeSlice
        : recommendation?.icon === "qr"
          ? QrCode
          : recommendation?.icon === "staff"
            ? Smartphone
            : Newspaper;
  const pointAnomaly = useMemo(
    () => pointAnomalies.find((warning) => !seenNoticeIds.has(pointAnomalyNoticeKey(warning.id))) ?? null,
    [pointAnomalies, seenNoticeIds],
  );

  function reviewPointAnomaly(warning: OwnerPointAnomalyWarning) {
    setSelectedPointAnomaly(warning);
    if (!activeRestaurant?.id) return;
    const noticeKey = pointAnomalyNoticeKey(warning.id);
    markDashboardNoticeSeen(activeRestaurant.id, noticeKey)
      .then(() => setSeenNoticeIds((current) => new Set([...current, noticeKey])))
      .catch(() => undefined);
  }

  return (
    <div className="premium-dashboard">
      <header className="page-header dashboard-page-header">
        <div>
          <span className="premium-dashboard-kicker">Dashboard</span>
          <h1>Heute im Restaurant</h1>
          <p className="muted">Dein Bonusprogramm auf einen Blick.</p>
        </div>
      </header>

      {smartSetupSuccess ? <p className="status-message" role="status">{smartSetupSuccess}</p> : null}

      {pointAnomaly ? (
        <section className="card dashboard-point-anomaly" aria-labelledby="point-anomaly-title" role="status">
          <span className="dashboard-point-anomaly-icon"><AlertTriangle aria-hidden="true" size={22} /></span>
          <div>
            <span className="premium-dashboard-kicker">Hinweis zur Punktevergabe</span>
            <h2 id="point-anomaly-title">Ungewöhnlich hoher Buchungsbetrag</h2>
            <p>Eine Punktebuchung liegt nahe am festgelegten Maximalbetrag. Bitte prüfe die Buchung.</p>
          </div>
          <button className="button secondary" onClick={() => reviewPointAnomaly(pointAnomaly)} type="button">
            Prüfen <ArrowRight aria-hidden="true" size={17} />
          </button>
        </section>
      ) : null}

      {loading ? (
        <section className="dashboard-kpi-grid" aria-label="Dashboard wird geladen" aria-busy="true">
          {dashboardKpis.map((kpi) => (
            <article className="card dashboard-kpi-card dashboard-kpi-skeleton" key={kpi.label}>
              <span className="premium-skeleton premium-skeleton-icon" />
              <span className="premium-skeleton premium-skeleton-value" />
              <span className="premium-skeleton premium-skeleton-label" />
            </article>
          ))}
        </section>
      ) : loadError ? (
        <section className="card premium-dashboard-state premium-dashboard-error" role="alert">
          <span className="dashboard-state-icon"><RefreshCw size={24} /></span>
          <div>
            <h2>Dashboard konnte nicht geladen werden</h2>
            <p>Die aktuellen Zahlen konnten nicht abgerufen werden. Bitte versuche es erneut.</p>
          </div>
          <button className="button" onClick={reloadDashboard} type="button">
            Erneut versuchen
          </button>
        </section>
      ) : (
        <>
          <section className="dashboard-kpi-grid" aria-label="Heute im Bonusprogramm">
            {dashboardKpis.map((kpi) => {
              const Icon = kpi.icon;
              return (
                <article className="card dashboard-kpi-card" key={kpi.label}>
                  <span className="dashboard-kpi-icon" aria-hidden="true"><Icon size={22} /></span>
                  <strong>{kpi.value}</strong>
                  <p>{kpi.label}</p>
                </article>
              );
            })}
          </section>
          {dashboardIsEmpty ? (
            <section className="premium-dashboard-empty" aria-label="Noch keine Aktivität">
              <Sparkles aria-hidden="true" size={20} />
              <p><strong>Noch keine Aktivität.</strong> Sobald Gäste dein Bonusprogramm nutzen, erscheinen hier die aktuellen Zahlen.</p>
            </section>
          ) : null}
        </>
      )}

      <section className="premium-dashboard-section" aria-labelledby="quick-access-title">
        <div className="premium-dashboard-section-heading">
          <div>
            <span className="premium-dashboard-kicker">Direkt erledigen</span>
            <h2 id="quick-access-title">Schnellzugriffe</h2>
          </div>
        </div>
        <div className="dashboard-quick-grid">
        {quickLinks.map((item) => {
          const Icon = item.icon;
          return (
            <Link className="card dashboard-quick-card" key={item.label} to={item.to}>
              <span className="dashboard-quick-icon"><Icon size={22} /></span>
              <span>
                <strong>{item.label}</strong>
                <small>Öffnen</small>
              </span>
              <ArrowRight aria-hidden="true" className="dashboard-quick-arrow" size={18} />
            </Link>
          );
        })}
        </div>
      </section>

      <section className="premium-dashboard-section" aria-labelledby="boost-overview-title">
        <div className="premium-dashboard-section-heading"><div><span className="premium-dashboard-kicker">Empfehlungen</span><h2 id="boost-overview-title">Bonus Boost</h2></div></div>
        <div className="dashboard-quick-grid">
          <article className="card dashboard-quick-card"><span className="dashboard-quick-icon"><UserPlus size={22} /></span><span><strong>{boostKpis.successfulReferrals}</strong><small>Erfolgreiche Empfehlungen</small></span></article>
          <article className="card dashboard-quick-card"><span className="dashboard-quick-icon"><Users size={22} /></span><span><strong>{boostKpis.newCustomersFromReferrals}</strong><small>Gewonnene Neukunden</small></span></article>
          <article className="card dashboard-quick-card"><span className="dashboard-quick-icon"><Sparkles size={22} /></span><span><strong>{boostKpis.guestsCurrentlyBoosted}</strong><small>Aktive Bonus Boosts</small></span></article>
          <article className="card dashboard-quick-card"><span className="dashboard-quick-icon"><Star size={22} /></span><span><strong>{boostKpis.boostExtraPoints}</strong><small>Zusatzpunkte durch Boost</small></span></article>
        </div>
      </section>

      {recommendation ? <section className="card dashboard-recommendation-card" aria-labelledby="owner-recommendation-title" aria-live="polite">
        <div>
          <h2>Heute für dich</h2>
          <p className="muted">Der wichtigste nächste Schritt für dein Restaurant.</p>
        </div>
        {recommendation.ctaHref ? (
          <Link className="dashboard-recommendation" state={ownerSmartSetupLaunchState(recommendation.id)} to={recommendation.ctaHref}>
            <span className="dashboard-recommendation-icon"><RecommendationIcon aria-hidden="true" size={22} /></span>
            <span>
              <strong id="owner-recommendation-title">{recommendation.title}</strong>
              <p className="muted">{recommendation.description}</p>
              <small className="dashboard-recommendation-cta">{recommendation.ctaLabel}</small>
            </span>
            <ArrowRight aria-hidden="true" size={20} />
          </Link>
        ) : (
          <button className="dashboard-recommendation" onClick={reloadDashboard} type="button">
            <span className="dashboard-recommendation-icon"><RecommendationIcon aria-hidden="true" size={22} /></span>
            <span>
              <strong id="owner-recommendation-title">{recommendation.title}</strong>
              <p className="muted">{recommendation.description}</p>
              <small className="dashboard-recommendation-cta">{recommendation.ctaLabel}</small>
            </span>
            <RefreshCw aria-hidden="true" size={20} />
          </button>
        )}
      </section> : null}

      <AppDrawer
        description="Dieser Hinweis dient ausschließlich der Prüfung und verändert weder Punkte noch Kontozugänge."
        footer={<button className="button" onClick={() => setSelectedPointAnomaly(null)} type="button">Schließen</button>}
        onClose={() => setSelectedPointAnomaly(null)}
        open={Boolean(selectedPointAnomaly)}
        size="compact"
        title="Ungewöhnlich hoher Buchungsbetrag"
      >
        {selectedPointAnomaly ? (
          <dl className="point-anomaly-detail">
            <div><dt>Zeitpunkt</dt><dd>{formatAnomalyTimestamp(selectedPointAnomaly.createdAt)}</dd></div>
            <div><dt>Betrag</dt><dd>{formatAnomalyAmount(selectedPointAnomaly.amountCents)}</dd></div>
            <div><dt>Gutgeschriebene Punkte</dt><dd>{selectedPointAnomaly.points.toLocaleString("de-AT")}</dd></div>
            <div><dt>Gast</dt><dd>{selectedPointAnomaly.customerName}</dd></div>
            <div><dt>Ausgeführt von</dt><dd>{selectedPointAnomaly.actorLabel}</dd></div>
            <div><dt>Restaurant</dt><dd>{selectedPointAnomaly.restaurantName}</dd></div>
            <div><dt>Buchungsreferenz</dt><dd>{selectedPointAnomaly.transactionReference}</dd></div>
          </dl>
        ) : null}
      </AppDrawer>
    </div>
  );
}
