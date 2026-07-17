import { ArrowRight, QrCode, Sparkles, Store } from "lucide-react";
import { Link } from "react-router-dom";

export function PublicHome() {
  return (
    <main className="public-shell">
      <section className="public-entry">
        <div>
          <span className="pill">WUXUAI Bonus</span>
          <h1>Restaurant Bonus einfach starten.</h1>
          <p className="muted">Ein Login für Restaurants. Ein QR für Gäste.</p>
        </div>

        <div className="public-entry-grid">
          <Link className="public-entry-card" to="/login">
            <Store size={40} />
            <div>
              <h2>Restaurant Login</h2>
              <p>Für Restaurantbesitzer und Manager.</p>
              <span className="public-entry-action">Öffnen <ArrowRight size={16} /></span>
            </div>
          </Link>

          <Link className="public-entry-card" to="/register">
            <Sparkles size={40} />
            <div>
              <h2>Restaurant registrieren</h2>
              <p>Bonusprogramm in wenigen Minuten einrichten und 30 Tage kostenlos testen.</p>
              <span className="public-entry-action">Kostenlos starten <ArrowRight size={16} /></span>
            </div>
          </Link>

          <Link className="public-entry-card" to="/customer">
            <QrCode size={40} />
            <div>
              <h2>Gast-Bonus öffnen</h2>
              <p>Bonuskonto öffnen oder den QR-Code im Restaurant scannen.</p>
              <span className="public-entry-action">Öffnen <ArrowRight size={16} /></span>
            </div>
          </Link>
        </div>
      </section>
    </main>
  );
}

export function GuestBonusInfoPage() {
  return (
    <main className="public-shell">
      <section className="public-entry guest-entry-page">
        <div>
          <span className="pill">WUXUAI Bonus</span>
          <h1>Bonus für Gäste</h1>
          <p className="muted">Scanne den QR-Code im Restaurant oder öffne deinen persönlichen Bonus-Link.</p>
        </div>

        <div className="guest-entry-card">
          <QrCode size={44} />
          <div>
            <h2>So kommst du zu deinem Bonuskonto</h2>
            <p>Der QR-Code im Restaurant erkennt automatisch das richtige Bonusprogramm.</p>
            <p>Wenn du schon Mitglied bist, kannst du deinen persönlichen Bonus-Link erneut öffnen.</p>
          </div>
          <Link className="button secondary-button" to="/">
            Zurück zur Startseite
          </Link>
        </div>
      </section>
    </main>
  );
}
