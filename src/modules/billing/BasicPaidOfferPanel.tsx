import { useState } from "react";
import { acceptBasicOfferAndOpenTestCheckout } from "./basicBillingService";

export function BasicPaidOfferPanel({ restaurantId }: { restaurantId: string }) {
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function continueToCheckout() {
    if (!accepted || busy) return;
    setBusy(true);
    setError("");
    try {
      const url = await acceptBasicOfferAndOpenTestCheckout(restaurantId);
      window.location.assign(url);
    } catch {
      setError("Die sichere Testbestellung konnte nicht gestartet werden. Bitte versuche es später erneut.");
      setBusy(false);
    }
  }

  return <section className="settings-info-card" aria-labelledby="basic-paid-offer-title">
    <h3 id="basic-paid-offer-title">BASIC kostenpflichtig fortsetzen</h3>
    <p><strong>59 € netto pro Monat</strong>, monatlich kündbar. Der kostenlose Zeitraum endet ohne automatische Belastung.</p>
    <label className="settings-location-toggle">
      <input checked={accepted} onChange={(event) => setAccepted(event.target.checked)} type="checkbox" />
      <span><strong>Kostenpflichtiges BASIC-Angebot ausdrücklich annehmen</strong><small>Die Bestellung beginnt erst im sicheren Stripe-Test-Checkout. Es gibt keine automatische Umwandlung aus der Testphase.</small></span>
    </label>
    <button className="button" disabled={!accepted || busy} onClick={() => void continueToCheckout()} type="button">
      {busy ? "Sicherer Checkout wird vorbereitet …" : "Zahlungspflichtig bestellen"}
    </button>
    {error ? <p className="status-message error" role="alert">{error}</p> : null}
  </section>;
}
