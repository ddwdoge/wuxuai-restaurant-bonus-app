import { QrCode, Sparkles, Store } from "lucide-react";
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
            </div>
          </Link>

          <Link className="public-entry-card" to="/register">
            <Sparkles size={40} />
            <div>
              <h2>30 Tage kostenlos starten</h2>
              <p>Für Restaurants, die ihr Bonusprogramm neu eröffnen.</p>
            </div>
          </Link>

          <Link className="public-entry-card" to="/customer">
            <QrCode size={40} />
            <div>
              <h2>Customer QR / Bonus</h2>
              <p>Für Gäste, die ihren Bonus öffnen möchten.</p>
            </div>
          </Link>
        </div>
      </section>
    </main>
  );
}
