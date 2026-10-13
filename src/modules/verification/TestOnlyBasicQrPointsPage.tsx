import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlaskConical, KeyRound, QrCode, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import { extractCustomerPointsQrReference } from "../loyalty/customerPointsQr.mjs";
import {
  loadTestOnlyBasicRuntime,
  type TestOnlyBasicRuntime,
} from "../offers/restaurantOfferService";
import { useTenant } from "../tenant/TenantProvider";
import {
  confirmTestOnlyBasicPoints,
  previewTestOnlyBasicPoints,
  readTestOnlyBasicTodayPin,
  type TestOnlyBasicTodayPin,
} from "./testOnlyBasicFlowService";
import type { RestaurantControlledPointsPreview, RestaurantControlledPointsResult } from "../loyalty/loyaltyService";

function formatTime(value: string | null) {
  return value
    ? new Intl.DateTimeFormat("de-AT", { dateStyle: "medium", timeStyle: "medium" }).format(new Date(value))
    : "–";
}

export function TestOnlyBasicQrPointsPage() {
  const { activeRestaurant } = useTenant();
  const [runtime, setRuntime] = useState<TestOnlyBasicRuntime | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [referenceInput, setReferenceInput] = useState("");
  const [amount, setAmount] = useState("15.00");
  const [pin, setPin] = useState<TestOnlyBasicTodayPin | null>(null);
  const [preview, setPreview] = useState<RestaurantControlledPointsPreview | null>(null);
  const [result, setResult] = useState<RestaurantControlledPointsResult | null>(null);
  const idempotencyKey = useRef<string | null>(null);
  const restaurantId = activeRestaurant?.id ?? "";
  const amountCents = useMemo(() => Math.round(Number(amount.replace(",", ".")) * 100), [amount]);
  const qrReference = useMemo(() => extractCustomerPointsQrReference(referenceInput), [referenceInput]);

  const refresh = useCallback(async () => {
    if (!restaurantId) return;
    setLoading(true);
    setMessage("");
    try {
      const fresh = await loadTestOnlyBasicRuntime(restaurantId);
      setRuntime(fresh);
      if (!fresh.active) {
        setPin(null);
        setPreview(null);
        setResult(null);
        idempotencyKey.current = null;
      }
    } catch {
      setRuntime(null);
      setMessage("Der projekt- und tenantgebundene TEST_ONLY-Zustand konnte nicht sicher gelesen werden.");
    } finally {
      setLoading(false);
    }
  }, [restaurantId]);

  useEffect(() => { void refresh(); }, [refresh]);

  async function requireFreshRuntime() {
    if (!restaurantId) throw new Error("Kein Restaurant gebunden.");
    const fresh = await loadTestOnlyBasicRuntime(restaurantId);
    setRuntime(fresh);
    if (!fresh.active || !fresh.receipt_id || (runtime?.receipt_id && fresh.receipt_id !== runtime.receipt_id)) {
      setPin(null);
      setPreview(null);
      idempotencyKey.current = null;
      throw new Error("Der TEST_ONLY-BASIC-Grant ist geschlossen oder wurde ersetzt.");
    }
    return fresh;
  }

  async function loadPin() {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const fresh = await requireFreshRuntime();
      const nextPin = await readTestOnlyBasicTodayPin(restaurantId);
      if (nextPin.access_receipt_id !== fresh.receipt_id) throw new Error("Der Grant-Beleg hat sich geändert.");
      setPin(nextPin);
      setMessage("TEST_ONLY-Tages-PIN wurde frisch und ohne Realfreigabe gelesen.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Der TEST_ONLY-Tages-PIN wurde abgewiesen.");
      void refresh();
    } finally {
      setBusy(false);
    }
  }

  async function runPreview() {
    if (busy || !qrReference || !Number.isInteger(amountCents) || amountCents < 100) return;
    setBusy(true);
    setMessage("");
    setPreview(null);
    setResult(null);
    idempotencyKey.current = null;
    try {
      const fresh = await requireFreshRuntime();
      const nextPreview = await previewTestOnlyBasicPoints({ restaurantId, qrReference, amountCents });
      if (nextPreview.access_receipt_id !== fresh.receipt_id) throw new Error("Der Grant-Beleg hat sich geändert.");
      setPreview(nextPreview);
      idempotencyKey.current = crypto.randomUUID();
      setMessage("Synthetische Punktevorschau bestätigt. Noch wurden keine Punkte gebucht.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Die synthetische Punktevorschau wurde abgewiesen.");
      void refresh();
    } finally {
      setBusy(false);
    }
  }

  async function confirmOnce() {
    if (busy || !preview || !pin || !qrReference || !idempotencyKey.current || result) return;
    setBusy(true);
    setMessage("");
    try {
      const fresh = await requireFreshRuntime();
      if (pin.access_receipt_id !== fresh.receipt_id) throw new Error("Der Tages-PIN gehört nicht zum aktuellen Grant.");
      const nextResult = await confirmTestOnlyBasicPoints({
        restaurantId,
        qrReference,
        amountCents,
        dailyPin: pin.pin_code,
        idempotencyKey: idempotencyKey.current,
      });
      setResult(nextResult);
      setMessage(nextResult.already_completed
        ? "Die bereits gespeicherte idempotente Testbuchung wurde gelesen."
        : "Genau eine synthetische TEST_ONLY-Punktebuchung wurde gespeichert.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Die synthetische Punktebuchung wurde abgewiesen.");
      void refresh();
    } finally {
      setBusy(false);
    }
  }

  if (!activeRestaurant) return <section className="card"><h1>Kein Restaurant ausgewählt</h1></section>;

  return <div className="premium-owner-page" data-testid="test-only-basic-owner-flow">
    <header className="premium-owner-page-header">
      <div><span className="premium-owner-kicker">TEST_ONLY · getrennte Oberfläche</span><h1>Synthetischer QR-/PIN-/Punkte-Test</h1><p>Der reale QR-Center- und Punktepfad bleibt für PENDING_ACTIVATION geschlossen.</p></div>
      <button className="button secondary" disabled={loading || busy} onClick={() => void refresh()} type="button"><RefreshCw aria-hidden="true" size={18} />Zustand neu lesen</button>
    </header>

    {loading ? <section className="card" aria-busy="true">Projekt-, Tenant- und Grant-Bindung werden gelesen …</section> : null}
    {runtime ? <section className={`restaurant-offer-test-only-summary ${runtime.active ? "active" : "closed"}`}>
      <div><span>TEST_ONLY BASIC</span><strong>{runtime.active ? "Grant aktiv" : "GESCHLOSSEN"}</strong></div>
      <div><span>Synthetische Angebote</span><strong>{runtime.active ? `${runtime.offer_usage} / ${runtime.offer_limit}` : "0 / 0"}</strong></div>
      <p>Reale Aktivierung, Trial, Entitlements, Stripe, PRO, Mail und Katalog bleiben geschlossen.</p>
      <small>Grant-Beleg: {runtime.receipt_id ?? "–"} · gültig bis {formatTime(runtime.expires_at)}</small>
    </section> : null}

    {runtime?.active ? <>
      <section className="card">
        <div className="central-icon-heading"><QrCode aria-hidden="true" size={22} /><div><span>Gebundener synthetischer Gast</span><h2>Gast-QR übernehmen</h2></div></div>
        <p>Öffne die getrennte Gastseite in der bereits angemeldeten Gast-Sitzung und übernimm den QR-Inhalt oder den achtstelligen Ersatzcode.</p>
        <Link className="button secondary" to={`/customer/test-only-basic/${encodeURIComponent(activeRestaurant.slug)}`}>TEST_ONLY-Gastseite öffnen</Link>
        <label className="field"><span>QR-Inhalt oder Ersatzcode</span><textarea className="input" onChange={(event) => { setReferenceInput(event.target.value); setPreview(null); setResult(null); idempotencyKey.current = null; }} rows={3} value={referenceInput} /></label>
      </section>

      <section className="card">
        <div className="central-icon-heading"><KeyRound aria-hidden="true" size={22} /><div><span>Nur heutige gebundene Filiale</span><h2>TEST_ONLY-Tages-PIN</h2></div></div>
        <button className="button secondary" disabled={busy} onClick={() => void loadPin()} type="button">Tages-PIN frisch lesen</button>
        {pin ? <p className="premium-manual-code">Tages-PIN: <strong>{pin.pin_code}</strong> · gültig bis {formatTime(pin.valid_until)}</p> : null}
      </section>

      <section className="card">
        <div className="central-icon-heading"><FlaskConical aria-hidden="true" size={22} /><div><span>Vorschau vor Write</span><h2>Synthetische Punkte</h2></div></div>
        <label className="field"><span>Testbetrag in Euro</span><input className="input" inputMode="decimal" min="1" onChange={(event) => { setAmount(event.target.value); setPreview(null); setResult(null); idempotencyKey.current = null; }} step="0.01" type="number" value={amount} /></label>
        <button className="button secondary" disabled={busy || !qrReference || amountCents < 100} onClick={() => void runPreview()} type="button">Punkte-Vorschau prüfen</button>
        {preview ? <dl className="platform-detail-list"><div><dt>Gast</dt><dd>{preview.customer_label}</dd></div><div><dt>Aktueller Stand</dt><dd>{preview.points_balance}</dd></div><div><dt>Vorschau</dt><dd>{preview.final_points ?? preview.expected_points} Punkte</dd></div></dl> : null}
        {preview ? <button className="button" disabled={busy || !pin || Boolean(result)} onClick={() => void confirmOnce()} type="button">Genau eine TEST_ONLY-Buchung speichern</button> : null}
        {result ? <p className="platform-test-only-complete" role="status">{result.points_added} Punkte gespeichert · neuer Stand {result.points_balance} · Transaktion {result.transaction_id}</p> : null}
      </section>
    </> : <section className="card"><h2>TEST_ONLY-BASIC ist geschlossen</h2><p>Angebotsanzeige, Gast-QR, Tages-PIN, Vorschau und Punktebuchung sind serverseitig gesperrt. Historische Belege bleiben erhalten.</p></section>}
    {message ? <p className="restaurant-offers-message" role="status">{message}</p> : null}
  </div>;
}
