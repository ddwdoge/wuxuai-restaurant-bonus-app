export const consentTypes = [
  "marketing_push",
  "marketing_sms",
  "marketing_email",
  "personalized_recommendations",
  "birthday_processing",
];

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
];

export function termsAreComplete(content) {
  return participationTermFields.every((field) => {
    const value = content?.[field];
    return typeof value === "boolean" ? value : String(value ?? "").trim().length > 0;
  });
}
export function marketingMessageAllowed(category, channel, consents) {
  if (category !== "MARKETING") return true;
  if (channel === "in_app") return true;
  return consents.some((consent) => consent.consent_type === `marketing_${channel}` && consent.status === "granted");
}

export function legalReadiness(profile, terms, privacyText) {
  const imprintComplete = ["company_name", "street", "postal_code", "city", "email", "complaint_contact"]
    .every((field) => String(profile?.[field] ?? "").trim().length > 0);
  return {
    imprintComplete,
    termsComplete: termsAreComplete(terms),
    privacyComplete: String(privacyText ?? "").trim().length >= 120,
  };
}

export function canPubliclyActivate(readiness) {
  return Boolean(readiness?.operational_ready && readiness?.legal_ready && readiness?.security_ready);
}

export function csvCell(value) {
  const text = value == null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export function accountingRowsToCsv(rows) {
  const columns = [
    "restaurant_id", "reward_id", "reward_name", "reward_category", "regular_sales_price",
    "points_consumed", "redeemed_at", "staff_confirmation", "redemption_code",
    "receipt_reference", "tax_category", "status", "reversal_reference", "audit_event_id",
  ];
  return [columns.join(";"), ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(";"))].join("\n");
}
