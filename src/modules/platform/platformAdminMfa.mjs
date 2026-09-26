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
