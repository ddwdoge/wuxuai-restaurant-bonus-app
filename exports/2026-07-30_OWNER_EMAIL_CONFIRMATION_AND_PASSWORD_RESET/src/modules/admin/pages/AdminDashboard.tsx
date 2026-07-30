import { useCallback, useEffect, useState } from "react";
import { Activity, AlertCircle, ArrowRight, CheckCircle2, Clock3, Gift, QrCode, RefreshCw, ShieldCheck, Smartphone, Sparkles, Star, UserPlus, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { loadRewardKpis, type RewardKpis } from "../../rewards/rewardService";
import { loadBonusBoostKpis, type BonusBoostKpis } from "../../loyalty/loyaltyService";
import { useTenant } from "../../tenant/TenantProvider";
import { loadRestaurantLegalSetup, type RestaurantLegalSetup } from "../../legal/legalService";

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
  const { activeRestaurant } = useTenant();
  const [rewardKpis, setRewardKpis] = useState<RewardKpis>(emptyKpis);
  const [boostKpis, setBoostKpis] = useState<BonusBoostKpis>(emptyBoostKpis);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [legalSetup, setLegalSetup] = useState<RestaurantLegalSetup | null>(null);
  const [legalLoading, setLegalLoading] = useState(true);
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
      setLegalLoading(false);
      return;
    }
    let cancelled = false;
    setLegalSetup(null);
    setLegalLoading(true);
    loadRestaurantLegalSetup(activeRestaurant.id)
      .then((next) => {
        if (!cancelled) setLegalSetup(next);
      })
      .catch(() => {
        if (!cancelled) setLegalSetup(null);
      })
      .finally(() => {
        if (!cancelled) setLegalLoading(false);
      });
    return () => { cancelled = true; };
  }, [activeRestaurant?.id, reloadKey]);

  const staffPath = activeRestaurant ? `/staff/${activeRestaurant.slug}` : "/admin";
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
  const LegalStatusIcon = legalRegistration?.status === "green" ? CheckCircle2 : legalRegistration?.status === "yellow" ? Clock3 : AlertCircle;

  return (
    <div className="premium-dashboard">
      <header className="page-header dashboard-page-header">
        <div>
          <span className="premium-dashboard-kicker">Dashboard</span>
          <h1>Heute im Restaurant</h1>
          <p className="muted">Dein Bonusprogramm auf einen Blick.</p>
        </div>
      </header>

      <section className={`card dashboard-legal-status ${legalRegistration?.status ?? "red"}`} aria-labelledby="dashboard-legal-title" aria-live="polite">
        <span className="dashboard-legal-icon"><LegalStatusIcon aria-hidden="true" size={23} /></span>
        <div>
          <span className="premium-dashboard-kicker">Rechtlicher Status</span>
          <h2 id="dashboard-legal-title">{legalLoading ? "Status wird geprüft" : legalRegistration?.label ?? "Status derzeit nicht verfügbar"}</h2>
          <p>{legalLoading ? "Unternehmensdaten und aktive Dokumentversionen werden serverseitig geprüft." : legalRegistration?.reason ?? "Öffne das Legal Center und versuche die Prüfung erneut."}</p>
          <small>Letzte Aktualisierung: {legalRegistration?.last_updated_at ? new Intl.DateTimeFormat("de-AT", { dateStyle: "medium", timeStyle: "short" }).format(new Date(legalRegistration.last_updated_at)) : "–"}</small>
        </div>
        <Link className="button secondary" to="/admin/legal"><ShieldCheck aria-hidden="true" size={18} /> Legal Center öffnen</Link>
      </section>

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
