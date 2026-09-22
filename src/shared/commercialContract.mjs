export const V1_COMMERCIAL_CONTRACT = Object.freeze({
  planKey: "wuxuai_bonus_v1",
  productName: "WUXUAI Bonus V1",
  trial: Object.freeze({ calendarMonths: 1 }),
  basePlan: Object.freeze({
    monthlyPrice: 59,
    currency: "EUR",
    vat: "exclusive",
    billingInterval: "monthly",
  }),
  addOns: Object.freeze([]),
  automaticBillingActive: false,
  stripeStatus: "deferred",
});

export const V1_COMMERCIAL_COPY = Object.freeze({
  trial: "Erster Kalendermonat nach bestätigter Provideraktivierung kostenlos; Add-ons ausgenommen",
  registrationCta: "Bonusprogramm vorbereiten",
  price: "Danach 59 € pro Monat exkl. USt.",
  noPaymentMethod: "Kein Zahlungsmittel erforderlich.",
});

export function addV1TrialMonthsIso(value) {
  const base = value ? new Date(value) : new Date();
  if (Number.isNaN(base.getTime())) return null;

  const originalDay = base.getUTCDate();
  base.setUTCDate(1);
  // Legacy display fallback only. Never recalculate an existing trial under
  // the new provider policy or authorize a new trial from browser time.
  base.setUTCMonth(base.getUTCMonth() + 3);
  const lastDayOfTargetMonth = new Date(Date.UTC(
    base.getUTCFullYear(),
    base.getUTCMonth() + 1,
    0,
  )).getUTCDate();
  base.setUTCDate(Math.min(originalDay, lastDayOfTargetMonth));
  return base.toISOString();
}
