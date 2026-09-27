export function hasTotpAuthenticationMethod(methods) {
  return Array.isArray(methods) && methods.some((entry) =>
    typeof entry === "string" ? entry === "totp" : entry?.method === "totp",
  );
}

export function platformAdminMfaMode({ currentLevel, currentAuthenticationMethods, verifiedTotpFactors }) {
  if (currentLevel === "aal2" && hasTotpAuthenticationMethod(currentAuthenticationMethods)) {
    return "authorized";
  }
  return Array.isArray(verifiedTotpFactors) && verifiedTotpFactors.length > 0
    ? "challenge"
    : "enroll";
}

export function isPlatformSessionProofCurrent(checkedAccessToken, currentAccessToken) {
  return Boolean(currentAccessToken && checkedAccessToken === currentAccessToken);
}

export function normalizeTotpCode(value) {
  return String(value ?? "").replace(/\s+/g, "").replace(/[^0-9]/g, "").slice(0, 6);
}

export function latestVerifiedTotpFactor(factors) {
  return [...(factors ?? [])].sort((left, right) => {
    const timeOrder = String(right.updated_at ?? "").localeCompare(String(left.updated_at ?? ""));
    return timeOrder || String(right.id).localeCompare(String(left.id));
  })[0] ?? null;
}

export function verifiedTotpFactors(factors) {
  return [...(factors ?? [])]
    .filter((factor) => factor?.status === "verified")
    .sort((left, right) => {
      const createdOrder = String(left.created_at ?? "").localeCompare(String(right.created_at ?? ""));
      return createdOrder || String(left.id).localeCompare(String(right.id));
    });
}

export function totpFactorLabel(factor, index = 0) {
  const friendlyName = String(factor?.friendly_name ?? "").trim();
  return friendlyName || `Authenticator-Gerät ${index + 1}`;
}

export function nextTotpDeviceName(factors) {
  const names = new Set(verifiedTotpFactors(factors).map((factor) => String(factor.friendly_name ?? "")));
  return names.has("WUXUAI Platform Admin – Gerät 1")
    ? "WUXUAI Platform Admin – Gerät 2"
    : "WUXUAI Platform Admin – Gerät 1";
}

export function canRemoveTotpFactor(factors, targetFactorId, proofFactorId) {
  const ids = new Set(verifiedTotpFactors(factors).map((factor) => factor.id));
  return ids.size >= 2
    && ids.has(targetFactorId)
    && ids.has(proofFactorId)
    && targetFactorId !== proofFactorId;
}
