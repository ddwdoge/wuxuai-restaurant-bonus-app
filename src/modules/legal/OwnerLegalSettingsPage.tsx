import { FormEvent, useEffect, useState } from "react";
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
import { getLegalDocumentContent, getPointsValidityState, ownerLegalLoadErrorMessage } from "./legalDocumentState.mjs";
import { safeLegalRpcError, viennaCalendarDate } from "./legalPublicationDate.mjs";
import {
  companyRegistrationLabel,
  legalFormSuggestions,
  normalizeCompanyRegistrationNumber,
  normalizeVatId,
  optionalCompanyIdentifierHint,
  vatIdLabel,
} from "./legalCompanyData.mjs";
import {
  legalPublicationErrorMessage,
  resolveOwnerLegalReadiness,
  validateLegalPublication,
} from "./ownerLegalReadiness.mjs";
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
  ["commercial_register_number", "Unternehmensregistrierungsnummer"],
  ["commercial_register_court", "Firmenbuchgericht"],
  ["vat_id", "Umsatzsteuer-ID"],
  ["chamber_membership", "Kammerzugehörigkeit"],
  ["supervisory_authority", "Aufsichtsbehörde"],
  ["accessibility_contact", "Barrierefreiheitskontakt"],
  ["complaint_contact", "Beschwerdekontakt"],
  ["responsible_person", "Vertretungsberechtigte Person / Geschäftsführung"],
] as const;

const allProfileFields = [...requiredProfileFields, ...optionalProfileFields] as const;

function profileFieldLabel(key: string, fallback: string, country: string | null | undefined) {
  if (key === "commercial_register_number") return companyRegistrationLabel(country);
  if (key === "vat_id") return vatIdLabel(country);
  return fallback;
}

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
  const [effectiveDate, setEffectiveDate] = useState(() => viennaCalendarDate());
  const [reacceptanceRequired, setReacceptanceRequired] = useState(false);
  const [publicationConfirmed, setPublicationConfirmed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryRevision, setRetryRevision] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (!activeRestaurant?.id) {
      setSetup(null);
      setProfile({});
      setOriginalProfile({});
      setError("Restaurantdaten fehlen.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    loadRestaurantLegalSetup(activeRestaurant.id)
      .then((next) => {
        if (cancelled) return;
        setSetup(next);
        setProfile(next.profile);
        setOriginalProfile(next.profile);
      })
      .catch((loadError: unknown) => {
        if (!cancelled) {
          setSetup(null);
          setProfile({});
          setOriginalProfile({});
          setError(ownerLegalLoadErrorMessage(loadError));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeRestaurant?.id, retryRevision]);

  const terms = document(setup, "participation_terms");
  const termsContent = getLegalDocumentContent(terms);
  const pointsValidity = getPointsValidityState(terms);
  const privacy = document(setup, "privacy");
  const imprint = document(setup, "imprint");
  const missingProfileFields = requiredProfileFields.filter(([key]) => !profile[key]?.trim());
  const registration = setup?.readiness.registration;
  const registrationReady = registration?.registration_allowed ?? false;
  const bonusProgramIncomplete = registration?.program_active === false;
  const complaintUsesFallback = !profile.complaint_contact?.trim() && Boolean(profile.email?.trim());
  const useRestaurantAddress = profile.registered_address_source === "restaurant";
  const restaurantAddressComplete = Boolean(
    activeRestaurant?.address?.trim()
    && activeRestaurant.postal_code?.trim()
    && activeRestaurant.city?.trim()
    && activeRestaurant.country?.trim(),
  );
  const restaurantAddressReadOnly = useRestaurantAddress && restaurantAddressComplete;
  const publicLegalPath = activeRestaurant?.slug ? `/legal/${activeRestaurant.slug}` : "/admin/legal";

  const changedFields = allProfileFields
    .filter(([key]) => (profile[key] ?? "").trim() !== (originalProfile[key] ?? "").trim())
    .map(([key, label]) => profileFieldLabel(key, label, profile.country))
    .concat(profile.registered_address_source !== originalProfile.registered_address_source ? ["Geschäftsanschrift"] : []);
  const hasDrafts = setup?.documents.some((item) => Boolean(item.draft_version_id)) ?? false;
  const readiness = resolveOwnerLegalReadiness(registration, { hasDrafts, publicationConfirmed });

  async function handlePrepare(event: FormEvent) {
    event.preventDefault();
    if (!activeRestaurant?.id || saving) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const nextProfile = {
        ...profile,
        commercial_register_number: normalizeCompanyRegistrationNumber(profile.commercial_register_number, profile.country),
        vat_id: normalizeVatId(profile.vat_id, profile.country),
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

  function setAddressSource(useRestaurant: boolean) {
    setProfile((current) => ({
      ...current,
      registered_address_source: useRestaurant ? "restaurant" : "separate",
      ...(useRestaurant && restaurantAddressComplete ? {
        street: activeRestaurant?.address ?? "",
        postal_code: activeRestaurant?.postal_code ?? "",
        city: activeRestaurant?.city ?? "",
        country: activeRestaurant?.country ?? "AT",
      } : {}),
    }));
  }

  async function handleConfirmedPublication() {
    if (!activeRestaurant?.id || !publicationConfirmed || saving) return;
    const validationError = validateLegalPublication(setup?.documents ?? [], effectiveDate, publicationConfirmed);
    if (validationError) {
      setError(validationError);
      return;
    }
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
    } catch (publicationError: unknown) {
      const safeError = safeLegalRpcError(publicationError);
      setError(legalPublicationErrorMessage(safeError));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <section className="card settings-detail-card"><h1>Rechtliches & Datenschutz</h1><p className="muted">Dokumente werden geladen …</p></section>;
  }

  if (!activeRestaurant || !setup) {
    return (
      <section className="card settings-detail-card">
        <h1>Rechtliches & Datenschutz</h1>
        <p className="status-message error" role="alert">{error ?? "Restaurantdaten fehlen."}</p>
        <div className="owner-legal-actions">
          {activeRestaurant ? <button className="button" onClick={() => setRetryRevision((current) => current + 1)} type="button">Erneut versuchen</button> : null}
          <Link className="button secondary" to="/admin">Zum Dashboard</Link>
        </div>
      </section>
    );
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

      <section className="card owner-legal-readiness" aria-labelledby="legal-checklist-title">
        <div><FileCheck2 aria-hidden="true" size={23} /><div><h2 id="legal-checklist-title">Rechtliche Freigabe</h2><p>Drei Schritte führen von den Unternehmensdaten zur Kundenregistrierung.</p></div></div>
        <ol className="owner-legal-journey" aria-label="Einrichtungsschritte">
          <li className={readiness.companyDataReady ? "complete" : "open"}><span>1</span><div><strong>Unternehmensdaten</strong><small>{readiness.companyDataReady ? "Erledigt" : "Angaben vervollständigen"}</small></div></li>
          <li className={readiness.documentsPublished && !hasDrafts ? "complete" : "open"}><span>2</span><div><strong>Dokumente prüfen</strong><small>{hasDrafts ? "Prüfung erforderlich" : readiness.documentsPublished ? "Erledigt" : "Offen"}</small></div></li>
          <li className={readiness.documentsPublished && !hasDrafts ? "complete" : "open"}><span>3</span><div><strong>Veröffentlichen</strong><small>{readiness.documentsPublished && !hasDrafts ? "Erledigt" : "Offen"}</small></div></li>
        </ol>
        <div className="owner-legal-checklist">
          {readiness.statuses.map((item) => (
            <p className={item.state} key={item.id}>
              {item.state === "complete" ? <CheckCircle2 aria-hidden="true" size={18} /> : item.state === "warning" ? <Clock3 aria-hidden="true" size={18} /> : <AlertCircle aria-hidden="true" size={18} />}
              <span>{item.label}</span><strong>{item.value}</strong>
            </p>
          ))}
        </div>
        <div className="owner-legal-readiness-action">
          {readiness.action.kind === "company" ? <button className="button" onClick={() => setEditing(true)} type="button">{readiness.action.label}</button> : null}
          {readiness.action.kind === "prepare" ? <button className="button" onClick={() => setEditing(true)} type="button">{readiness.action.label}</button> : null}
          {readiness.action.kind === "review" ? <a className="button" href="#legal-publication">{readiness.action.label}</a> : null}
          {readiness.action.kind === "publish" ? <button className="button" disabled={saving} onClick={() => void handleConfirmedPublication()} type="button">{readiness.action.label}</button> : null}
          {readiness.action.kind === "view" ? <Link className="button secondary" to={publicLegalPath}>{readiness.action.label}</Link> : null}
        </div>
      </section>

      {bonusProgramIncomplete ? (
        <section className="owner-legal-update-note" role="status">
          <AlertCircle aria-hidden="true" size={20} />
          <div><strong>Bonusprogramm noch nicht vollständig eingerichtet</strong><p>Schließe die Einrichtung ab, bevor rechtlich verbindliche Bonusregeln veröffentlicht werden.</p></div>
          <Link className="button secondary" to="/admin/onboarding">Zum Onboarding</Link>
        </section>
      ) : null}

      {!readiness.documentsPublished ? (
        <section className="owner-legal-update-note" role="status">
          <Clock3 aria-hidden="true" size={20} />
          <div><strong>Dokumente noch nicht veröffentlicht</strong><p>{hasDrafts ? "Deine Dokumente wurden vorbereitet. Prüfe und veröffentliche sie, damit sich neue Kunden registrieren können." : "Bereite deine Dokumente vor und prüfe sie, damit sich neue Kunden registrieren können."}</p></div>
          {hasDrafts ? <a className="button secondary" href="#legal-publication">Dokumente prüfen</a> : <button className="button secondary" onClick={() => setEditing(true)} type="button">Dokumente vorbereiten</button>}
        </section>
      ) : null}

      <details className="owner-legal-automation-note">
        <summary><Info aria-hidden="true" size={21} /><strong>Hinweis zu den Dokumentvorlagen</strong></summary>
        <p>WUXUAI erstellt die Dokumente aus deinen Unternehmens- und Bonusprogrammdaten. Prüfe alle Angaben vor der Veröffentlichung. Die Vorlagen ersetzen keine individuelle Rechtsberatung.</p>
      </details>

      {setup.legal_update_required ? (
        <section className="owner-legal-update-note" role="status">
          <FileCheck2 aria-hidden="true" size={20} />
          <div><strong>Neue Version verfügbar</strong><p>Deine Bonusregeln wurden geändert. Prüfe die Unternehmensdaten und veröffentliche anschließend eine aktualisierte Dokumentversion.</p></div>
          <button className="button secondary" onClick={() => setEditing(true)} type="button">Vorschau öffnen</button>
        </section>
      ) : null}

      <details className="owner-legal-document-details">
        <summary>Dokumentdetails anzeigen</summary>
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
            <div><dt>Punktegültigkeit</dt><dd>{pointsValidity.status === "available" ? `${pointsValidity.months} Monate` : "Noch nicht veröffentlicht"}</dd></div>
            <div><dt>Tägliches Limit</dt><dd>{termsContent?.daily_booking_limit ? "2 Buchungen" : "Noch nicht veröffentlicht"}</dd></div>
          </dl>
          <Link className="owner-legal-card-link" to={`${publicLegalPath}#points-validity`}>Ansehen <ChevronRight aria-hidden="true" size={18} /></Link>
        </article>

        <article className="card owner-legal-document-card">
          <div className="owner-legal-document-icon"><ReceiptText aria-hidden="true" size={21} /></div>
          <div><h2>Kassenabgrenzung</h2><p>{termsContent?.cash_register_boundary ? "Bestätigt" : "Noch nicht veröffentlicht"}</p></div>
          <p>WUXUAI dokumentiert Bonuspunkte und Einlösungen. Das Restaurant erfasst relevante Vorgänge im eigenen Kassensystem.</p>
          <Link className="owner-legal-card-link" to="/admin/reports">Bonus-Aktivitätsberichte öffnen <ChevronRight aria-hidden="true" size={18} /></Link>
        </article>
        </section>
      </details>

      <div className="owner-legal-actions">
        <button className="button secondary" onClick={() => setEditing((current) => !current)} type="button">Unternehmensdaten bearbeiten</button>
      </div>

      {editing ? (
        <form className="owner-legal-company-form card" onSubmit={handlePrepare}>
          <div><h2>Unternehmensdaten</h2><p className="muted">Diese Angaben werden für rechtliche Dokumente und das Impressum verwendet. FN und UID sind optional. Änderungen erzeugen eine neue Dokumentversion; die bisher veröffentlichte Version bleibt erhalten.</p></div>
          <RequiredFieldsNote />
          <label className="legal-address-source-toggle" htmlFor="owner-legal-address-source">
            <input
              checked={useRestaurantAddress}
              id="owner-legal-address-source"
              onChange={(event) => setAddressSource(event.target.checked)}
              type="checkbox"
            />
            <span>Geschäftsanschrift entspricht Restaurantadresse</span>
          </label>
          {useRestaurantAddress && !restaurantAddressComplete ? <p className="field-hint">Die eingegebene Adresse wird zugleich als Restaurant- und Geschäftsanschrift gespeichert.</p> : null}
          {!useRestaurantAddress ? <p className="field-hint">Diese Geschäftsanschrift bleibt von späteren Änderungen der Restaurantadresse getrennt.</p> : null}
          <div className="owner-legal-grid">
            {requiredProfileFields.map(([key, label]) => {
              const addressField = ["street", "postal_code", "city", "country"].includes(key);
              return (
                <div className="field" key={key}>
                  <FormLabel htmlFor={`legal-profile-${key}`} required>{label}</FormLabel>
                  <input aria-required={!addressField || !restaurantAddressReadOnly} className="input" disabled={addressField && restaurantAddressReadOnly} id={`legal-profile-${key}`} list={key === "legal_form" ? "owner-legal-form-options" : undefined} onChange={(event) => setProfile((current) => ({ ...current, [key]: event.target.value }))} required={!addressField || !restaurantAddressReadOnly} value={profile[key] ?? ""} />
                  {key === "legal_form" ? <datalist id="owner-legal-form-options">{legalFormSuggestions.map((legalForm) => <option key={legalForm} value={legalForm} />)}</datalist> : null}
                </div>
              );
            })}
          </div>
          <details className="owner-legal-advanced">
            <summary>Weitere Unternehmensangaben</summary>
            <div className="owner-legal-grid">
              {optionalProfileFields.map(([key, label]) => {
                const identifierKind = key === "commercial_register_number" ? "registration" : key === "vat_id" ? "vat" : null;
                const hint = identifierKind ? optionalCompanyIdentifierHint(identifierKind, profile[key], profile.country) : null;
                return (
                  <div className="field" key={key}>
                    <FormLabel htmlFor={`legal-profile-${key}`} optional>{profileFieldLabel(key, label, profile.country)}</FormLabel>
                    <input
                      autoCapitalize={key === "vat_id" ? "characters" : undefined}
                      className="input"
                      id={`legal-profile-${key}`}
                      onBlur={identifierKind ? (event) => setProfile((current) => ({
                        ...current,
                        [key]: identifierKind === "registration"
                          ? normalizeCompanyRegistrationNumber(event.target.value, current.country)
                          : normalizeVatId(event.target.value, current.country),
                      })) : undefined}
                      onChange={(event) => setProfile((current) => ({ ...current, [key]: event.target.value }))}
                      placeholder={key === "complaint_contact" ? "Kontakt-E-Mail wird verwendet" : undefined}
                      value={profile[key] ?? ""}
                    />
                    {hint ? <p className="field-hint warning">{hint}</p> : null}
                  </div>
                );
              })}
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
        <section className="card owner-legal-publication" id="legal-publication" aria-labelledby="legal-publication-title">
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
            <label className="field"><span>Gültig ab</span><input className="input" min={viennaCalendarDate()} onChange={(event) => setEffectiveDate(event.target.value)} type="date" value={effectiveDate} /></label>
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
