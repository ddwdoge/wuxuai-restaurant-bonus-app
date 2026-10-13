import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Clock3, FlaskConical, Newspaper, QrCode } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { OperationalQrCode } from "../../shared/components/OperationalQrCode";
import { buildCustomerPointsQrPayload } from "../loyalty/customerPointsQr.mjs";
import {
  createTestOnlyBasicCustomerQr,
  readTestOnlyBasicCustomerFlow,
  type TestOnlyBasicCustomerFlow,
  type TestOnlyBasicCustomerQr,
} from "../verification/testOnlyBasicFlowService";
import {
  AppShell,
  CustomerLanguageAction,
  ErrorState,
  LoadingState,
  PremiumCard,
  PrimaryButton,
  SecondaryButton,
  StatusBadge,
} from "./components/PremiumCustomerUi";
import "./central-customer.css";

function formatTime(value: string | null) {
  return value
    ? new Intl.DateTimeFormat("de-AT", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
    : "–";
}

export function CustomerTestOnlyBasicPage() {
  const { slug = "" } = useParams();
  const [flow, setFlow] = useState<TestOnlyBasicCustomerFlow | null>(null);
  const [qr, setQr] = useState<TestOnlyBasicCustomerQr | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    setQr(null);
    try {
      setFlow(await readTestOnlyBasicCustomerFlow(slug));
    } catch {
      setFlow(null);
      setError("Der gebundene synthetische Gastzugang konnte nicht sicher geöffnet werden.");
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => { void refresh(); }, [refresh]);

  async function createQr() {
    if (!flow?.active || creating) return;
    setCreating(true);
    setError("");
    try {
      const fresh = await readTestOnlyBasicCustomerFlow(slug);
      if (!fresh.active || fresh.access_receipt_id !== flow.access_receipt_id) {
        setFlow(fresh);
        setQr(null);
        setError("Der TEST_ONLY-BASIC-Grant ist nicht mehr aktuell. Es wurde kein QR erstellt.");
        return;
      }
      setFlow(fresh);
      setQr(await createTestOnlyBasicCustomerQr(fresh.restaurant_id));
    } catch {
      setQr(null);
      setError("Der synthetische Punkte-QR wurde serverseitig abgewiesen.");
      void refresh();
    } finally {
      setCreating(false);
    }
  }

  return <AppShell className="central-auth-shell">
    <main className="central-auth-page test-only-basic-customer" data-testid="test-only-basic-customer-page">
      <header className="customer-offers-header">
        <Link aria-label="Zurück" to="/customer"><ArrowLeft aria-hidden="true" size={20} /></Link>
        <div><span>TEST_ONLY · synthetischer Gast</span><h1>BASIC-Testablauf</h1><p>Getrennt vom realen Bonusprogramm.</p></div>
        <CustomerLanguageAction />
      </header>

      {loading ? <LoadingState description="Projekt-, Gast- und Grant-Bindung werden frisch geprüft." /> : null}
      {error && !flow ? <ErrorState action={<SecondaryButton onClick={() => void refresh()}>Erneut prüfen</SecondaryButton>} description={error} title="TEST_ONLY-Zugang geschlossen" /> : null}
      {flow ? <>
        <PremiumCard className="central-auth-card">
          <div className="central-icon-heading"><FlaskConical aria-hidden="true" size={24} /><div><span>Nur synthetische Daten</span><h2>{flow.restaurant_name}</h2></div></div>
          <StatusBadge tone={flow.active ? "success" : "neutral"}>{flow.active ? "Grant aktiv" : "Grant geschlossen"}</StatusBadge>
          <p>Filiale: {flow.branch_name}. Reale Aktivierung, Trial, Entitlements, Mail und Katalog bleiben geschlossen.</p>
          <p><Clock3 aria-hidden="true" size={16} /> Gültig bis {formatTime(flow.expires_at)}</p>
          <SecondaryButton onClick={() => void refresh()}>Zustand neu lesen</SecondaryButton>
        </PremiumCard>

        {flow.active ? <>
          <section aria-labelledby="test-only-basic-offers-title" className="premium-content-section">
            <div className="premium-page-heading"><Newspaper aria-hidden="true" size={20} /><div><h2 id="test-only-basic-offers-title">Synthetisches Angebot</h2><p>{flow.offers.length} / {flow.offer_limit} ausschließlich TEST_ONLY</p></div></div>
            {flow.offers.map((offer) => <PremiumCard key={offer.id}>
              <StatusBadge>TEST_ONLY · Fassung {offer.publication_version}</StatusBadge>
              <h3>{offer.title}</h3><p>{offer.short_description}</p>
            </PremiumCard>)}
            {!flow.offers.length ? <p>Für diesen Gast ist kein synthetisch veröffentlichtes Angebot sichtbar.</p> : null}
          </section>

          <PremiumCard className="central-auth-card">
            <div className="central-icon-heading"><QrCode aria-hidden="true" size={24} /><div><span>5 Minuten · einmalig</span><h2>Synthetischer Punkte-QR</h2></div></div>
            <p>Nur der gebundene Test-Gast kann hier einen QR erzeugen. Nach Ablauf oder Widerruf weist der Server die Aktion ab.</p>
            {qr ? <>
              <div className="premium-qr-frame"><OperationalQrCode id="test-only-basic-customer-qr" title="TEST_ONLY Punkte-QR" value={buildCustomerPointsQrPayload(qr.qr_token)} /></div>
              <p className="premium-manual-code">Ersatzcode: <strong>{qr.manual_code.replace(/(\d{4})(\d{4})/, "$1 $2")}</strong></p>
              <StatusBadge><Clock3 aria-hidden="true" size={15} /> Gültig bis {formatTime(qr.expires_at)}</StatusBadge>
            </> : null}
            {error ? <p className="central-status-message" role="alert">{error}</p> : null}
            <PrimaryButton disabled={creating || !flow.active} onClick={() => void createQr()}>{creating ? "QR wird erstellt …" : qr ? "Neuen Test-QR erstellen" : "Test-QR erstellen"}</PrimaryButton>
          </PremiumCard>
        </> : <ErrorState action={<SecondaryButton onClick={() => void refresh()}>Erneut prüfen</SecondaryButton>} description="Angebote, QR, PIN und Punkte sind serverseitig gesperrt. Historische Testbelege bleiben erhalten." title="TEST_ONLY-BASIC ist geschlossen" />}
      </> : null}
    </main>
  </AppShell>;
}
