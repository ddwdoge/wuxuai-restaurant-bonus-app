export const HIGH_SINGLE_AMOUNT_RATIO = 0.8;

export function isHighSingleAmount(amountCents, configuredMaximumCents) {
  const amount = Number(amountCents);
  const maximum = Number(configuredMaximumCents);
  if (!Number.isFinite(amount) || !Number.isFinite(maximum) || maximum < 1) return false;
  return amount >= Math.floor(maximum * HIGH_SINGLE_AMOUNT_RATIO);
}

export function pointAnomalyActorKind(actorType) {
  if (actorType === "admin") return "owner";
  if (actorType === "staff") return "staff";
  return null;
}

export function pointAnomalyNoticeKey(auditId) {
  return `point_anomaly_${auditId}`;
}

export function pointTransactionReference(transactionId) {
  return String(transactionId ?? "").replaceAll("-", "").slice(-8).toUpperCase();
}
