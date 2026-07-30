import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Filter, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { AppDrawer } from "../../shared/components/AppDrawer";
import { loadPlatformAuditEvents, loadPlatformRestaurants, type PlatformAuditEvent, type PlatformRestaurant } from "./platformAdminService";

const eventLabels: Record<string, string> = {
  CUSTOMER_REGISTERED: "Gast registriert",
  CUSTOMER_JOINED_RESTAURANT: "Unternehmen beigetreten",
  WELCOME_REWARD_CREATED: "Willkommensgeschenk erstellt",
  POINTS_COLLECTION_STARTED: "Punktebuchung gestartet",
  DAILY_PIN_ACCEPTED: "Tages-PIN akzeptiert",
  DAILY_PIN_REJECTED: "Tages-PIN abgelehnt",
  POINTS_ADDED: "Punkte hinzugefügt",
  POINTS_ADD_FAILED: "Punktebuchung fehlgeschlagen",
  REWARD_UNLOCKED: "Punkteeinlösung freigeschaltet",
  REDEMPTION_CODE_CREATED: "Einlösecode erstellt",
  REWARD_REDEEMED: "Punkteeinlösung eingelöst",
  REWARD_REDEMPTION_FAILED: "Einlösung fehlgeschlagen",
  REWARD_REDEMPTION_BLOCKED: "Einlösung blockiert",
  COUPON_REDEEMED: "Gutschein eingelöst",
  REFERRAL_CREATED: "Freunde-Einladung erstellt",
  REFERRAL_ACTIVATED: "Freunde-Einladung aktiviert",
  POINTS_EXPIRED: "Punkte abgelaufen",
  REWARD_EXPIRED: "Punkteeinlösung abgelaufen",
  AUTHORIZATION_DENIED: "Zugriff abgelehnt",
  RLS_DENIED: "Datenzugriff abgelehnt",
  API_ERROR: "Schnittstellenfehler",
};

const statusLabels = { success: "Erfolgreich", failed: "Fehlgeschlagen", blocked: "Blockiert" } as const;
const actorLabels: Record<string, string> = { admin: "Administration", staff: "Mitarbeiter", customer: "Gast", system: "System" };

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("de-AT", { dateStyle: "short", timeStyle: "medium" }).format(new Date(value));
}

function toStartIso(value: string) {
  return value ? new Date(`${value}T00:00:00`).toISOString() : null;
}

function toEndIso(value: string) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  date.setDate(date.getDate() + 1);
  return date.toISOString();
}

function safeMetadataRows(metadata: Record<string, unknown>) {
  return Object.entries(metadata).filter(([, value]) => value !== null && value !== undefined);
}

export function PlatformAuditPage() {
  const [events, setEvents] = useState<PlatformAuditEvent[]>([]);
  const [restaurants, setRestaurants] = useState<PlatformRestaurant[]>([]);
  const [selected, setSelected] = useState<PlatformAuditEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [restaurantId, setRestaurantId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [eventType, setEventType] = useState("");
  const [status, setStatus] = useState("");
  const [source, setSource] = useState("");
  const [actorType, setActorType] = useState("");
  const [testOnly, setTestOnly] = useState(false);
  const [failedOnly, setFailedOnly] = useState(false);

  async function loadAudit() {
    setLoading(true);
    setError("");
    try {
      const nextEvents = await loadPlatformAuditEvents({
        from: toStartIso(fromDate), to: toEndIso(toDate), restaurantId: restaurantId || null,
        customerId: customerId.trim() || null, eventType: eventType || null,
        status: (status || null) as PlatformAuditEvent["status"] | null,
        source: source || null, actorType: actorType || null, testOnly, failedOnly, limit: 200,
      });
      setEvents(nextEvents);
    } catch (loadError) {
      console.error("Audit-Protokoll konnte nicht geladen werden.", loadError);
      setError("Audit-Protokoll konnte gerade nicht geladen werden.");
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPlatformRestaurants().then((result) => setRestaurants(result.restaurants)).catch(() => setRestaurants([]));
    loadPlatformAuditEvents({ limit: 200 })
      .then(setEvents)
      .catch((loadError) => {
        console.error("Audit-Protokoll konnte nicht geladen werden.", loadError);
        setError("Audit-Protokoll konnte gerade nicht geladen werden.");
        setEvents([]);
      })
      .finally(() => setLoading(false));
  }, []);

  const eventOptions = useMemo(() => Array.from(new Set([...Object.keys(eventLabels), ...events.map((event) => event.event_type)])).sort(), [events]);
  const sourceOptions = useMemo(() => Array.from(new Set(events.map((event) => event.source).filter(Boolean) as string[])).sort(), [events]);

  return (
    <main className="platform-admin-shell platform-audit-shell">
      <header className="platform-admin-header">
        <div>
          <span className="admin-brand-kicker">WUXUAI Admin</span>
          <h1>Audit-Protokoll</h1>
          <p>Kritische Abläufe sicher prüfen, ohne sensible Zugangsdaten anzuzeigen.</p>
        </div>
        <div className="platform-admin-header-actions">
          <Link className="button secondary" to="/admin/platform"><ArrowLeft size={18} />Unternehmen</Link>
          <button className="button secondary" onClick={loadAudit} type="button"><RefreshCw size={18} />Aktualisieren</button>
        </div>
      </header>

      <section className="card platform-audit-filters" aria-label="Audit filtern">
        <div className="section-heading"><h2><Filter size={20} /> Filter</h2><p className="muted">Bis zu 200 aktuelle Einträge.</p></div>
        <div className="platform-audit-filter-grid">
          <label className="field"><span>Von</span><input className="input" onChange={(event) => setFromDate(event.target.value)} type="date" value={fromDate} /></label>
          <label className="field"><span>Bis</span><input className="input" onChange={(event) => setToDate(event.target.value)} type="date" value={toDate} /></label>
          <label className="field"><span>Unternehmen</span><select className="input" onChange={(event) => setRestaurantId(event.target.value)} value={restaurantId}><option value="">Alle Unternehmen</option>{restaurants.map((restaurant) => <option key={restaurant.id} value={restaurant.id}>{restaurant.name}</option>)}</select></label>
          <label className="field"><span>Gast-ID</span><div className="platform-audit-search"><Search size={17} /><input onChange={(event) => setCustomerId(event.target.value)} placeholder="UUID" value={customerId} /></div></label>
          <label className="field"><span>Ereignis</span><select className="input" onChange={(event) => setEventType(event.target.value)} value={eventType}><option value="">Alle Ereignisse</option>{eventOptions.map((value) => <option key={value} value={value}>{eventLabels[value] ?? value}</option>)}</select></label>
          <label className="field"><span>Status</span><select className="input" onChange={(event) => setStatus(event.target.value)} value={status}><option value="">Alle Status</option><option value="success">Erfolgreich</option><option value="failed">Fehlgeschlagen</option><option value="blocked">Blockiert</option></select></label>
          <label className="field"><span>Quelle</span><select className="input" onChange={(event) => setSource(event.target.value)} value={source}><option value="">Alle Quellen</option>{sourceOptions.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          <label className="field"><span>Akteur</span><select className="input" onChange={(event) => setActorType(event.target.value)} value={actorType}><option value="">Alle Akteure</option>{Object.entries(actorLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        </div>
        <div className="platform-audit-toggle-row">
          <label><input checked={testOnly} onChange={(event) => setTestOnly(event.target.checked)} type="checkbox" />Nur Testereignisse</label>
          <label><input checked={failedOnly} onChange={(event) => setFailedOnly(event.target.checked)} type="checkbox" />Nur fehlgeschlagen oder blockiert</label>
          <button className="button primary" onClick={loadAudit} type="button">Filter anwenden</button>
        </div>
      </section>

      {error ? <p className="status-message error" role="alert">{error}</p> : null}
      <section className="card platform-audit-table-card">
        {loading ? <p className="muted">Audit-Protokoll wird geladen...</p> : null}
        {!loading && events.length === 0 ? <div className="empty-state-card"><ShieldCheck size={32} /><h2>Keine Einträge gefunden</h2><p>Für die gewählten Filter liegen keine Audit-Ereignisse vor.</p></div> : null}
        {events.length ? <div className="platform-audit-table-wrap"><table className="platform-audit-table"><thead><tr><th>Zeit</th><th>Unternehmen</th><th>Akteur</th><th>Ereignis</th><th>Status</th><th>Quelle</th><th>Entität</th><th>Test</th></tr></thead><tbody>{events.map((event) => <tr key={event.id} onClick={() => setSelected(event)} tabIndex={0} onKeyDown={(keyEvent) => { if (keyEvent.key === "Enter" || keyEvent.key === " ") { keyEvent.preventDefault(); setSelected(event); } }}><td>{formatDateTime(event.created_at)}</td><td>{event.restaurant_name}</td><td>{actorLabels[event.actor_type] ?? event.actor_type}</td><td>{eventLabels[event.event_type] ?? event.event_type}</td><td><span className={`audit-status ${event.status}`}>{statusLabels[event.status]}</span></td><td>{event.source ?? "System"}</td><td>{event.entity_type ?? "-"}</td><td>{event.is_test_event ? "Ja" : "Nein"}</td></tr>)}</tbody></table></div> : null}
      </section>

      <AppDrawer description="Technische Kennungen und bereinigte Metadaten dieses Ereignisses." onClose={() => setSelected(null)} open={Boolean(selected)} title={selected ? eventLabels[selected.event_type] ?? selected.event_type : "Audit-Details"}>
        {selected ? <div className="platform-audit-detail"><dl><div><dt>Zeit</dt><dd>{formatDateTime(selected.created_at)}</dd></div><div><dt>Unternehmen</dt><dd>{selected.restaurant_name}</dd></div><div><dt>Status</dt><dd>{statusLabels[selected.status]}</dd></div><div><dt>Quelle</dt><dd>{selected.source ?? "System"}</dd></div><div><dt>Akteur</dt><dd>{actorLabels[selected.actor_type] ?? selected.actor_type}</dd></div><div><dt>Entität</dt><dd>{selected.entity_type ?? "Nicht gesetzt"}</dd></div><div><dt>Testereignis</dt><dd>{selected.is_test_event ? "Ja" : "Nein"}</dd></div>{selected.test_session_id ? <div><dt>Test-Sitzung</dt><dd>{selected.test_session_id}</dd></div> : null}{selected.request_id ? <div><dt>Anfrage-ID</dt><dd>{selected.request_id}</dd></div> : null}{selected.error_code ? <div><dt>Fehlercode</dt><dd>{selected.error_code}</dd></div> : null}{selected.error_message ? <div><dt>Fehler</dt><dd>{selected.error_message}</dd></div> : null}</dl><section><h3>Sichere Details</h3>{safeMetadataRows(selected.metadata).length ? <dl>{safeMetadataRows(selected.metadata).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{typeof value === "object" ? JSON.stringify(value) : String(value)}</dd></div>)}</dl> : <p className="muted">Keine zusätzlichen Details.</p>}</section></div> : null}
      </AppDrawer>
    </main>
  );
}
