import { useEffect, useRef, useState } from "react";
import {
  acceptBasicOfferAndOpenTestCheckout,
  openAcceptedBasicTestCheckout,
  type BasicPaidContractMode,
} from "./basicBillingService";

export function BasicPaidOfferPanel({ acceptanceId = null, checkoutAllowed, restaurantId, mode }: {
  acceptanceId?: string | null;
  checkoutAllowed: boolean;
  restaurantId: string;
  mode: BasicPaidContractMode;
}) {
  const [savedAcceptanceId, setSavedAcceptanceId] = useState(acceptanceId);
  const [accepted, setAccepted] = useState(Boolean(acceptanceId));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const context = useRef(`${restaurantId}:${mode}`);
  const hasAcceptance = Boolean(savedAcceptanceId);

  useEffect(() => {
    context.current = `${restaurantId}:${mode}`;
    setSavedAcceptanceId(acceptanceId);
    setAccepted(Boolean(acceptanceId));
    setError("");
  }, [acceptanceId, restaurantId, mode]);

  async function continueToCheckout() {
    if (!accepted || inFlight.current) return;
    inFlight.current = true;
    const requestContext = `${restaurantId}:${mode}`;
    setBusy(true);
    setError("");
    try {
      const result = savedAcceptanceId
        ? await openAcceptedBasicTestCheckout(savedAcceptanceId)
        : await acceptBasicOfferAndOpenTestCheckout(restaurantId, mode);
      if (requestContext !== context.current) return;
      if (result.status === "DECISION_SAVED") {
        setSavedAcceptanceId(result.acceptanceId);
        setAccepted(true);
        setBusy(false);
        return;
      }
      window.location.assign(result.url);
    } catch {
      if (requestContext === context.current) {
        setError("Der Ausgang der Testbestellung ist noch unklar. Ein erneuter Versuch prüft denselben Vorgang; es wird keine zweite Bestellung angelegt.");
      }
    } finally {
      inFlight.current = false;
      if (requestContext === context.current) setBusy(false);
    }
  }

  return <section className="settings-info-card" aria-labelledby="basic-paid-offer-title">
    <h3 id="basic-paid-offer-title">{mode === "REACTIVATION" ? "BASIC erneut bestellen" : "BASIC kostenpflichtig fortsetzen"}</h3>
    <p><strong>59 € netto pro Monat</strong>, monatlich kündbar. {mode === "REACTIVATION"
      ? "Die Reaktivierung ist ein neuer, ausdrücklich angenommener Vertrag."
      : "Der kostenlose Zeitraum endet ohne automatische Belastung."}</p>
    {!hasAcceptance ? <label className="settings-location-toggle">
      <input checked={accepted} onChange={(event) => setAccepted(event.target.checked)} type="checkbox" />
      <span><strong>{mode === "REACTIVATION" ? "Neuen kostenpflichtigen BASIC-Vertrag ausdrücklich annehmen" : "Kostenpflichtiges BASIC-Angebot ausdrücklich annehmen"}</strong><small>Die Bestellung beginnt erst im sicheren Stripe-Test-Checkout. Es gibt keine automatische Umwandlung aus der Testphase.</small></span>
    </label> : <p className="status-message success" role="status">Deine ausdrückliche Entscheidung ist gespeichert. Es wurde noch keine Zahlung ausgelöst.</p>}
    <button className="button" disabled={!accepted || busy || (hasAcceptance && !checkoutAllowed)} onClick={() => void continueToCheckout()} type="button">
      {busy ? "Sicherer Checkout wird vorbereitet …" : hasAcceptance && checkoutAllowed ? "Zum sicheren Checkout" : "Zahlungspflichtig bestellen"}
    </button>
    {hasAcceptance && !checkoutAllowed ? <p className="muted">Der Checkout wird erst nach dem Ende der Testphase freigeschaltet.</p> : null}
    {error ? <p className="status-message error" role="alert">{error}</p> : null}
  </section>;
}
