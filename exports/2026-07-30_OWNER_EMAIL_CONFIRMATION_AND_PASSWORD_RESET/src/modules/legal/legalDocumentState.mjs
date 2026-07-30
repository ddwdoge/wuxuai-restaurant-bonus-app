export function getLegalDocumentContent(document) {
  const content = document?.content;
  return content && typeof content === "object" && !Array.isArray(content) ? content : null;
}

export function getPointsValidityState(document) {
  if (!document) return { status: "missing_document", months: null };
  const content = getLegalDocumentContent(document);
  if (!content) return { status: "missing_published_content", months: null };
  const rawValue = content.points_validity_months;
  const months = typeof rawValue === "number" ? rawValue : Number(rawValue);
  if (!Number.isInteger(months) || months < 1 || months > 240) {
    return { status: "missing_value", months: null };
  }
  return { status: "available", months };
}

export function ownerLegalLoadErrorMessage(error) {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  const message = error instanceof Error
    ? error.message
    : error && typeof error === "object" && "message" in error
      ? String(error.message)
      : "";
  if (code === "42501" || /nicht berechtigt/i.test(message)) {
    return "Du darfst die rechtlichen Einstellungen dieses Restaurants nicht öffnen.";
  }
  return "Die rechtlichen Einstellungen konnten nicht geladen werden. Bitte versuche es erneut.";
}
