import { QrCode, Sparkles, Store } from "lucide-react";
import {
  PublicContentCard,
  PublicEntryCard,
  PublicPageShell,
  PublicPrimaryLink,
} from "./PublicPageComponents";

export function PublicHome() {
  return (
    <PublicPageShell
      description="Ein Login für Restaurants. Ein QR für Gäste."
      eyebrow="WUXUAI Bonus"
      title="Restaurant Bonus einfach starten."
      width="entry"
    >
      <div className="public-premium-entry-grid">
        <PublicEntryCard action="Öffnen" description="Für Restaurantbesitzer und Manager." icon={Store} title="Restaurant Login" to="/login" />
        <PublicEntryCard action="Kostenlos starten" description="Bonusprogramm in wenigen Minuten einrichten und 30 Tage kostenlos testen." icon={Sparkles} title="Restaurant registrieren" to="/register" />
        <PublicEntryCard action="Öffnen" description="Bonuskonto öffnen oder den QR-Code im Restaurant scannen." icon={QrCode} title="Gast-Bonus öffnen" to="/customer" />
      </div>
    </PublicPageShell>
  );
}

export function GuestBonusInfoPage() {
  return (
    <PublicPageShell
      description="Scanne den QR-Code im Restaurant oder öffne deinen persönlichen Bonus-Link."
      eyebrow="WUXUAI Bonus"
      title="Bonus für Gäste"
    >
      <PublicContentCard className="public-premium-guest-card">
        <div className="public-premium-guest-heading">
          <span className="public-premium-guest-icon" aria-hidden="true"><QrCode size={26} /></span>
          <h2>So kommst du zu deinem Bonuskonto</h2>
        </div>
        <ol className="public-premium-steps">
          <li>QR-Code im Restaurant scannen</li>
          <li>Das richtige Restaurant wird automatisch erkannt</li>
          <li>Bonus sammeln und Punkteeinlösungen nutzen</li>
        </ol>
        <p className="public-premium-notice">Bereits Mitglied? Öffne deinen persönlichen Bonus-Link erneut.</p>
        <PublicPrimaryLink to="/">Zurück zur Startseite</PublicPrimaryLink>
      </PublicContentCard>
    </PublicPageShell>
  );
}
