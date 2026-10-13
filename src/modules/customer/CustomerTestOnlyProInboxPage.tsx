import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Bell, CheckCircle2, Clock3, FlaskConical } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { AppShell, ErrorState, LoadingState, PremiumCard, PrimaryButton, SecondaryButton, StatusBadge } from "./components/PremiumCustomerUi";
import { openTestOnlyProInboxNotification, readTestOnlyProInbox, setTestOnlyProInboxConsent, type TestOnlyProInbox } from "./testOnlyProInboxService";
import "./central-customer.css";

const time = (value: string) => new Intl.DateTimeFormat("de-AT", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

export function CustomerTestOnlyProInboxPage() {
  const { restaurantId = "" } = useParams();
  const [inbox, setInbox] = useState<TestOnlyProInbox | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<Record<string, string>>({});

  const refresh = useCallback(async () => {
    setLoading(true); setError("");
    try { setInbox(await readTestOnlyProInbox(restaurantId)); }
    catch { setInbox(null); setError("Der gebundene TEST_ONLY-PRO-In-App-Zugang ist geschlossen oder abgelaufen."); }
    finally { setLoading(false); }
  }, [restaurantId]);
  useEffect(() => { void refresh(); }, [refresh]);

  async function changeConsent(action: "ACCEPT" | "WITHDRAW") {
    if (busy) return;
    setBusy(true); setError("");
    try {
      request.current[action] ??= crypto.randomUUID();
      await setTestOnlyProInboxConsent(restaurantId, action, request.current[action]);
      request.current = {};
      setAccepted(false);
      await refresh();
    } catch { setError("Die synthetische Einwilligung wurde serverseitig abgewiesen."); }
    finally { setBusy(false); }
  }

  async function openNotification(id: string) {
    if (busy) return;
    setBusy(true); setError("");
    try {
      request.current[id] ??= crypto.randomUUID();
      await openTestOnlyProInboxNotification(restaurantId, id, request.current[id]);
      await refresh();
    } catch { setError("Die synthetische Angebotsnachricht konnte nicht sicher geöffnet werden."); }
    finally { setBusy(false); }
  }

  return <AppShell className="central-auth-shell"><main className="central-auth-page test-only-pro-inbox" data-testid="test-only-pro-inbox-page">
    <header className="customer-offers-header"><Link aria-label="Zurück" to="/customer"><ArrowLeft aria-hidden="true" size={20} /></Link><div><span>TEST_ONLY · kein echtes PRO</span><h1>Synthetische Angebotsnachrichten</h1><p>Nur In-App. Kein E-Mail- oder Push-Versand.</p></div></header>
    {loading ? <LoadingState description="Projekt-, Gast-, Grant- und Einwilligungsbindung werden frisch geprüft." /> : null}
    {error && !inbox ? <ErrorState action={<SecondaryButton onClick={() => void refresh()}>Erneut prüfen</SecondaryButton>} description={error} title="TEST_ONLY-Inbox geschlossen" /> : null}
    {inbox ? <>
      <PremiumCard className="central-auth-card"><div className="central-icon-heading"><FlaskConical aria-hidden="true" size={24} /><div><span>Isolierter Testvertrag</span><h2>TEST_ONLY PRO · In-App</h2></div></div><StatusBadge tone="success">Grant aktiv bis {time(inbox.expires_at)}</StatusBadge><p>Reales PRO, Checkout, Stripe, E-Mail und Push bleiben geschlossen.</p></PremiumCard>
      {!inbox.consent_active ? <PremiumCard className="central-auth-card" data-testid="test-only-pro-consent"><h2>Synthetische In-App-Einwilligung</h2><p>Ich stimme ausschließlich synthetischen In-App-Angebotsbenachrichtigungen für diesen gebundenen Staging-Testbetrieb zu. Kein E-Mail- oder Push-Versand.</p><label className="platform-test-only-check"><input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} /><span>TEST_ONLY-Einwilligung ausdrücklich bestätigen</span></label><PrimaryButton disabled={!accepted || busy} onClick={() => void changeConsent("ACCEPT")}>Synthetische Einwilligung speichern</PrimaryButton></PremiumCard>
        : <PremiumCard className="central-auth-card"><div className="central-icon-heading"><CheckCircle2 aria-hidden="true" size={22} /><h2>Einwilligung aktiv</h2></div><p>Fassung {inbox.consent_version}<br /><code>{inbox.consent_content_sha256}</code></p><SecondaryButton disabled={busy} onClick={() => void changeConsent("WITHDRAW")}>Einwilligung widerrufen</SecondaryButton></PremiumCard>}
      {inbox.consent_active ? <section aria-labelledby="test-only-pro-items" className="premium-content-section"><div className="premium-page-heading"><Bell aria-hidden="true" size={20} /><div><h2 id="test-only-pro-items">Angebotsnachrichten</h2><p>{inbox.unread_count} ungelesen</p></div></div>
        {inbox.items.map((item) => <PremiumCard className={item.read_at ? "" : "is-unread"} key={item.id}><StatusBadge>{item.read_at ? "Gelesen" : "Neu · TEST_ONLY"}</StatusBadge><h3>{item.offer.title}</h3><p>{item.offer.short_description}</p><p><Clock3 aria-hidden="true" size={15} /> {time(item.created_at)}</p><code>{item.payload_sha256}</code>{!item.read_at ? <PrimaryButton disabled={busy} onClick={() => void openNotification(item.id)}>Öffnen und als gelesen markieren</PrimaryButton> : null}</PremiumCard>)}
        {!inbox.items.length ? <p>Keine synthetischen Angebotsnachrichten vorhanden.</p> : null}
      </section> : null}
      {error ? <p className="central-status-message" role="alert">{error}</p> : null}
      <SecondaryButton disabled={busy} onClick={() => void refresh()}>Neu laden</SecondaryButton>
    </> : null}
  </main></AppShell>;
}
