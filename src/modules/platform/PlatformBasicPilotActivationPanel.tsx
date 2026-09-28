import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";
import { AppDrawer } from "../../shared/components/AppDrawer";
import {
  activatePlatformBasicPilot,
  loadPlatformBasicPilotReadiness,
  type PlatformBasicPilotReadiness,
} from "./platformAdminService";

const blockerLabels: Record<string, string> = {
  PILOT_COUNTRY_NOT_AT: "Der Betrieb ist nicht eindeutig Österreich zugeordnet.",
  PILOT_TECHNICAL_REGISTRATION_NOT_READY: "Die technische Registrierung für Österreich ist nicht bereit.",
  PILOT_COUNTRY_STATE_BLOCKED: "Der österreichische Pilotstatus ist gesperrt.",
  PILOT_POLICY_NOT_APPROVED: "Die fachliche Pilotfreigabe ist noch nicht dokumentiert.",
  PILOT_NONPAYMENT_READINESS_INCOMPLETE: "Recht, Datenschutz, Steuerprüfung, Übersetzung, Technik oder Dokumentversionen sind noch offen.",
  PILOT_LEGAL_KYB_NOT_READY: "KYB und Betreiberangaben sind noch nicht vollständig manuell freigegeben.",
  PILOT_KASSA_NOT_READY: "Die erforderliche Kassa-Bestätigung fehlt.",
  PILOT_PENDING_BASELINE_REQUIRED: "Der Betrieb befindet sich nicht mehr im unveränderten Aktivierungs-Ausgangszustand.",
  PILOT_TENANT_NOT_FOUND: "Der serverseitige Betriebs- und Vertragsbezug ist unvollständig.",
};

type Props = {
  canWrite: boolean;
  onActivated: () => Promise<void> | void;
  restaurantId: string;
  restaurantName: string;
};

export function PlatformBasicPilotActivationPanel({ canWrite, onActivated, restaurantId, restaurantName }: Props) {
  const [readiness, setReadiness] = useState<PlatformBasicPilotReadiness | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [months, setMonths] = useState<1 | 3>(1);
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [saving, setSaving] = useState(false);
  const requestId = useRef(crypto.randomUUID());
  const correlationId = useRef(crypto.randomUUID());

  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    try { setReadiness(await loadPlatformBasicPilotReadiness(restaurantId)); }
    catch { setReadiness(null); setError("Die Pilot-Prüfung konnte nicht geladen werden."); }
    finally { setLoading(false); }
  }, [restaurantId]);

  useEffect(() => {
    requestId.current = crypto.randomUUID();
    correlationId.current = crypto.randomUUID();
    setOpen(false);
    setMonths(1);
    setReason("");
    setConfirmation("");
    void reload();
  }, [reload]);

  const expectedConfirmation = `BASIC-TRIAL ${restaurantName} ${months} MONATE AKTIVIEREN`;
  const allowed = canWrite && readiness?.ready === true;

  async function activate() {
    if (!allowed || saving || reason.trim().length < 10 || confirmation !== expectedConfirmation) return;
    setSaving(true);
    setError("");
    try {
      await activatePlatformBasicPilot({
        restaurantId,
        restaurantName,
        calendarMonths: months,
        reason: reason.trim(),
        requestId: requestId.current,
        correlationId: correlationId.current,
      });
      setOpen(false);
      await onActivated();
      await reload();
    } catch {
      setError("Die Testphase wurde nicht aktiviert. Alle Voraussetzungen werden serverseitig erneut geprüft.");
    } finally {
      setSaving(false);
    }
  }

  return <section className="platform-control-section" aria-labelledby="basic-pilot-heading">
    <div className="section-heading">
      <h3 id="basic-pilot-heading">Kostenlosen BASIC-Pilot prüfen</h3>
      <p className="muted">Ein oder drei Kalendermonate. Keine Zahlungsmethode, keine Stripe-ID und keine automatische Verlängerung.</p>
    </div>
    {loading ? <p role="status">Voraussetzungen werden serverseitig geprüft …</p> : null}
    {error ? <p className="status-message error" role="alert">{error}</p> : null}
    {!loading && readiness?.ready ? <p className="status-message success"><CheckCircle2 aria-hidden="true" size={18} />Alle nicht zahlungsbezogenen Pilotvoraussetzungen sind belegt.</p> : null}
    {!loading && readiness && !readiness.ready ? <div className="platform-contract-note" role="status">
      <strong><AlertTriangle aria-hidden="true" size={18} />Aktivierung gesperrt</strong>
      <ul>{readiness.blockers.map((blocker) => <li key={blocker}>{blockerLabels[blocker] ?? "Eine serverseitige Voraussetzung ist noch offen."}</li>)}</ul>
    </div> : null}
    <div className="platform-actions">
      <button className="button secondary" disabled={loading} onClick={() => void reload()} type="button"><RefreshCw size={18} />Neu prüfen</button>
      <button className="button" disabled={!allowed} onClick={() => setOpen(true)} type="button">BASIC-Pilot aktivieren</button>
    </div>
    <AppDrawer
      description={`${restaurantName} · kostenlose BASIC-Testphase`}
      dismissOnOverlay={false}
      footer={<><button className="button secondary" disabled={saving} onClick={() => setOpen(false)} type="button">Abbrechen</button><button className="button" disabled={!allowed || saving || reason.trim().length < 10 || confirmation !== expectedConfirmation} onClick={() => void activate()} type="button">{saving ? "Wird aktiviert …" : "Testphase verbindlich aktivieren"}</button></>}
      onClose={() => setOpen(false)}
      open={open}
      size="compact"
      title="Kostenlosen BASIC-Pilot aktivieren"
    >
      <p>Die allgemeine Länderfreigabe bleibt unverändert. Die Entscheidung wird mit aktuellem AAL2-Nachweis auditiert.</p>
      <fieldset className="settings-info-card">
        <legend>Dauer</legend>
        <label><input checked={months === 1} name="pilot-duration" onChange={() => { setMonths(1); setConfirmation(""); }} type="radio" /> Ein Kalendermonat</label>
        <label><input checked={months === 3} name="pilot-duration" onChange={() => { setMonths(3); setConfirmation(""); }} type="radio" /> Drei Kalendermonate</label>
      </fieldset>
      <label className="field"><span>Begründung *</span><textarea minLength={10} onChange={(event) => setReason(event.target.value)} required value={reason} /></label>
      <label className="field"><span>Bestätigung exakt eingeben *</span><input autoComplete="off" onChange={(event) => setConfirmation(event.target.value)} value={confirmation} /></label>
      <code>{expectedConfirmation}</code>
    </AppDrawer>
  </section>;
}
