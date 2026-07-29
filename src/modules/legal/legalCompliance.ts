export const consentTypes = [
  "marketing_push",
  "marketing_sms",
  "marketing_email",
  "personalized_recommendations",
  "birthday_processing",
] as const;

export type ConsentType = (typeof consentTypes)[number];

export const participationTermFields = [
  "program_operator_name",
  "program_operator_address",
  "contact_email",
  "points_earning_rule",
  "daily_booking_limit",
  "excluded_transactions",
  "points_validity_months",
  "reward_validity_rule",
  "redemption_conditions",
  "cash_payout_prohibited",
  "transfer_prohibited",
  "cancellation_rule",
  "fraud_and_blocking_rule",
  "program_termination_rule",
  "final_redemption_period",
  "complaint_contact",
  "effective_date",
  "language",
  "version",
] as const;

export type ParticipationTermField = (typeof participationTermFields)[number];
export type ParticipationTerms = Partial<Record<ParticipationTermField, unknown>>;

export type ConsentState = {
  consent_type: string;
  status: string;
};

export type LegalReadinessInput = {
  operational_ready?: boolean;
  legal_ready?: boolean;
  security_ready?: boolean;
};

export type LegalReadinessResult = {
  imprintComplete: boolean;
  termsComplete: boolean;
  privacyComplete: boolean;
};

export function termsAreComplete(content: ParticipationTerms | null | undefined): boolean {
  return participationTermFields.every((field) => {
    const value = content?.[field];
    return typeof value === "boolean" ? value : String(value ?? "").trim().length > 0;
  });
}

export function marketingMessageAllowed(category: string, channel: string, consents: readonly ConsentState[]): boolean {
  if (category !== "MARKETING") return true;
  if (channel === "in_app") return true;
  return consents.some((consent) => consent.consent_type === `marketing_${channel}` && consent.status === "granted");
}

export function legalReadiness(
  profile: Record<string, unknown> | null | undefined,
  terms: ParticipationTerms | null | undefined,
  privacyText: string,
): LegalReadinessResult {
  const imprintComplete = ["company_name", "legal_form", "street", "postal_code", "city", "country", "email"]
    .every((field) => String(profile?.[field] ?? "").trim().length > 0)
    && String(profile?.complaint_contact ?? profile?.email ?? "").trim().length > 0;
  return {
    imprintComplete,
    termsComplete: termsAreComplete(terms),
    privacyComplete: String(privacyText ?? "").trim().length >= 120,
  };
}

export function canPubliclyActivate(readiness: LegalReadinessInput | null | undefined): boolean {
  return Boolean(readiness?.operational_ready && readiness.legal_ready && readiness.security_ready);
}

export function csvCell(value: unknown): string {
  const text = value == null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

const accountingColumns = [
  "restaurant_id", "reward_id", "reward_name", "reward_category", "regular_sales_price",
  "points_consumed", "redeemed_at", "staff_confirmation", "redemption_code",
  "receipt_reference", "tax_category", "status", "reversal_reference", "audit_event_id",
] as const;

export function accountingRowsToCsv(rows: ReadonlyArray<Record<string, unknown>>): string {
  return [
    accountingColumns.join(";"),
    ...rows.map((row) => accountingColumns.map((column) => csvCell(row[column])).join(";")),
  ].join("\n");
}
