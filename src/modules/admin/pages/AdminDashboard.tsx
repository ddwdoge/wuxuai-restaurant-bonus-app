import { useEffect, useState } from "react";
import { Activity, Flame, Gift, QrCode, Smartphone, Sparkles, Star, UserPlus, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { loadBonusBoostKpis, type BonusBoostKpis } from "../../loyalty/loyaltyService";
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

const emptyBonusBoostKpis: BonusBoostKpis = {
  guestsCurrentlyBoosted: 0,
  guestsReturnedBecauseOfBoost: 0,
};

export function AdminDashboard() {
  const { activeRestaurant } = useTenant();
  const [rewardKpis, setRewardKpis] = useState<RewardKpis>(emptyKpis);
  const [bonusBoostKpis, setBonusBoostKpis] = useState<BonusBoostKpis>(emptyBonusBoostKpis);

  useEffect(() => {
    if (!activeRestaurant?.id) return;

    let cancelled = false;

    Promise.all([
      loadRewardKpis(activeRestaurant.id),
      loadBonusBoostKpis(activeRestaurant.id),
    ])
      .then(([nextRewardKpis, nextBonusBoostKpis]) => {
        if (!cancelled) {
          setRewardKpis(nextRewardKpis);
          setBonusBoostKpis(nextBonusBoostKpis);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          console.error("Dashboard-Daten konnten nicht geladen werden.", error);
          setRewardKpis(emptyKpis);
          setBonusBoostKpis(emptyBonusBoostKpis);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeRestaurant?.id]);

  const staffPath = activeRestaurant ? `/staff/${activeRestaurant.slug}` : "/admin";
  const dashboardKpis = [
    { icon: Users, label: "Kunden gesamt", value: String(rewardKpis.activeCustomers) },
    { icon: UserPlus, label: "Neue Kunden heute", value: String(rewardKpis.newMembersToday) },
    { icon: UserPlus, label: "Neue Kunden diese Woche", value: String(rewardKpis.newMembersThisWeek) },
    { icon: Activity, label: "Heute aktiv", value: String(rewardKpis.activeTodayCount) },
    { icon: Star, label: "Vergebene Bonuspunkte heute", value: String(rewardKpis.pointsIssuedToday) },
    { icon: Gift, label: "Einlösungen heute", value: String(rewardKpis.rewardsRedeemedToday) },
    { icon: Flame, label: "Bonus Boost aktiv", value: String(bonusBoostKpis.guestsCurrentlyBoosted) },
    { icon: Activity, label: "Wiederkehrende Gäste", value: String(bonusBoostKpis.guestsReturnedBecauseOfBoost) },
  ];
  const quickLinks = [
    { label: "QR Center", to: "/admin/qr", icon: QrCode },
    { label: "Punkteeinlösung", to: "/admin/rewards", icon: Gift },
    { label: "Gäste", to: "/admin/customers", icon: Users },
    { label: "Mitarbeiter", to: staffPath, icon: Smartphone },
  ];

  return (
    <>
      <header className="page-header dashboard-page-header">
        <div>
          <h1>Heute im Restaurant</h1>
          <p className="muted">Dein Bonusprogramm auf einen Blick.</p>
        </div>
      </header>

      <section className="dashboard-kpi-grid" aria-label="Heute im Bonusprogramm">
        {dashboardKpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <article className="card dashboard-kpi-card" key={kpi.label}>
              <span className="dashboard-kpi-icon" aria-hidden="true"><Icon size={24} /></span>
              <strong>{kpi.value}</strong>
              <p>{kpi.label}</p>
            </article>
          );
        })}
      </section>

      <section className="dashboard-quick-grid" aria-label="Schnellzugriffe">
        {quickLinks.map((item) => {
          const Icon = item.icon;
          return (
            <Link className="card dashboard-quick-card" key={item.label} to={item.to}>
              <Icon size={28} />
              <strong>{item.label}</strong>
            </Link>
          );
        })}
      </section>

      <section className="card dashboard-recommendation-card">
        <div>
          <h2>Heute für dich</h2>
          <p className="muted">Eine einfache Empfehlung für heute.</p>
        </div>
        <article className="dashboard-recommendation">
          <Sparkles size={28} />
          <strong>Neue Punkteeinlösung erstellen</strong>
          <p className="muted">Lege ein Produkt fest, das Gäste mit Punkten einlösen können.</p>
        </article>
      </section>
    </>
  );
}
