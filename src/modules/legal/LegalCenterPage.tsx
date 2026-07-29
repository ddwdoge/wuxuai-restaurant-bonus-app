import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Accessibility,
  ArrowLeft,
  Building2,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Download,
  FileText,
  MessageCircleQuestion,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { readStoredCustomerToken } from "../customer/customerTokenStorage";
import { AppShell, EmptyState, ErrorState, LoadingState } from "../customer/components/PremiumCustomerUi";
import {
  acceptCurrentLegalDocuments,
  createCustomerPrivacyRequest,
  downloadCustomerData,
  loadPublicLegalCenter,
  updateCustomerConsent,
  type ConsentType,
  type LegalDocumentView,
  type PublicLegalCenter,
} from "./legalService";
import "./legal-center.css";

const consentLabels: Record<ConsentType, { title: string; description: string }> = {
  marketing_push: { title: "Marketing per Push", description: "Freiwillige Angebote als Push-Nachricht." },
  marketing_sms: { title: "Marketing per SMS", description: "Freiwillige Angebote per SMS." },
  marketing_email: { title: "Marketing per E-Mail", description: "Freiwillige Angebote per E-Mail." },
  personalized_recommendations: { title: "Persönliche Empfehlungen", description: "Freiwillige, auf deine Nutzung abgestimmte Hinweise." },
  birthday_processing: { title: "Geburtstagsverarbeitung", description: "Freiwillige Nutzung von Tag und Monat für das Geburtstagsgeschenk." },
};

const legalFieldLabels: Record<string, string> = {
  program_operator_name: "Betreiber des Bonusprogramms",
  program_operator_address: "Adresse des Betreibers",
  contact_email: "Kontakt-E-Mail",
  points_earning_rule: "Regel für Punktevergabe",
  daily_booking_limit: "Tägliches Buchungslimit",
  excluded_transactions: "Ausgeschlossene Vorgänge",
  points_validity_months: "Punktegültigkeit in Monaten",
  reward_validity_rule: "Gültigkeit von Punkteeinlösungen",
  redemption_conditions: "Einlösebedingungen",
  cash_payout_prohibited: "Barauszahlung ausgeschlossen",
  transfer_prohibited: "Übertragung ausgeschlossen",
  cancellation_rule: "Storno- und Korrekturregel",
  fraud_and_blocking_rule: "Missbrauch und Sperre",
  program_termination_rule: "Regel bei Programmende",
  final_redemption_period: "Letzte Einlösefrist",
  complaint_contact: "Beschwerdekontakt",
  effective_date: "Gültig ab",
  language: "Sprache",
  version: "Version",
  roles_separated: "Verantwortlichkeiten getrennt",
  company_name: "Unternehmensname",
  legal_form: "Rechtsform",
  street: "Straße und Hausnummer",
  postal_code: "Postleitzahl",
  city: "Ort",
  country: "Land",
  email: "E-Mail",
  phone: "Telefon",
  commercial_register_number: "Firmenbuchnummer",
  commercial_register_court: "Firmenbuchgericht",
  vat_id: "UID-Nummer",
  chamber_membership: "Kammerzugehörigkeit",
  supervisory_authority: "Aufsichtsbehörde",
  accessibility_contact: "Kontakt Barrierefreiheit",
  legal_review_status: "Rechtlicher Prüfstatus",
  updated_at: "Zuletzt aktualisiert",
};

function legalFieldLabel(key: string) {
  return legalFieldLabels[key] ?? "Weitere Angabe";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("de-AT", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value));
}

function documentByType(data: PublicLegalCenter, type: LegalDocumentView["document_type"]) {
  return data.documents.find((document) => document.document_type === type) ?? null;
}

function DocumentSection({ document }: { document: LegalDocumentView }) {
  const structuredEntries = Object.entries(document.content ?? {}).filter(([, value]) => value !== null && String(value).trim());
  return (
    <article className="legal-document-card" id={document.document_type}>
      <header><FileText aria-hidden="true" size={21} /><div><h2>{document.title}</h2><p>Version {document.version} · gültig ab {formatDate(document.effective_date)}</p></div></header>
      <p>{document.rendered_text}</p>
      {structuredEntries.length ? (
        <dl>
          {structuredEntries.map(([key, value]) => <div key={key}><dt>{legalFieldLabel(key)}</dt><dd>{typeof value === "boolean" ? (value ? "Ja" : "Nein") : String(value)}</dd></div>)}
        </dl>
      ) : null}
    </article>
  );
}

export function LegalCenterPage() {
  const { slug = "" } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || readStoredCustomerToken(slug) || null;
  const [data, setData] = useState<PublicLegalCenter | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [savingConsent, setSavingConsent] = useState<ConsentType | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [acceptingDocuments, setAcceptingDocuments] = useState(false);

  const reload = useCallback(async () => {
    if (!slug) {
      setError("Restaurant wurde nicht gefunden.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setData(await loadPublicLegalCenter(slug, token));
    } catch {
      setData(null);
      setError("Die rechtlichen Informationen dieses Restaurants konnten gerade nicht geladen werden. Bitte versuche es erneut.");
    } finally {
      setLoading(false);
    }
  }, [slug, token]);

  useEffect(() => { void reload(); }, [reload]);

  const consentState = useMemo(() => new Map(data?.consents.map((consent) => [consent.consent_type, consent.status]) ?? []), [data]);

  async function handleConsent(consentType: ConsentType, granted: boolean) {
    if (!token || savingConsent) return;
    setSavingConsent(consentType);
    setMessage(null);
    try {
      await updateCustomerConsent(slug, token, consentType, granted);
      await reload();
      setMessage(granted ? "Einwilligung gespeichert." : "Einwilligung wurde mit sofortiger Wirkung widerrufen.");
    } catch {
      setMessage("Einwilligung konnte gerade nicht geändert werden.");
    } finally {
      setSavingConsent(null);
    }
  }

  async function handleRequest(type: "access" | "rectification" | "deletion" | "restriction" | "membership_termination" | "complaint") {
    if (!token || requesting) return;
    setRequesting(true);
    setMessage(null);
    try {
      await createCustomerPrivacyRequest(slug, token, type);
      setMessage(type === "deletion" || type === "membership_termination"
        ? "Deine Anfrage wurde sicher an das Restaurant übermittelt. Punkte werden nicht ungeprüft gelöscht."
        : "Deine Anfrage wurde an das Restaurant übermittelt.");
    } catch {
      setMessage("Deine Anfrage konnte gerade nicht übermittelt werden.");
    } finally {
      setRequesting(false);
    }
  }

  async function handleDownload() {
    if (!token || requesting) return;
    setRequesting(true);
    setMessage(null);
    try {
      await downloadCustomerData(slug, token);
      setMessage("Deine restaurantbezogenen Daten wurden bereitgestellt.");
    } catch {
      setMessage("Deine Daten konnten gerade nicht bereitgestellt werden.");
    } finally {
      setRequesting(false);
    }
  }

  async function handleLegalAcceptance() {
    if (!token || acceptingDocuments) return;
    setAcceptingDocuments(true);
    setMessage(null);
    try {
      await acceptCurrentLegalDocuments(slug, token);
      await reload();
      setMessage("Die aktuellen Teilnahmebedingungen und Datenschutzinformationen wurden bestätigt.");
    } catch {
      setMessage("Die Bestätigung konnte gerade nicht gespeichert werden.");
    } finally {
      setAcceptingDocuments(false);
    }
  }

  if (loading) return <AppShell><main className="legal-center-shell"><LoadingState description="Rechtliche Informationen werden geladen …" /></main></AppShell>;
  if (error || !data) return <AppShell><main className="legal-center-shell"><ErrorState action={<button className="premium-button premium-button-secondary" onClick={() => void reload()} type="button">Erneut versuchen</button>} description={error ?? "Keine Daten verfügbar."} title="Rechtliches nicht verfügbar" /></main></AppShell>;
  if (!data.legal_ready || data.missing_configuration) return <AppShell><main className="legal-center-shell"><ErrorState action={<button className="premium-button premium-button-secondary" onClick={() => void reload()} type="button">Erneut versuchen</button>} description="Dieses Restaurant hat die erforderlichen rechtlichen Informationen noch nicht vollständig eingerichtet." title="Rechtliches noch nicht verfügbar" /></main></AppShell>;

  const terms = documentByType(data, "participation_terms");
  const privacy = documentByType(data, "privacy");
  const storage = documentByType(data, "storage");
  const accessibility = documentByType(data, "accessibility");
  const reacceptanceRequired = data.documents.some((document) => document.reacceptance_required && document.accepted === false);

  return (
    <AppShell>
      <main className="legal-center-shell">
        <header className="legal-center-header">
          <Link aria-label="Zurück zum Bonus" to={`/customer/${encodeURIComponent(slug)}${token ? `?token=${encodeURIComponent(token)}` : ""}`}><ArrowLeft aria-hidden="true" size={21} /></Link>
          <div><span>WUXUAI Bonus</span><h1>Rechtliches & Datenschutz</h1><p>{data.roles.notice}</p></div>
          <ShieldCheck aria-hidden="true" size={25} />
        </header>

        <section className="legal-role-card"><Building2 aria-hidden="true" size={23} /><div><strong>Klare Verantwortung</strong><p>{data.restaurant.name} betreibt das Bonusprogramm, vergibt Punkte und bietet Punkteeinlösungen an. WUXUAI stellt die technische Plattform bereit und hält keine Kundengelder.</p></div></section>
        <p className="legal-product-notice">{data.product_notice}</p>

        {token && data.customer_recognized && reacceptanceRequired ? (
          <section className="legal-reacceptance" aria-labelledby="legal-reacceptance-title">
            <div><strong id="legal-reacceptance-title">Aktualisierte Bedingungen</strong><p>Für dieses Bonusprogramm wurden rechtlich relevante Inhalte aktualisiert. Bitte lies die aktuelle Version und bestätige sie anschließend.</p></div>
            <button disabled={acceptingDocuments} onClick={() => void handleLegalAcceptance()} type="button">{acceptingDocuments ? "Bestätigung wird gespeichert …" : "Aktuelle Version bestätigen"}</button>
          </section>
        ) : null}

        <nav className="legal-jump-links" aria-label="Rechtliche Bereiche">
          <a href="#participation_terms">Teilnahmebedingungen</a><a href="#privacy">Datenschutz</a><a href="#imprint">Impressum</a><a href="#accessibility">Barrierefreiheit</a>
        </nav>

        {terms ? <DocumentSection document={terms} /> : null}
        <article className="legal-document-card" id="points-validity">
          <header><Clock3 aria-hidden="true" size={21} /><div><h2>Punktegültigkeit und Programmlaufzeit</h2><p>Aktuelle Angaben dieses Restaurants</p></div></header>
          <p>{data.points_validity.months ? `Punkte sind nach den aktuellen Teilnahmebedingungen ${data.points_validity.months} Monate gültig.` : "Die Punktegültigkeit ist in den Teilnahmebedingungen beschrieben."}</p>
          {data.points_validity.oldest_expiry_at ? <p>Dein ältestes berechenbares Ablaufdatum: <strong>{formatDate(data.points_validity.oldest_expiry_at)}</strong>.</p> : <p>{data.points_validity.notice}</p>}
          {data.program.status === "scheduled" ? <div className="legal-program-end"><strong>Programmende geplant</strong><p>{data.program.customer_notice}</p><p>Letzte Punktevergabe: {formatDate(data.program.last_points_earning_at!)} · letzte Einlösung: {formatDate(data.program.final_redemption_at!)}</p></div> : <p>Das Bonusprogramm ist derzeit aktiv. Ein geplantes Ende wird hier mit den maßgeblichen Fristen angezeigt.</p>}
        </article>
        {privacy ? <DocumentSection document={privacy} /> : null}
        {storage ? <DocumentSection document={storage} /> : null}

        <article className="legal-document-card" id="imprint">
          <header><Building2 aria-hidden="true" size={21} /><div><h2>Impressum des Bonusprogramms</h2><p>Betreiber: {data.roles.program_operator}</p></div></header>
          <dl>{Object.entries(data.imprint).filter(([, value]) => value).map(([key, value]) => <div key={key}><dt>{legalFieldLabel(key)}</dt><dd>{value}</dd></div>)}</dl>
          <p className="legal-platform-note"><strong>Technischer Plattformanbieter:</strong> WUXUAI. WUXUAI ist nicht Schuldner der vom Restaurant angebotenen Punkteeinlösungen.</p>
        </article>

        {accessibility ? <DocumentSection document={accessibility} /> : null}

        <article className="legal-document-card" id="contact">
          <header><MessageCircleQuestion aria-hidden="true" size={21} /><div><h2>Kontakt und Beschwerde</h2><p>Fragen zu Punkten, Restaurantzuordnung oder Punkteeinlösungen</p></div></header>
          <p>Beschwerden zum Bonusprogramm richtest du an: <strong>{data.imprint.complaint_contact || data.imprint.email || data.restaurant.name}</strong>.</p>
          {token ? <button className="legal-secondary-action" disabled={requesting} onClick={() => void handleRequest("complaint")} type="button">Beschwerde übermitteln <ChevronRight aria-hidden="true" size={18} /></button> : null}
        </article>

        {token && data.customer_recognized ? (
          <>
            <section className="legal-personal-section" aria-labelledby="consent-title">
              <div><span>Deine Entscheidungen</span><h2 id="consent-title">Meine Einwilligungen</h2><p>Marketing ist freiwillig und standardmäßig aus. Ein Widerruf beendet deine Mitgliedschaft nicht und löscht keine Punkte.</p></div>
              <div className="legal-consent-list">
                {(Object.keys(consentLabels) as ConsentType[]).map((type) => {
                  const granted = consentState.get(type) === "granted";
                  return <label key={type}><span><strong>{consentLabels[type].title}</strong><small>{consentLabels[type].description}</small></span><input aria-label={consentLabels[type].title} checked={granted} disabled={savingConsent === type} onChange={(event) => void handleConsent(type, event.target.checked)} type="checkbox" /></label>;
                })}
              </div>
            </section>

            <section className="legal-personal-section" aria-labelledby="privacy-actions-title">
              <div><span>Deine Datenschutzrechte</span><h2 id="privacy-actions-title">Daten & Mitgliedschaft</h2><p>Anfragen werden restaurantbezogen und nachvollziehbar bearbeitet. Gesetzlich oder sicherheitsbedingt erforderliche Nachweise werden nicht ungeprüft gelöscht.</p></div>
              <div className="legal-action-list">
                <button disabled={requesting} onClick={() => void handleDownload()} type="button"><Download aria-hidden="true" size={20} /><span><strong>Meine Daten herunterladen</strong><small>Restaurantbezogene JSON-Datei</small></span><ChevronRight aria-hidden="true" size={18} /></button>
                <button disabled={requesting} onClick={() => void handleRequest("rectification")} type="button"><FileText aria-hidden="true" size={20} /><span><strong>Daten berichtigen lassen</strong><small>Korrekturanfrage an das Restaurant</small></span><ChevronRight aria-hidden="true" size={18} /></button>
                <button disabled={requesting} onClick={() => void handleRequest("restriction")} type="button"><Accessibility aria-hidden="true" size={20} /><span><strong>Verarbeitung einschränken</strong><small>Prüfung beantragen</small></span><ChevronRight aria-hidden="true" size={18} /></button>
                <button className="danger" disabled={requesting} onClick={() => void handleRequest("deletion")} type="button"><Trash2 aria-hidden="true" size={20} /><span><strong>Löschung beantragen</strong><small>Konto oder Restaurantmitgliedschaft prüfen lassen</small></span><ChevronRight aria-hidden="true" size={18} /></button>
              </div>
            </section>
          </>
        ) : <EmptyState description="Öffne deinen persönlichen Bonus-Link, um Einwilligungen zu verwalten oder deine Daten anzufordern." title="Persönlicher Bereich" />}

        {message ? <p className="legal-status" role="status"><CheckCircle2 aria-hidden="true" size={18} /> {message}</p> : null}
        <footer><p>Diese technischen Vorlagen ersetzen keine individuelle Rechts- oder Steuerberatung.</p></footer>
      </main>
    </AppShell>
  );
}
