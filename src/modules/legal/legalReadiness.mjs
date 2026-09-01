const REQUIRED_LEGAL_DOCUMENT_TYPES = Object.freeze([
  "participation_terms",
  "privacy",
]);

export function requiredLegalDocumentStatus(documents, todayIso) {
  const today = String(todayIso ?? "").slice(0, 10);

  return REQUIRED_LEGAL_DOCUMENT_TYPES.map((documentType) => {
    const document = documents.find((item) => item.document_type === documentType) ?? null;
    const published = document?.status === "published";
    const effective = published
      && typeof document.effective_date === "string"
      && document.effective_date.slice(0, 10) <= today;

    return {
      documentType,
      document,
      exists: Boolean(document),
      published,
      effective,
      ready: Boolean(document && published && effective),
    };
  });
}

export function isLegalBundleReady(documents, todayIso) {
  return requiredLegalDocumentStatus(documents, todayIso).every((item) => item.ready);
}
