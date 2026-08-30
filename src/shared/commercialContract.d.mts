export type CommercialAddOn = {
  key: string;
  name: string;
  enabled: boolean;
};

export const V1_COMMERCIAL_CONTRACT: Readonly<{
  planKey: "wuxuai_bonus_v1";
  productName: "WUXUAI Bonus V1";
  trial: Readonly<{ calendarMonths: 3 }>;
  basePlan: Readonly<{
    monthlyPrice: 59;
    currency: "EUR";
    vat: "exclusive";
    billingInterval: "monthly";
  }>;
  addOns: readonly CommercialAddOn[];
  automaticBillingActive: false;
  stripeStatus: "deferred";
}>;

export const V1_COMMERCIAL_COPY: Readonly<{
  trial: "3 Monate kostenlos";
  registrationCta: "3 Monate kostenlos starten";
  price: "Danach 59 € pro Monat exkl. USt.";
  noPaymentMethod: "Kein Zahlungsmittel erforderlich.";
}>;

export function addV1TrialMonthsIso(value: string | null | undefined): string | null;
