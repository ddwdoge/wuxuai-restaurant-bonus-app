import { useState } from "react";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { useTenant } from "../tenant/TenantProvider";
import { scheduleProgramTermination } from "./legalService";
import { FormLabel, RequiredFieldsNote } from "../../shared/components/FormLabel";

export function ProgramTerminationPage() {
  const { activeRestaurant } = useTenant();
  const [values, setValues] = useState({
    lastPointsAt: "",
    plannedEndAt: "",
    finalRedemptionAt: "",
    notice: "",
    confirmed: false,
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const complete = Boolean(
    values.lastPointsAt
    && values.plannedEndAt
    && values.finalRedemptionAt
    && values.notice.trim().length >= 40
    && values.confirmed,
  );

  async function handleSubmit() {
    if (!activeRestaurant?.id || !complete || saving) return;
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      await scheduleProgramTermination({
        restaurantId: activeRestaurant.id,
        lastPointsEarningAt: new Date(values.lastPointsAt).toISOString(),
        plannedEndAt: new Date(values.plannedEndAt).toISOString(),
        finalRedemptionAt: new Date(values.finalRedemptionAt).toISOString(),
        customerNotice: values.notice,
      });
      setMessage("Das Programmende wurde geplant. Dein Bonusprogramm wurde nicht sofort abgeschaltet.");
    } catch {
      setError("Das Programmende konnte nicht geplant werden. Bitte prüfe die Reihenfolge der Fristen.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="owner-legal-page">
      <header className="page-header">
        <div><span className="premium-dashboard-kicker">Nur für Owner</span><h1>Bonusprogramm beenden</h1><p className="muted">Plane das Ende mit klaren Fristen. Es erfolgt keine sofortige Abschaltung.</p></div>
        <Link className="button secondary" to="/admin/legal"><ArrowLeft aria-hidden="true" size={18} /> Zurück</Link>
      </header>
      <section className="card owner-legal-termination">
        <RequiredFieldsNote />
        <div className="owner-legal-warning"><AlertTriangle aria-hidden="true" size={22} /><p>Gäste müssen rechtzeitig über das Ende und ihre letzte Einlösemöglichkeit informiert werden.</p></div>
        <div className="owner-legal-termination-steps" aria-label="Ablauf der Programmbeendigung">
          <p><strong>1. Start der Beendigung</strong><span>Beginnt mit der verbindlichen Planung und wird protokolliert.</span></p>
          <p><strong>2. Letzter Sammeltag</strong><span>Bis dahin können Gäste regulär Punkte sammeln.</span></p>
          <p><strong>3. Letzter Einlösetag</strong><span>Danach beginnt die schreibgeschützte Abschlussphase.</span></p>
          <p><strong>4. Abschluss und Archivierung</strong><span>Aktivitäten werden berichtet; Legal-Versionen und historische Bestätigungen bleiben erhalten.</span></p>
        </div>
        <div className="owner-legal-grid">
          <div className="field"><FormLabel htmlFor="termination-last-points" required>Letzte Punktevergabe</FormLabel><input aria-required="true" className="input" id="termination-last-points" onChange={(event) => setValues((current) => ({ ...current, lastPointsAt: event.target.value }))} required type="datetime-local" value={values.lastPointsAt} /></div>
          <div className="field"><FormLabel htmlFor="termination-planned-end" required>Geplantes Programmende</FormLabel><input aria-required="true" className="input" id="termination-planned-end" onChange={(event) => setValues((current) => ({ ...current, plannedEndAt: event.target.value }))} required type="datetime-local" value={values.plannedEndAt} /></div>
          <div className="field"><FormLabel htmlFor="termination-final-redemption" required>Letzte Einlösung</FormLabel><input aria-required="true" className="input" id="termination-final-redemption" onChange={(event) => setValues((current) => ({ ...current, finalRedemptionAt: event.target.value }))} required type="datetime-local" value={values.finalRedemptionAt} /></div>
          <div className="field full"><FormLabel htmlFor="termination-notice" required>Hinweis an Kunden</FormLabel><textarea aria-required="true" className="input" id="termination-notice" minLength={40} onChange={(event) => setValues((current) => ({ ...current, notice: event.target.value }))} required rows={5} value={values.notice} /></div>
        </div>
        <label className="owner-legal-toggle"><input aria-required="true" checked={values.confirmed} onChange={(event) => setValues((current) => ({ ...current, confirmed: event.target.checked }))} required type="checkbox" /><span><strong>Fristen und Kundenhinweis geprüft<span aria-hidden="true" className="required-field-marker"> *</span><span className="sr-only"> Pflichtfeld</span></strong><small>Die Planung wird protokolliert und kann nicht als sofortige Deaktivierung verwendet werden.</small></span></label>
        <button className="button" disabled={!complete || saving} onClick={() => void handleSubmit()} type="button">{saving ? "Planung wird gespeichert …" : "Programmende verbindlich planen"}</button>
      </section>
      <section className="card owner-legal-export"><h2>Abschlussbericht</h2><p className="muted">Der Bonus-Aktivitätsbericht unterstützt den nachvollziehbaren Abschluss. Es werden weder Punkte still gelöscht noch historische Kundenbestätigungen verändert.</p><Link className="button secondary" to="/admin/reports">Bonus-Aktivitätsbericht öffnen</Link></section>
      {message ? <p className="status-message" role="status">{message}</p> : null}
      {error ? <p className="status-message error" role="alert">{error}</p> : null}
    </div>
  );
}
