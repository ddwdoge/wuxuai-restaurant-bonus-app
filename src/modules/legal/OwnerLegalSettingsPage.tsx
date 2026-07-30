import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileCheck2,
  Info,
  Landmark,
  ReceiptText,
  ScrollText,
  ShieldCheck,
} from "lucide-react";
import { Link } from "react-router-dom";
import { FormLabel, RequiredFieldsNote } from "../../shared/components/FormLabel";
import { useTenant } from "../tenant/TenantProvider";
import { requiredLegalDocumentStatus } from "./legalReadiness.mjs";
import {
  generateRestaurantLegalPackage,
  loadRestaurantLegalSetup,
  publishRestaurantLegalDrafts,
  type LegalDocumentView,
  type RestaurantLegalSetup,
} from "./legalService";

const requiredProfileFields = [
  ["company_name", "Unternehmensname"],
  ["legal_form", "Rechtsform"],
  ["street", "Straße und Hausnummer"],
  ["postal_code", "Postleitzahl"],
  ["city", "Ort"],
  ["country", "Land"],
  ["email", "Kontakt-E-Mail"],
] as const;

const optionalProfileFields = [
  ["phone", "Telefonnummer"],
  ["commercial_register_number", "Firmenbuchnummer"],
  ["commercial_register_court", "Firmenbuchgericht"],
  ["vat_id", "UID-Nummer"],
  ["chamber_membership", "Kammerzugehörigkeit"],
  ["supervisory_authority", "Aufsichtsbehörde"],
  ["accessibility_contact", "Barrierefreiheitskontakt"],
  ["complaint_contact", "Beschwerdekontakt"],
  ["responsible_person", "Verantwortliche Person"],
  ["restaurant_operator", "Restaurantbetreiber"],
] as const;

const allProfileFields = [...requiredProfileFields, ...optionalProfileFields] as const;

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

function displayStatus(item: LegalDocumentView | null) {
  if (!item) return "Noch nicht vorbereitet";
  if (item.draft_version_id) return "Rechtliche Prüfung empfohlen";
  if (item.status === "published") return "Veröffentlicht";
  if (item.status === "draft") return "Vorlage – rechtliche Prüfung empfohlen";
  return "Neue Version verfügbar";
}

function formatDateTime(value?: string | null) {
  if (!value) return "–";
  return new Intl.DateTimeFormat("de-AT", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function formatDate(value?: string | null) {
  if (!value) return "–";
  return new Intl.DateTimeFormat("de-AT", { dateStyle: "medium" }).format(new Date(`${value}T12:00:00`));
}

export function OwnerLegalSettingsPage() {
  const { activeRestaurant } = useTenant();
  const [setup, setSetup] = useState<RestaurantLegalSetup | null>(null);
  const [profile, setProfile] = useState<Record<string, string | null>>({});
  const [originalProfile, setOriginalProfile] = useState<Record<string, string | null>>({});
  const [preparedChanges, setPreparedChanges] = useState<string[]>([]);
  const [editing, setEditing] = useState(false);
  const [effectiveDate, setEffectiveDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [reacceptanceRequired, setReacceptanceRequired] = useState(false);
  const [publicationConfirmed, setPublicationConfirmed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!activeRestaurant?.id) return;
    setLoading(true);
    setError(null);
    loadRestaurantLegalSetup(activeRestaurant.id)
      .then((next) => {
        if (cancelled) return;
        setSetup(next);
        setProfile(next.profile);
        setOriginalProfile(next.profile);
      })
      .catch(() => {
        if (!cancelled) setError("Rechtliche Angaben konnten nicht geladen werden.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeRestaurant?.id]);

  const terms = document(setup, "participation_terms");
  const privacy = document(setup, "privacy");
  const imprint = document(setup, "imprint");
  const documentReadiness = useMemo(
    () => requiredLegalDocumentStatus(setup?.documents ?? [], new Date().toISOString().slice(0, 10)),
    [setup?.documents],
  );
  const missingProfileFields = requiredProfileFields.filter(([key]) => !profile[key]?.trim());
  const registration = setup?.readiness.registration;
  const registrationReady = registration?.registration_allowed ?? false;
  const complaintUsesFallback = !profile.complaint_contact?.trim() && Boolean(profile.email?.trim());
  const publicLegalPath = activeRestaurant?.slug ? `/legal/${activeRestaurant.slug}` : "/admin/legal";

  const changedFields = allProfileFields
    .filter(([key]) => (profile[key] ?? "").trim() !== (originalProfile[key] ?? "").trim())
    .map(([, label]) => label);
  const hasDrafts = setup?.documents.some((item) => Boolean(item.draft_version_id)) ?? false;

  async function handlePrepare(event: FormEvent) {
    event.preventDefault();
    if (!activeRestaurant?.id || saving) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const nextProfile = {
        ...profile,
        complaint_contact: profile.complaint_contact?.trim() || profile.email?.trim() || "",
      };
      const next = await generateRestaurantLegalPackage({
        restaurantId: activeRestaurant.id,
        profile: nextProfile,
      });
      setProfile(next.profile);
      setSetup(next);
      setPreparedChanges(changedFields);
      setOriginalProfile(next.profile);
      setEditing(false);
      setPublicationConfirmed(false);
      setMessage("Die neuen Dokumentversionen wurden als Entwurf vorbereitet. Frühere veröffentlichte Versionen bleiben unverändert.");
    } catch {
      setError("Die Dokumente konnten nicht vorbereitet werden. Bitte prüfe die markierten Pflichtfelder.");
    } finally {
      setSaving(false);
    }
  }

  async function handleConfirmedPublication() {
    if (!activeRestaurant?.id || !publicationConfirmed || saving) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const next = await publishRestaurantLegalDrafts({
        restaurantId: activeRestaurant.id,
        effectiveDate,
        reacceptanceRequired,
        confirmed: publicationConfirmed,
      });
      setSetup(next);
      setProfile(next.profile);
      setOriginalProfile(next.profile);
      setPreparedChanges([]);
      setPublicationConfirmed(false);
      setReacceptanceRequired(false);
      setMessage("Die geprüften Dokumentversionen wurden veröffentlicht.");
    } catch {
      setError("Die Dokumentversionen konnten nicht veröffentlicht werden. Bitte prüfe Vorschau und Gültigkeitsdatum.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <section className="card settings-detail-card"><h1>Rechtliches & Datenschutz</h1><p className="muted">Dokumente werden geladen …</p></section>;
  }

  if (!activeRestaurant || !setup) {
    return <section className="card settings-detail-card"><h1>Rechtliches & Datenschutz</h1><p className="status-message error">{error ?? "Restaurantdaten fehlen."}</p></section>;
  }

  const cards = [
    { title: "Impressum", icon: Building2, value: imprint, anchor: "imprint" },
    { title: "Teilnahmebedingungen", icon: ScrollText, value: terms, anchor: "participation_terms" },
    { title: "Datenschutzerklärung", icon: ShieldCheck, value: privacy, anchor: "privacy" },
  ];

  return (
    <div className="owner-legal-page">
      <header className="page-header">
        <div>
          <span className="premium-dashboard-kicker">Automatisch vorbereitet</span>
          <h1>Rechtliches & Datenschutz</h1>
          <p className="muted">WUXUAI erstellt die Dokumente aus deinen Stammdaten und Bonusregeln. Eigene Rechtstexte musst du nicht schreiben.</p>
        </div>
        <Link className="button secondary" to="/admin/settings">Zurück</Link>
      </header>

      <section className={`owner-legal-summary card${registrationReady ? " ready" : ""}`}>
        <div>
          {registration?.status === "green" ? <CheckCircle2 aria-hidden="true" size={26} /> : registration?.status === "yellow" ? <Clock3 aria-hidden="true" size={26} /> : <AlertCircle aria-hidden="true" size={26} />}
          <div>
            <h2>{registration?.label ?? "Kundenregistrierung blockiert"}</h2>
            <p>{registration?.reason ?? "Der serverseitige Legal-Status ist noch nicht verfügbar."}</p>
            <small>Letzte Aktualisierung: {formatDateTime(registration?.last_updated_at)}</small>
          </div>
        </div>
        <span className={`owner-legal-readable-status ${registration?.status ?? "red"}`}>{registration?.status === "green" ? "Bereit" : registration?.status === "yellow" ? "Prüfung erforderlich" : "Blockiert"}</span>
      </section>

      <section className="owner-legal-automation-note" aria-labelledby="legal-automation-title">
        <Info aria-hidden="true" size={21} />
        <div><strong id="legal-automation-title">Automatisch erstellt von WUXUAI</strong><p>Die Dokumente wurden auf Basis deiner Unternehmens- und Bonusprogrammdaten automatisch erstellt. Prüfe alle Angaben vor der Veröffentlichung. Automatisch erstellte Vorlagen ersetzen keine individuelle Rechtsberatung.</p></div>
        <span>Rechtliche Prüfung empfohlen</span>
      </section>

      {setup.legal_update_required ? (
        <section className="owner-legal-update-note" role="status">
          <FileCheck2 aria-hidden="true" size={20} />
          <div><strong>Neue Version verfügbar</strong><p>Deine Bonusregeln wurden geändert. Prüfe die Unternehmensdaten und veröffentliche anschließend eine aktualisierte Dokumentversion.</p></div>
          <button className="button secondary" onClick={() => setEditing(true)} type="button">Vorschau öffnen</button>
        </section>
      ) : null}

      <section className="owner-legal-overview" aria-label="Rechtliche Dokumente">
        {cards.map(({ title, icon: Icon, value, anchor }) => (
          <article className="card owner-legal-document-card" key={title}>
            <div className="owner-legal-document-icon"><Icon aria-hidden="true" size={21} /></div>
            <div>
              <h2>{title}</h2>
              <p>{displayStatus(value)}</p>
            </div>
            <dl>
              <div><dt>Version</dt><dd>{value?.version ?? "–"}</dd></div>
              <div><dt>Status</dt><dd>{displayStatus(value)}</dd></div>
              <div><dt>Erstellt</dt><dd>{formatDateTime(value?.created_at)}</dd></div>
              <div><dt>Veröffentlicht</dt><dd>{formatDateTime(value?.published_at)}</dd></div>
              <div><dt>Gültig ab</dt><dd>{formatDate(value?.effective_date)}</dd></div>
              <div><dt>Akzeptiert</dt><dd>{value?.acceptance_count ?? 0} Gäste</dd></div>
              <div><dt>Verantwortlich</dt><dd>{value?.responsible_owner ?? "System"}</dd></div>
              <div><dt>Vorlage</dt><dd>{value?.master_template_version ?? "–"}</dd></div>
              {value?.draft_version ? <div><dt>Neuer Entwurf</dt><dd>{value.draft_version}</dd></div> : null}
            </dl>
            <Link className="owner-legal-card-link" to={`${publicLegalPath}#${anchor}`}>Ansehen <ChevronRight aria-hidden="true" size={18} /></Link>
          </article>
        ))}

        <article className="card owner-legal-document-card">
          <div className="owner-legal-document-icon"><Landmark aria-hidden="true" size={21} /></div>
          <div><h2>Bonusregeln</h2><p>{terms ? "Automatisch aus deiner Konfiguration" : "Noch nicht vorbereitet"}</p></div>
          <dl>
            <div><dt>Punktegültigkeit</dt><dd>{terms?.content.points_validity_months ? `${terms.content.points_validity_months} Monate` : "–"}</dd></div>
            <div><dt>Tägliches Limit</dt><dd>{terms?.content.daily_booking_limit ? "2 Buchungen" : "–"}</dd></div>
          </dl>
          <Link className="owner-legal-card-link" to={`${publicLegalPath}#points-validity`}>Ansehen <ChevronRight aria-hidden="true" size={18} /></Link>
        </article>

        <article className="card owner-legal-document-card">
          <div className="owner-legal-document-icon"><ReceiptText aria-hidden="true" size={21} /></div>
          <div><h2>Kassenabgrenzung</h2><p>{terms?.content.cash_register_boundary ? "Bestätigt" : "Noch nicht vorbereitet"}</p></div>
          <p>WUXUAI dokumentiert Bonuspunkte und Einlösungen. Das Restaurant erfasst relevante Vorgänge im eigenen Kassensystem.</p>
          <Link className="owner-legal-card-link" to="/admin/reports">Bonus-Aktivitätsberichte öffnen <ChevronRight aria-hidden="true" size={18} /></Link>
        </article>
      </section>

      <section className="card owner-legal-readiness" aria-labelledby="legal-checklist-title">
        <div><FileCheck2 aria-hidden="true" size={23} /><div><h2 id="legal-checklist-title">Legal Readiness</h2><p>Der Status wird serverseitig aus Restaurant, Pflichtangaben, aktiven Versionen und Programmstatus berechnet.</p></div></div>
        <div className="owner-legal-checklist">
          <p className={missingProfileFields.length === 0 ? "complete" : "missing"}>{missingProfileFields.length === 0 ? <CheckCircle2 aria-hidden="true" size={18} /> : <AlertCircle aria-hidden="true" size={18} />} Unternehmensdaten: {missingProfileFields.length === 0 ? "Erledigt" : "Offen"}</p>
          <p className={documentReadiness.every((item) => item.ready) ? "complete" : "missing"}>{documentReadiness.every((item) => item.ready) ? <CheckCircle2 aria-hidden="true" size={18} /> : <AlertCircle aria-hidden="true" size={18} />} Pflichtdokumente: {documentReadiness.every((item) => item.ready) ? "Aktiv" : "Offen"}</p>
          <p className={hasDrafts ? "missing" : "complete"}>{hasDrafts ? <Clock3 aria-hidden="true" size={18} /> : <CheckCircle2 aria-hidden="true" size={18} />} Veröffentlichung: {hasDrafts ? "Prüfung erforderlich" : "Erledigt"}</p>
          <p className={registration?.program_active ? "complete" : "missing"}>{registration?.program_active ? <CheckCircle2 aria-hidden="true" size={18} /> : <AlertCircle aria-hidden="true" size={18} />} Bonusprogramm: {registration?.program_active ? "Aktiv" : "Blockiert"}</p>
        </div>
      </section>

      <div className="owner-legal-actions">
        <button className="button secondary" onClick={() => setEditing((current) => !current)} type="button">Unternehmensdaten bearbeiten</button>
        <Link className="button secondary" to={publicLegalPath}>Dokumente ansehen</Link>
      </div>

      {editing ? (
        <form className="owner-legal-company-form card" onSubmit={handlePrepare}>
          <div><h2>Unternehmensdaten</h2><p className="muted">Änderungen erzeugen eine neue Version. Die bisher veröffentlichte Version bleibt erhalten.</p></div>
          <RequiredFieldsNote />
          <div className="owner-legal-grid">
            {requiredProfileFields.map(([key, label]) => (
              <div className="field" key={key}><FormLabel htmlFor={`legal-profile-${key}`} required>{label}</FormLabel><input aria-required="true" className="input" id={`legal-profile-${key}`} onChange={(event) => setProfile((current) => ({ ...current, [key]: event.target.value }))} required value={profile[key] ?? ""} /></div>
            ))}
          </div>
          <details className="owner-legal-advanced">
            <summary>Weitere Unternehmensangaben</summary>
            <div className="owner-legal-grid">
              {optionalProfileFields.map(([key, label]) => (
                <div className="field" key={key}><FormLabel htmlFor={`legal-profile-${key}`} optional>{label}</FormLabel><input className="input" id={`legal-profile-${key}`} onChange={(event) => setProfile((current) => ({ ...current, [key]: event.target.value }))} placeholder={key === "complaint_contact" ? "Kontakt-E-Mail wird verwendet" : undefined} value={profile[key] ?? ""} /></div>
              ))}
            </div>
            {complaintUsesFallback ? <p className="muted">Für Beschwerden wird derzeit die Kontakt-E-Mail verwendet.</p> : null}
          </details>
          <div className="owner-legal-form-actions">
            <button className="button secondary" onClick={() => setEditing(false)} type="button">Abbrechen</button>
            <button className="button" disabled={saving || missingProfileFields.length > 0 || (changedFields.length === 0 && !setup.legal_update_required)} type="submit">{saving ? "Version wird vorbereitet …" : "Neue Version vorbereiten"}</button>
          </div>
        </form>
      ) : null}

      {hasDrafts ? (
        <section className="card owner-legal-publication" aria-labelledby="legal-publication-title">
          <div><span className="premium-dashboard-kicker">Prüfung vor Veröffentlichung</span><h2 id="legal-publication-title">Neue Dokumentversionen veröffentlichen</h2><p className="muted">Aktive Versionen und historische Kundenbestätigungen bleiben bis zur Veröffentlichung unverändert.</p></div>
          <div className="owner-legal-publication-grid">
            <div><strong>Geänderte Angaben</strong><p>{preparedChanges.length ? preparedChanges.join(", ") : "Bonusregeln oder automatisch erzeugte Dokumentinhalte"}</p></div>
            <div><strong>Neue Versionen</strong><p>{setup.documents.filter((item) => item.draft_version_id).map((item) => `${item.title} ${item.draft_version}`).join(" · ")}</p></div>
            <div><strong>Neue Kunden</strong><p>Sie akzeptieren ab dem Gültigkeitsdatum die dann aktive Version.</p></div>
            <div><strong>Bestehende Kunden</strong><p>Historische Bestätigungen bleiben erhalten. Eine erneute Zustimmung erfolgt nur bei ausdrücklicher Auswahl.</p></div>
          </div>
          <details className="owner-legal-advanced">
            <summary>Dokumentvorschau anzeigen</summary>
            <div className="owner-legal-preview-list">
              {setup.documents.filter((item) => item.draft_version_id).map((item) => <article key={item.document_type}><strong>{item.title}</strong><span>Version {item.draft_version} · Vorlage {item.draft_master_template_version ?? "–"}</span><p>{item.draft_rendered_text}</p></article>)}
            </div>
          </details>
          <div className="owner-legal-grid">
            <label className="field"><span>Gültig ab</span><input className="input" min={new Date().toISOString().slice(0, 10)} onChange={(event) => setEffectiveDate(event.target.value)} type="date" value={effectiveDate} /></label>
          </div>
          <label className="owner-legal-toggle"><input checked={reacceptanceRequired} onChange={(event) => setReacceptanceRequired(event.target.checked)} type="checkbox" /><span><strong>Erneute Zustimmung bestehender Gäste erforderlich</strong><small>Nicht automatisch aktiv. Nur auswählen, wenn dies rechtlich oder produktseitig ausdrücklich notwendig ist.</small></span></label>
          <label className="owner-legal-toggle"><input checked={publicationConfirmed} onChange={(event) => setPublicationConfirmed(event.target.checked)} type="checkbox" /><span><strong>Ich habe die Angaben geprüft und möchte diese Version veröffentlichen.</strong><small>Veröffentlichung, Vorlage, Dokument-Hash, Owner, Restaurant, Zeitpunkt und Request-ID werden protokolliert.</small></span></label>
          <button className="button" disabled={!publicationConfirmed || saving} onClick={() => void handleConfirmedPublication()} type="button">{saving ? "Veröffentlichung läuft …" : "Geprüfte Version veröffentlichen"}</button>
        </section>
      ) : null}

      <details className="card owner-legal-advanced">
        <summary>Erweiterte rechtliche Einstellungen</summary>
        <div className="owner-legal-advanced-links">
          <Link to="/admin/settings/program-end">Bonusprogramm beenden <ChevronRight aria-hidden="true" size={18} /></Link>
          <Link to="/admin/reports">Bonus-Aktivitätsberichte <ChevronRight aria-hidden="true" size={18} /></Link>
        </div>
      </details>

      <section className="card owner-legal-requests">
        <h2>Datenschutzanfragen</h2>
        <p className="muted">Offene Anfragen werden nachvollziehbar bearbeitet. Es erfolgt keine automatische Löschung.</p>
        {setup.privacy_requests.length ? (
          <div className="owner-legal-request-list">
            {setup.privacy_requests.map((request) => (
              <article key={request.id}>
                <div><strong>{requestTypeLabels[request.request_type] ?? "Datenschutzanfrage"}</strong><span>{request.customer_reference} · {new Intl.DateTimeFormat("de-AT", { dateStyle: "medium" }).format(new Date(request.created_at))}</span></div>
                <span className="owner-legal-request-status">{request.status === "requested" ? "Offen" : "In Prüfung"}</span>
              </article>
            ))}
          </div>
        ) : <p className="owner-legal-empty">Keine offenen Datenschutzanfragen.</p>}
      </section>

      {message ? <p className="status-message" role="status">{message}</p> : null}
      {error ? <p className="status-message error" role="alert">{error}</p> : null}
    </div>
  );
}
