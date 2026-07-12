import { useEffect, useState } from "react";
import { Gift, QrCode, Smartphone, Sparkles, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { demoCustomers } from "../../../shared/lib/demoData";
import { supabase } from "../../../shared/lib/supabase";
import { loadBonusBoostKpis, type BonusBoostKpis } from "../../loyalty/loyaltyService";
import { loadRewardKpis, type RewardKpis } from "../../rewards/rewardService";
import { useTenant } from "../../tenant/TenantProvider";

const fallbackKpis: RewardKpis = {
  rewardsRedeemedToday: 0,
  pointsIssuedToday: 0,
  stampsIssuedToday: 0,
  activeRewards: 0,
  activeCustomers: 0,
};

const fallbackBonusBoostKpis: BonusBoostKpis = {
  guestsCurrentlyBoosted: 0,
  guestsReturnedBecauseOfBoost: 0,
};

async function loadNewMembersToday(restaurantId: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (!supabase) {
    return demoCustomers.filter(
      (customer) => customer.restaurant_id === restaurantId && new Date(customer.created_at) >= today,
    ).length;
  }

  const { count, error } = await supabase
    .from("customers")
    .select("id", { count: "exact", head: true })
    .eq("restaurant_id", restaurantId)
    .gte("created_at", today.toISOString());

  if (error) throw error;
  return count ?? 0;
}

export function AdminDashboard() {
  const { activeRestaurant } = useTenant();
  const [rewardKpis, setRewardKpis] = useState<RewardKpis>(fallbackKpis);
  const [newMembersToday, setNewMembersToday] = useState(0);
  const [bonusBoostKpis, setBonusBoostKpis] = useState<BonusBoostKpis>(fallbackBonusBoostKpis);

  useEffect(() => {
    if (!activeRestaurant?.id) return;

    let cancelled = false;

    Promise.all([
      loadRewardKpis(activeRestaurant.id),
      loadNewMembersToday(activeRestaurant.id),
      loadBonusBoostKpis(activeRestaurant.id),
    ])
      .then(([nextRewardKpis, nextNewMembersToday, nextBonusBoostKpis]) => {
        if (!cancelled) {
          setRewardKpis(nextRewardKpis);
          setNewMembersToday(nextNewMembersToday);
          setBonusBoostKpis(nextBonusBoostKpis);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          console.error("Dashboard-Daten konnten nicht geladen werden.", error);
          setRewardKpis(fallbackKpis);
          setNewMembersToday(0);
          setBonusBoostKpis(fallbackBonusBoostKpis);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeRestaurant?.id]);

  const staffPath = activeRestaurant ? `/staff/${activeRestaurant.slug}` : "/admin";
  const dashboardKpis = [
    { icon: "👥", label: "Neue Mitglieder heute", value: String(newMembersToday) },
    { icon: "⭐", label: "Vergebene Bonuspunkte heute", value: String(rewardKpis.pointsIssuedToday) },
    { icon: "🎁", label: "Eingelöste Punkteeinlösungen", value: String(rewardKpis.rewardsRedeemedToday) },
    { icon: "🔥", label: "Bonus Boost aktiv", value: String(bonusBoostKpis.guestsCurrentlyBoosted) },
    { icon: "📈", label: "Wiederkehrende Gäste", value: String(bonusBoostKpis.guestsReturnedBecauseOfBoost) },
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
        {dashboardKpis.map((kpi) => (
          <article className="card dashboard-kpi-card" key={kpi.label}>
            <span className="dashboard-kpi-icon" aria-hidden="true">{kpi.icon}</span>
            <strong>{kpi.value}</strong>
            <p>{kpi.label}</p>
          </article>
        ))}
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
          <strong>💡 Neue Punkteeinlösung erstellen</strong>
          <p className="muted">Lege ein Produkt fest, das Gäste mit Punkten einlösen können.</p>
        </article>
      </section>
    </>
  );
}
