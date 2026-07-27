import { FormEvent, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, FileCheck2, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { useTenant } from "../tenant/TenantProvider";
import { legalReadiness } from "./legalCompliance";
import {
  downloadRewardAccountingCsv,
  loadRestaurantLegalSetup,
  saveRestaurantLegalSetup,
  scheduleProgramTermination,
  type RestaurantLegalSetup,
} from "./legalService";

const profileFields = [
  ["company_name", "Unternehmensname"], ["legal_form", "Rechtsform"], ["street", "Straße und Hausnummer"],
  ["postal_code", "Postleitzahl"], ["city", "Ort"], ["country", "Land"], ["email", "E-Mail"],
  ["phone", "Telefon optional"], ["commercial_register_number", "Firmenbuchnummer"],
  ["commercial_register_court", "Firmenbuchgericht"], ["vat_id", "UID-Nummer"],
  ["chamber_membership", "Kammerzugehörigkeit optional"], ["supervisory_authority", "Aufsichtsbehörde optional"],
  ["complaint_contact", "Beschwerdekontakt"], ["accessibility_contact", "Kontakt Barrierefreiheit optional"],
] as const;

const termsFields = [
  ["program_operator_name", "Betreiber des Bonusprogramms"], ["program_operator_address", "Adresse des Betreibers"],
  ["contact_email", "Kontakt-E-Mail"], ["points_earning_rule", "Regel für Punktevergabe"],
  ["daily_booking_limit", "Tägliches Buchungslimit"], ["excluded_transactions", "Ausgeschlossene Vorgänge"],
  ["points_validity_months", "Punktegültigkeit in Monaten"], ["reward_validity_rule", "Gültigkeit von Punkteeinlösungen"],
  ["redemption_conditions", "Einlösebedingungen"], ["cash_payout_prohibited", "Barauszahlung ausgeschlossen"],
  ["transfer_prohibited", "Übertragung ausgeschlossen"], ["cancellation_rule", "Storno- und Korrekturregel"],
  ["fraud_and_blocking_rule", "Missbrauch und Sperre"], ["program_termination_rule", "Regel bei Programmende"],
  ["final_redemption_period", "Letzte Einlösefrist"], ["complaint_contact", "Beschwerdekontakt"],
  ["effective_date", "Gültig ab"], ["language", "Sprache"], ["version", "Fachliche Version"],
] as const;

const longTermsFields = new Set([
  "points_earning_rule", "excluded_transactions", "reward_validity_rule", "redemption_conditions",
  "cancellation_rule", "fraud_and_blocking_rule", "program_termination_rule", "final_redemption_period",
]);

const requestTypeLabels: Record<string, string> = {
  access: "Auskunft",
  export: "Datenexport",
  rectification: "Berichtigung",
  deletion: "Löschung",
  restriction: "Einschränkung",
  membership_termination: "Mitgliedschaft beenden",
  complaint: "Beschwerde",
};

function document(setup: RestaurantLegalSetup | null, type: string) {
  return setup?.documents.find((item) => item.document_type === type) ?? null;
}

export function OwnerLegalSettingsPage() {
  const { activeRestaurant } = useTenant();
  const [setup, setSetup] = useState<RestaurantLegalSetup | null>(null);
  const [profile, setProfile] = useState<Record<string, string | null>>({});
  const [terms, setTerms] = useState<Record<string, unknown>>({});
  const [privacyText, setPrivacyText] = useState("");
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().slice(0, 10));
  const [reacceptance, setReacceptance] = useState(false);
  const [termination, setTermination] = useState({ plannedEndAt: "", lastPointsAt: "", finalRedemptionAt: "", notice: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!activeRestaurant?.id) return;
    setLoading(true);
    loadRestaurantLegalSetup(activeRestaurant.id)
      .then((next) => {
        if (cancelled) return;
        setSetup(next);
        setProfile(next.profile);
        setTerms(document(next, "participation_terms")?.content ?? {});
        setPrivacyText(document(next, "privacy")?.rendered_text ?? "");
      })
      .catch(() => { if (!cancelled) setError("Rechtliche Einstellungen konnten nicht geladen werden."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [activeRestaurant?.id]);

  const readiness = useMemo(() => legalReadiness(profile, terms, privacyText), [privacyText, profile, terms]);
  const checklist = [
    ["Impressum vollständig", readiness.imprintComplete], ["Teilnahmebedingungen veröffentlicht", readiness.termsComplete],
    ["Datenschutzerklärung veröffentlicht", readiness.privacyComplete], ["Punktegültigkeit festgelegt", Boolean(terms.points_validity_months)],
    ["Rewardbedingungen festgelegt", Boolean(terms.reward_validity_rule && terms.redemption_conditions)],
    ["Marketing-Einstellungen geprüft", true], ["Beschwerdekontakt vorhanden", Boolean(profile.complaint_contact)],
    ["Programmende-Regel vorhanden", Boolean(terms.program_termination_rule && terms.final_redemption_period)],
  ] as const;

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    if (!activeRestaurant?.id || saving) return;
    setSaving(true); setError(null); setMessage(null);
    try {
      const next = await saveRestaurantLegalSetup({ restaurantId: activeRestaurant.id, profile, terms, privacyText, effectiveDate, reacceptanceRequired: reacceptance });
      setSetup(next);
      setMessage("Neue Versionen wurden veröffentlicht. Frühere Versionen bleiben unverändert erhalten.");
    } catch {
      setError("Rechtliche Einstellungen konnten nicht gespeichert werden. Bitte prüfe die Pflichtangaben.");
    } finally { setSaving(false); }
  }

  async function handleTermination() {
    if (!activeRestaurant?.id || saving) return;
    setSaving(true); setError(null); setMessage(null);
    try {
      await scheduleProgramTermination({
        restaurantId: activeRestaurant.id,
        plannedEndAt: new Date(termination.plannedEndAt).toISOString(),
        lastPointsEarningAt: new Date(termination.lastPointsAt).toISOString(),
        finalRedemptionAt: new Date(termination.finalRedemptionAt).toISOString(),
        customerNotice: termination.notice,
      });
      setMessage("Programmende wurde geplant. Das Restaurant wurde nicht sofort deaktiviert.");
    } catch { setError("Programmende konnte nicht geplant werden. Bitte prüfe die Fristen und den Kundenhinweis."); }
    finally { setSaving(false); }
  }

  async function handleExport() {
    if (!activeRestaurant?.id) return;
    const to = new Date(); const from = new Date(); from.setMonth(from.getMonth() - 12);
    try { await downloadRewardAccountingCsv(activeRestaurant.id, from.toISOString(), to.toISOString()); setMessage("CSV-Export wurde erstellt."); }
    catch { setError("CSV-Export konnte gerade nicht erstellt werden."); }
  }

  if (loading) return <section className="card settings-detail-card"><h1>Rechtliches & Datenschutz</h1><p className="muted">Rechtliche Bereitschaft wird geladen …</p></section>;
  if (!activeRestaurant || !setup) return <section className="card settings-detail-card"><h1>Rechtliches & Datenschutz</h1><p className="status-message error">{error ?? "Restaurantdaten fehlen."}</p></section>;

  return (
    <div className="owner-legal-page">
      <header className="page-header"><div><span className="premium-dashboard-kicker">Rechtliche Bereitschaft</span><h1>Rechtliches & Datenschutz</h1><p className="muted">Veröffentliche nachvollziehbare Teilnahmebedingungen und Pflichtangaben für dein Bonusprogramm.</p></div><Link className="button secondary" to="/admin/settings">Zurück</Link></header>

      <section className="owner-legal-readiness card">
        <div><ShieldCheck aria-hidden="true" size={26} /><div><h2>Bereitschaft für die öffentliche Suche</h2><p>Öffentliche Aktivierung erfordert Betriebs-, Rechts- und Sicherheitsbereitschaft. Bestehende Testrestaurants werden nicht automatisch deaktiviert.</p></div></div>
        <div className="owner-legal-checklist">{checklist.map(([label, complete]) => <p className={complete ? "complete" : "missing"} key={label}>{complete ? <CheckCircle2 aria-hidden="true" size={18} /> : <AlertTriangle aria-hidden="true" size={18} />} {label}</p>)}</div>
        <p className="owner-legal-status">Aktueller Status: {setup.readiness.legal_ready ? "Rechtlich bereit" : "Rechtliche Prüfung offen"}</p>
      </section>

      <form className="owner-legal-form" onSubmit={handleSave}>
        <section className="card"><h2>Impressum und Kontakt</h2><p className="muted">Angaben des Restaurants als Betreiber des Bonusprogramms.</p><div className="owner-legal-grid">{profileFields.map(([key, label]) => <label className="field" key={key}><span>{label}</span><input className="input" onChange={(event) => setProfile((current) => ({ ...current, [key]: event.target.value }))} value={profile[key] ?? ""} /></label>)}</div></section>

        <section className="card"><h2>Teilnahmebedingungen</h2><p className="owner-legal-disclaimer">Diese Vorlage ersetzt keine individuelle Rechtsberatung.</p><div className="owner-legal-grid">{termsFields.map(([key, label]) => <label className={`field${longTermsFields.has(key) ? " full" : ""}`} key={key}><span>{label}</span>{longTermsFields.has(key) ? <textarea className="input" onChange={(event) => setTerms((current) => ({ ...current, [key]: event.target.value }))} rows={4} value={String(terms[key] ?? "")} /> : <input className="input" onChange={(event) => setTerms((current) => ({ ...current, [key]: event.target.value }))} value={String(terms[key] ?? "")} />}</label>)}</div></section>

        <section className="card"><h2>Datenschutzerklärung</h2><p className="muted">Restaurant und WUXUAI als technische Plattform müssen klar getrennt beschrieben sein.</p><label className="field"><span>Veröffentlichter Text</span><textarea className="input" onChange={(event) => setPrivacyText(event.target.value)} rows={10} value={privacyText} /></label><div className="owner-legal-grid"><label className="field"><span>Gültig ab</span><input className="input" onChange={(event) => setEffectiveDate(event.target.value)} type="date" value={effectiveDate} /></label><label className="owner-legal-toggle"><input checked={reacceptance} onChange={(event) => setReacceptance(event.target.checked)} type="checkbox" /><span><strong>Erneute Annahme erforderlich</strong><small>Nur aktivieren, wenn die Änderung dies rechtlich erfordert.</small></span></label></div></section>

        <button className="button" disabled={saving || !readiness.imprintComplete || !readiness.termsComplete || !readiness.privacyComplete} type="submit"><FileCheck2 aria-hidden="true" size={19} /> {saving ? "Veröffentlichung läuft …" : "Neue Version veröffentlichen"}</button>
      </form>

      <section className="card owner-legal-termination"><h2>Programmende planen</h2><p className="muted">Kein sofortiges Abschalten: zuerst Sammelstopp, Programmende und letzte Einlösefrist festlegen.</p><div className="owner-legal-grid"><label className="field"><span>Letzte Punktevergabe</span><input className="input" onChange={(event) => setTermination((current) => ({ ...current, lastPointsAt: event.target.value }))} type="datetime-local" value={termination.lastPointsAt} /></label><label className="field"><span>Geplantes Programmende</span><input className="input" onChange={(event) => setTermination((current) => ({ ...current, plannedEndAt: event.target.value }))} type="datetime-local" value={termination.plannedEndAt} /></label><label className="field"><span>Letzte Einlösung</span><input className="input" onChange={(event) => setTermination((current) => ({ ...current, finalRedemptionAt: event.target.value }))} type="datetime-local" value={termination.finalRedemptionAt} /></label><label className="field full"><span>Hinweis an Kunden</span><textarea className="input" onChange={(event) => setTermination((current) => ({ ...current, notice: event.target.value }))} rows={4} value={termination.notice} /></label></div><button className="button secondary" disabled={saving || !termination.plannedEndAt || !termination.lastPointsAt || !termination.finalRedemptionAt || termination.notice.trim().length < 40} onClick={() => void handleTermination()} type="button">Programmende planen</button></section>

      <section className="card owner-legal-export"><h2>Aufzeichnungen für Buchhaltung</h2><p>Exportiert technische Einlösedaten der letzten zwölf Monate. Die steuerliche und kassentechnische Behandlung ist mit der Buchhaltung oder Steuerberatung abzustimmen. WUXUAI erteilt keine Steuerberatung.</p><button className="button secondary" onClick={() => void handleExport()} type="button"><Download aria-hidden="true" size={19} /> CSV herunterladen</button></section>

      <section className="card owner-legal-requests">
        <h2>Datenschutzanfragen</h2>
        <p className="muted">Offene Anfragen müssen geprüft und nachvollziehbar bearbeitet werden. Dieser Bereich führt keine automatische Löschung durch.</p>
        {setup.privacy_requests.length ? <div className="owner-legal-request-list">{setup.privacy_requests.map((request) => <article key={request.id}><div><strong>{requestTypeLabels[request.request_type] ?? "Datenschutzanfrage"}</strong><span>{request.customer_reference} · {new Intl.DateTimeFormat("de-AT", { dateStyle: "medium" }).format(new Date(request.created_at))}</span></div><span className="owner-legal-request-status">{request.status === "requested" ? "Offen" : "In Prüfung"}</span></article>)}</div> : <p className="owner-legal-empty">Keine offenen Datenschutzanfragen.</p>}
      </section>

      {message ? <p className="status-message" role="status">{message}</p> : null}{error ? <p className="status-message error" role="alert">{error}</p> : null}
    </div>
  );
}
