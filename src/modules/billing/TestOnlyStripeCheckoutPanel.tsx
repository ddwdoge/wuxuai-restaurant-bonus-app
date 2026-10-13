import { useEffect, useRef, useState } from "react";
import { loadTestOnlyBasicRuntime } from "../offers/restaurantOfferService";
import { openIsolatedTestOnlyStripeCheckout } from "./testOnlyStripeCheckoutService";

export function TestOnlyStripeCheckoutPanel({ restaurantId }: { restaurantId: string }) {
  const [active, setActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const requestId = useRef<string | null>(null);
  const inFlight = useRef(false);
  const context = useRef(restaurantId);

  useEffect(() => {
    context.current = restaurantId;
    requestId.current = null;
    setConfirmed(false);
    setActive(false);
    setLoading(true);
    setError("");
    let current = true;
    void loadTestOnlyBasicRuntime(restaurantId).then((runtime) => {
      if (current) setActive(runtime.active && Boolean(runtime.receipt_id));
    }).catch(() => {
      if (current) setError("Der synthetische Testzugang konnte nicht sicher geprüft werden.");
    }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [restaurantId]);

  async function startCheckout() {
    if (!confirmed || !active || busy || inFlight.current) return;
    inFlight.current = true;
    const selectedRestaurant = restaurantId;
    const id = requestId.current ?? crypto.randomUUID();
    requestId.current = id;
    setBusy(true);
    setError("");
    try {
      const url = await openIsolatedTestOnlyStripeCheckout(selectedRestaurant, id);
      if (context.current === selectedRestaurant) window.location.assign(url);
    } catch {
      if (context.current === selectedRestaurant) setError("Der isolierte TEST_ONLY-Checkout wurde nicht bestätigt. Es wurde kein realer BASIC-Vertrag aktiviert.");
    } finally {
      inFlight.current = false;
      if (context.current === selectedRestaurant) setBusy(false);
    }
  }

  if (loading || !active) return null;
  return <section className="settings-info-card" aria-labelledby="test-only-checkout-title" data-testid="test-only-stripe-checkout">
    <h3 id="test-only-checkout-title">Isolierter TEST_ONLY-Stripe-Checkout</h3>
    <p>Nur für ausdrücklich freigegebene synthetische Staging-Tests. Dieser Vorgang schließt keinen realen BASIC-Vertrag und vergibt keine Entitlements.</p>
    <label className="settings-location-toggle">
      <input checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} type="checkbox" />
      <span>Ich starte bewusst genau einen isolierten Stripe-TEST-Checkout.</span>
    </label>
    <button className="button" disabled={!confirmed || busy} onClick={() => void startCheckout()} type="button">
      {busy ? "Synthetischen Checkout vorbereiten …" : "Isolierten TEST_ONLY-Checkout öffnen"}
    </button>
    {error ? <p className="status-message error" role="alert">{error}</p> : null}
  </section>;
}
