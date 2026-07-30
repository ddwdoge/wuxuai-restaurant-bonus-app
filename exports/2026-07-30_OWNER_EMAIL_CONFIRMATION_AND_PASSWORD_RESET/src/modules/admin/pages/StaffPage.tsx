import { Activity, ArrowRight, KeyRound, Smartphone, UserCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { useTenant } from "../../tenant/TenantProvider";

export function StaffPage() {
  const { activeRestaurant } = useTenant();
  const staffTabletPath = activeRestaurant ? `/staff/${activeRestaurant.slug}` : "/admin";

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Mitarbeiter</h1>
          <p className="muted">Team-Zugänge, Tages-PIN und heutige Aktivität.</p>
        </div>
        <Link className="button secondary" to={staffTabletPath}>
          <Smartphone size={18} />
          Team Tablet öffnen
        </Link>
      </header>

      <section className="staff-admin-grid">
        <article className="card staff-admin-card">
          <UserCheck size={28} />
          <h2>Team</h2>
          <p className="muted">Für V1 ist das Team Tablet bereits nutzbar.</p>
          <span className="staff-admin-card-badge">Mitarbeiterverwaltung folgt</span>
        </article>
        <Link
          aria-label="Team Tablet öffnen und Tages-PIN anzeigen"
          className="card staff-admin-card staff-admin-card-clickable"
          to={staffTabletPath}
        >
          <KeyRound size={28} />
          <h2>Tages-PIN</h2>
          <p className="muted">Die Tages-PIN wird automatisch im Team Tablet angezeigt.</p>
          <span className="staff-admin-card-action">
            Team Tablet öffnen
            <ArrowRight size={16} />
          </span>
        </Link>
        <article className="card staff-admin-card">
          <Activity size={28} />
          <h2>Heutige Aktivität</h2>
          <p className="muted">Aktivitätsdetails folgen.</p>
          <span className="staff-admin-card-badge">Bald verfügbar</span>
        </article>
      </section>

      <section className="card empty-state-card staff-admin-empty">
        <h2>Mitarbeiterverwaltung folgt</h2>
        <p className="muted">
          Für V1 ist das Team Tablet bereits nutzbar. Die Verwaltung von Teammitgliedern wird hier sauber angeschlossen.
        </p>
      </section>
    </>
  );
}
