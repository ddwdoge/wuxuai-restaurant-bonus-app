import { useState } from "react";
import { acceptBasicOfferAndOpenTestCheckout, type BasicPaidContractMode } from "./basicBillingService";

export function BasicPaidOfferPanel({ restaurantId, mode }: { restaurantId: string; mode: BasicPaidContractMode }) {
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  async function continueToCheckout() {
    if (!accepted || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await acceptBasicOfferAndOpenTestCheckout(restaurantId, mode);
      if (result.status === "DECISION_SAVED") {
        setSaved(true);
        setBusy(false);
        return;
      }
      window.location.assign(result.url);
    } catch {
      setError("Die sichere Testbestellung konnte nicht gestartet werden. Bitte versuche es später erneut.");
      setBusy(false);
    }
  }

  return <section className="settings-info-card" aria-labelledby="basic-paid-offer-title">
    <h3 id="basic-paid-offer-title">{mode === "REACTIVATION" ? "BASIC erneut bestellen" : "BASIC kostenpflichtig fortsetzen"}</h3>
    <p><strong>59 € netto pro Monat</strong>, monatlich kündbar. {mode === "REACTIVATION"
      ? "Die Reaktivierung ist ein neuer, ausdrücklich angenommener Vertrag."
      : "Der kostenlose Zeitraum endet ohne automatische Belastung."}</p>
    <label className="settings-location-toggle">
      <input checked={accepted} onChange={(event) => setAccepted(event.target.checked)} type="checkbox" />
      <span><strong>{mode === "REACTIVATION" ? "Neuen kostenpflichtigen BASIC-Vertrag ausdrücklich annehmen" : "Kostenpflichtiges BASIC-Angebot ausdrücklich annehmen"}</strong><small>Die Bestellung beginnt erst im sicheren Stripe-Test-Checkout. Es gibt keine automatische Umwandlung aus der Testphase.</small></span>
    </label>
    <button className="button" disabled={!accepted || busy} onClick={() => void continueToCheckout()} type="button">
      {busy ? "Sicherer Checkout wird vorbereitet …" : "Zahlungspflichtig bestellen"}
    </button>
    {saved ? <p className="status-message success" role="status">Deine Entscheidung ist gespeichert. Der Checkout wird erst nach dem Ende der Testphase freigeschaltet.</p> : null}
    {error ? <p className="status-message error" role="alert">{error}</p> : null}
  </section>;
}
