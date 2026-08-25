import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, AlertCircle, ArrowRight, CheckCircle2, CircleDot, Gift, QrCode, RefreshCw, Smartphone, Sparkles, Star, UserPlus, Users, X } from "lucide-react";
import { Link } from "react-router-dom";
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
import { resolveDashboardNextStep } from "../dashboardNextStep.mjs";
import { buildStaffLoginPath } from "../../auth/staffLoginFlow.mjs";

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

export function AdminDashboard() {
  const { user } = useAuth();
  const { activeRestaurant, branding } = useTenant();
  const [rewardKpis, setRewardKpis] = useState<RewardKpis>(emptyKpis);
  const [boostKpis, setBoostKpis] = useState<BonusBoostKpis>(emptyBoostKpis);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [legalSetup, setLegalSetup] = useState<RestaurantLegalSetup | null>(null);
  const [legalLoadFailed, setLegalLoadFailed] = useState(false);
  const [setupStatus, setSetupStatus] = useState<DashboardSetupStatus | null>(null);
  const [setupLoadFailed, setSetupLoadFailed] = useState(false);
  const [seenNoticeIds, setSeenNoticeIds] = useState<Set<string>>(new Set());
  const [noticePersistenceAvailable, setNoticePersistenceAvailable] = useState(false);
  const [nextStepLoading, setNextStepLoading] = useState(true);
  const markingNoticeIds = useRef(new Set<string>());
  const [reloadKey, setReloadKey] = useState(0);

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
      setNoticePersistenceAvailable(false);
      setNextStepLoading(false);
      return;
    }
    let cancelled = false;
    setLegalSetup(null);
    setLegalLoadFailed(false);
    setSetupStatus(null);
    setSetupLoadFailed(false);
    setSeenNoticeIds(new Set());
    setNoticePersistenceAvailable(false);
    setNextStepLoading(true);
    markingNoticeIds.current.clear();

    Promise.allSettled([
      loadRestaurantLegalSetup(activeRestaurant.id),
      loadDashboardSetupStatus(activeRestaurant.id),
      loadSeenDashboardNotices(activeRestaurant.id),
    ]).then(([legalResult, setupResult, noticesResult]) => {
      if (cancelled) return;
      if (legalResult.status === "fulfilled") setLegalSetup(legalResult.value);
      else setLegalLoadFailed(true);
      if (setupResult.status === "fulfilled") setSetupStatus(setupResult.value);
      else setSetupLoadFailed(true);
      if (noticesResult.status === "fulfilled") {
        setSeenNoticeIds(noticesResult.value);
        setNoticePersistenceAvailable(true);
      }
      setNextStepLoading(false);
    });
    return () => { cancelled = true; };
  }, [activeRestaurant?.id, reloadKey]);

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
  const nextStep = useMemo(() => nextStepLoading ? null : resolveDashboardNextStep({
    restaurantStatus: { active: activeRestaurant?.status === "active" },
    onboardingStatus: activeRestaurant?.onboarding_status,
    legalStatus: legalRegistration ?? null,
    rewardStatus: {
      pointsRedemptionReady: setupStatus?.pointsRedemptionReady ?? false,
      welcomeGiftReady: setupStatus?.welcomeGiftReady ?? false,
      birthdayPoolReady: setupStatus?.birthdayPoolReady ?? false,
    },
    qrStatus: { ready: Boolean(activeRestaurant?.slug) },
    pointsFlowStatus: { ready: setupStatus?.pointsFlowReady ?? false },
    emailStatus: { confirmed: Boolean(user?.email_confirmed_at) },
    profileStatus: { logoAvailable: Boolean(branding?.logo_url) },
    referralStatus: { enabled: setupStatus?.referralEnabled ?? false },
    seenNoticeIds,
    persistenceAvailable: noticePersistenceAvailable,
    statusLoadFailed: legalLoadFailed || setupLoadFailed,
  }), [activeRestaurant, branding?.logo_url, legalLoadFailed, legalRegistration, nextStepLoading, noticePersistenceAvailable, seenNoticeIds, setupLoadFailed, setupStatus, user?.email_confirmed_at]);
  const NextStepIcon = nextStep?.category === "success" ? CheckCircle2 : nextStep?.category === "critical" ? AlertCircle : nextStep?.category === "optimization" ? Sparkles : CircleDot;

  useEffect(() => {
    if (!activeRestaurant?.id || nextStep?.category !== "success" || markingNoticeIds.current.has(nextStep.id)) return;
    markingNoticeIds.current.add(nextStep.id);
    markDashboardNoticeSeen(activeRestaurant.id, nextStep.id).catch(() => {
      markingNoticeIds.current.delete(nextStep.id);
    });
  }, [activeRestaurant?.id, nextStep]);

  async function dismissNextStep() {
    if (!activeRestaurant?.id || !nextStep?.dismissible) return;
    try {
      await markDashboardNoticeSeen(activeRestaurant.id, nextStep.id);
      setSeenNoticeIds((current) => new Set([...current, nextStep.id]));
    } catch {
      // Der Hinweis bleibt sichtbar, wenn die persistente Speicherung fehlschlägt.
    }
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

      {nextStep ? (
        <section className={`card dashboard-next-step ${nextStep.category}`} aria-labelledby="dashboard-next-step-title" aria-live={nextStep.category === "critical" ? "assertive" : "polite"}>
          <span className="dashboard-next-step-icon"><NextStepIcon aria-hidden="true" size={21} /></span>
          <div className="dashboard-next-step-copy">
            <span className="premium-dashboard-kicker">{nextStep.category === "critical" ? "Wichtiger Hinweis" : nextStep.category === "success" ? "Startklar" : "Nächster Schritt"}</span>
            <h2 id="dashboard-next-step-title">{nextStep.title}</h2>
            <p>{nextStep.description}</p>
          </div>
          {nextStep.ctaLabel ? (
            nextStep.ctaHref ? <Link className="button secondary" to={nextStep.ctaHref}>{nextStep.ctaLabel}<ArrowRight aria-hidden="true" size={17} /></Link>
              : <button className="button secondary" onClick={reloadDashboard} type="button">{nextStep.ctaLabel}<RefreshCw aria-hidden="true" size={17} /></button>
          ) : null}
          {nextStep.dismissible ? <button aria-label="Hinweis schließen" className="dashboard-next-step-dismiss" onClick={dismissNextStep} title="Hinweis schließen" type="button"><X aria-hidden="true" size={18} /></button> : null}
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

      <section className="card dashboard-recommendation-card">
        <div>
          <h2>Heute für dich</h2>
          <p className="muted">Eine einfache Empfehlung für heute.</p>
        </div>
        <Link className="dashboard-recommendation" to="/admin/rewards">
          <span className="dashboard-recommendation-icon"><Sparkles size={22} /></span>
          <span>
            <strong>Neue Punkteeinlösung erstellen</strong>
            <p className="muted">Lege ein Produkt fest, das Gäste mit Punkten einlösen können.</p>
          </span>
          <ArrowRight aria-hidden="true" size={20} />
        </Link>
      </section>
    </div>
  );
}
