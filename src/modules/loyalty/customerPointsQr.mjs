const POINTS_CREDIT_QR_TYPE = "wuxuai_points_credit";

export function buildCustomerPointsQrPayload(token) {
  if (typeof token !== "string" || !token.trim()) {
    throw new TypeError("A customer points QR token is required.");
  }

  return JSON.stringify({ type: POINTS_CREDIT_QR_TYPE, token: token.trim() });
}

export function extractCustomerPointsQrReference(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const trimmed = value.trim();

  try {
    const parsed = JSON.parse(trimmed);
    return parsed?.type === POINTS_CREDIT_QR_TYPE
      && typeof parsed.token === "string"
      && parsed.token.trim()
      ? parsed.token.trim()
      : null;
  } catch {
    const manualCode = trimmed.replace(/\s/g, "");
    return /^\d{8}$/.test(manualCode) ? manualCode : null;
  }
}
