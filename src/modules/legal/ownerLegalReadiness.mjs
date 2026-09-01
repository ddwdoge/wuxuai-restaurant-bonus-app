const REQUIRED_DOCUMENT_COUNT = 2;

function status(id, label, state, value) {
  return { id, label, state, value };
}

export function resolveOwnerLegalReadiness(registration, options = {}) {
  const missingProfileFields = Array.isArray(registration?.missing_profile_fields)
    ? registration.missing_profile_fields
    : [];
  const activeRequiredDocuments = Number(registration?.active_required_documents ?? 0);
  const draftDocuments = Number(registration?.draft_documents ?? 0);
  const hasDrafts = options.hasDrafts ?? draftDocuments > 0;
  const publicationConfirmed = options.publicationConfirmed === true;
  const companyDataReady = missingProfileFields.length === 0;
  const documentsPublished = activeRequiredDocuments >= REQUIRED_DOCUMENT_COUNT;
  const documentsPrepared = documentsPublished || hasDrafts;
  const registrationEnabled = registration?.registration_allowed === true;
  const programActive = registration?.program_active === true;

  const documentState = documentsPublished && !hasDrafts ? "complete" : hasDrafts ? "warning" : "open";
  const documentValue = documentsPublished && !hasDrafts
    ? "Erledigt"
    : hasDrafts
      ? "Prüfung erforderlich"
      : "Offen";
  const publicationState = documentsPublished && !hasDrafts ? "complete" : hasDrafts ? "warning" : "open";
  const publicationValue = documentsPublished && !hasDrafts
    ? "Erledigt"
    : hasDrafts && publicationConfirmed
      ? "Bereit zur Veröffentlichung"
      : hasDrafts
        ? "Prüfung erforderlich"
        : "Offen";

  let action = {
    id: "prepare",
    label: "Dokumente vorbereiten",
    kind: "prepare",
  };
  if (!companyDataReady) {
    action = { id: "company", label: "Unternehmensdaten vervollständigen", kind: "company" };
  } else if (hasDrafts && !publicationConfirmed) {
    action = { id: "review", label: "Dokumente prüfen", kind: "review" };
  } else if (hasDrafts) {
    action = { id: "publish", label: "Geprüfte Version veröffentlichen", kind: "publish" };
  } else if (documentsPublished) {
    action = { id: "view", label: "Dokumente ansehen", kind: "view" };
  }

  return {
    companyDataReady,
    documentsPrepared,
    documentsPublished,
    registrationEnabled,
    programActive,
    action,
    statuses: [
      status("company", "Unternehmensdaten", companyDataReady ? "complete" : "open", companyDataReady ? "Erledigt" : "Offen"),
      status("documents", "Dokumente", documentState, documentValue),
      status("publication", "Veröffentlichung", publicationState, publicationValue),
      status("registration", "Kundenregistrierung", registrationEnabled ? "complete" : "blocked", registrationEnabled ? "Freigegeben" : "Blockiert"),
      status("program", "Bonusprogramm", programActive ? "complete" : "blocked", programActive ? "Aktiv" : "Nicht aktiv"),
    ],
  };
}

export function validateLegalPublication(documents, effectiveDate, confirmed) {
  if (!effectiveDate) return "Gültigkeitsdatum fehlt.";

  const required = [
    ["participation_terms", "Teilnahmebedingungen"],
    ["privacy", "Datenschutzerklärung"],
  ];

  for (const [documentType, title] of required) {
    const item = documents.find((candidate) => candidate.document_type === documentType);
    if (!item?.draft_version_id) return `${title}: vorbereitete Version fehlt.`;
    if (!item.draft_master_template_version) return `${title}: Dokumentvorlage fehlt.`;
    if (!item.draft_content || typeof item.draft_content !== "object" || Object.keys(item.draft_content).length === 0) return `${title}: Inhalt ist unvollständig.`;
    if (!String(item.draft_rendered_text ?? "").trim()) return `${title}: Vorschau ist unvollständig.`;
  }

  if (!confirmed) return "Bitte bestätige beide Dokumente vor der Veröffentlichung.";
  return null;
}

export function legalPublicationErrorMessage(error) {
  const code = error && typeof error === "object" && "code" in error ? String(error.code ?? "") : "";
  const message = error && typeof error === "object" && "message" in error ? String(error.message ?? "") : "";
  if (code === "22004" || /LEGAL_EFFECTIVE_DATE_REQUIRED/.test(message)) return "Gültigkeitsdatum fehlt.";
  if (/LEGAL_PUBLICATION_CONFIRMATION_REQUIRED/.test(message)) return "Bitte bestätige beide Dokumente vor der Veröffentlichung.";
  if (/LEGAL_REQUIRED_DOCUMENTS_MISSING/.test(message)) return "Teilnahmebedingungen oder Datenschutzerklärung: vorbereitete Version fehlt.";
  if (/LEGAL_DRAFT_INVALID/.test(message)) return "Mindestens ein Dokument ist unvollständig. Bitte öffne die Vorschau und prüfe die markierte Version.";
  if (/LEGAL_DRAFTS_MISSING/.test(message)) return "Es gibt keine vorbereitete Dokumentversion zum Veröffentlichen.";
  if (code === "42501" || /LEGAL_PUBLICATION_NOT_AUTHORIZED/.test(message)) return "Du darfst diese Dokumente nicht veröffentlichen.";
  return "Die Dokumente konnten nicht veröffentlicht werden. Bitte versuche es erneut.";
}
