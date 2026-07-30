import { QrCode, Store } from "lucide-react";
import { productTerminology } from "../../config/productTerminology";
import {
  PublicContentCard,
  PublicEntryCard,
  PublicPageShell,
  PublicPrimaryLink,
} from "./PublicPageComponents";

export function PublicHome() {
  return (
    <PublicPageShell
      description={productTerminology.productTagline}
      eyebrow={productTerminology.productName}
      title={productTerminology.productName}
      width="entry"
    >
      <div className="public-premium-entry-grid">
        <PublicEntryCard action="Öffnen" description="Für Betreiber und Manager." icon={Store} title="Betreiber-Login" to="/login" />
        <PublicEntryCard action="Öffnen" description="Bonus-Konto öffnen oder den QR-Code im Geschäft scannen." icon={QrCode} title="Kunden-Bonus öffnen" to="/customer" />
      </div>
    </PublicPageShell>
  );
}

export function GuestBonusInfoPage() {
  return (
    <PublicPageShell
      description="Scanne den QR-Code im Geschäft, um dein Bonusprogramm zu öffnen."
      eyebrow={productTerminology.productName}
      title="Dein Bonus"
    >
      <PublicContentCard className="public-premium-guest-card">
        <div className="public-premium-guest-heading">
          <span className="public-premium-guest-icon" aria-hidden="true"><QrCode size={26} /></span>
          <h2>So kommst du zu deinem Bonuskonto</h2>
        </div>
        <ol className="public-premium-steps">
          <li>QR-Code im Geschäft scannen</li>
          <li>Das richtige Unternehmen wird automatisch erkannt</li>
          <li>Bonus sammeln und Punkteeinlösungen nutzen</li>
        </ol>
        <p className="public-premium-notice">Bereits Mitglied? Öffne deinen persönlichen Bonus-Link erneut.</p>
        <PublicPrimaryLink to="/">Zurück zur Startseite</PublicPrimaryLink>
      </PublicContentCard>
    </PublicPageShell>
  );
}
