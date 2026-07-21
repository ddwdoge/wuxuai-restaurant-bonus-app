import { useCallback, useEffect, useState } from "react";
import { Activity, ArrowRight, Gift, QrCode, RefreshCw, Smartphone, Sparkles, Star, UserPlus, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { loadRewardKpis, type RewardKpis } from "../../rewards/rewardService";
import { useTenant } from "../../tenant/TenantProvider";

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

export function AdminDashboard() {
  const { activeRestaurant } = useTenant();
  const [rewardKpis, setRewardKpis] = useState<RewardKpis>(emptyKpis);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
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

    loadRewardKpis(activeRestaurant.id)
      .then((nextRewardKpis) => {
        if (!cancelled) {
          setRewardKpis(nextRewardKpis);
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

  return (
    <div className="premium-dashboard">
      <header className="page-header dashboard-page-header">
        <div>
          <span className="premium-dashboard-kicker">Dashboard</span>
          <h1>Heute im Restaurant</h1>
          <p className="muted">Dein Bonusprogramm auf einen Blick.</p>
        </div>
      </header>

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
