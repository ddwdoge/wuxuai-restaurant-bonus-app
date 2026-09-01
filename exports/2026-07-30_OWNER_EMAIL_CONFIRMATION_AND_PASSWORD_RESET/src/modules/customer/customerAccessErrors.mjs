export const CUSTOMER_ACCESS_FAILURE_REASONS = Object.freeze({
  invalid: "CUSTOMER_ACCESS_TOKEN_INVALID",
  revoked: "CUSTOMER_ACCESS_TOKEN_REVOKED",
  inactiveMembership: "CUSTOMER_MEMBERSHIP_INACTIVE",
});

const permanentReasons = new Set(Object.values(CUSTOMER_ACCESS_FAILURE_REASONS));

function errorText(error) {
  if (!error || typeof error !== "object") return "";
  return [error.reason, error.code, error.message, error.details, error.hint]
    .filter((value) => typeof value === "string")
    .join(" ")
    .toLowerCase();
}

export function customerAccessFailureReason(error) {
  const text = errorText(error);
  if (!text) return null;

  if (text.includes(CUSTOMER_ACCESS_FAILURE_REASONS.inactiveMembership.toLowerCase())) {
    return CUSTOMER_ACCESS_FAILURE_REASONS.inactiveMembership;
  }
  if (text.includes(CUSTOMER_ACCESS_FAILURE_REASONS.revoked.toLowerCase())) {
    return CUSTOMER_ACCESS_FAILURE_REASONS.revoked;
  }
  if (
    text.includes(CUSTOMER_ACCESS_FAILURE_REASONS.invalid.toLowerCase())
    || text.includes("customer token not valid")
    || text.includes("kundenzugang ist nicht gültig")
  ) {
    return CUSTOMER_ACCESS_FAILURE_REASONS.invalid;
  }
  return null;
}

export function isPermanentCustomerAccessError(error) {
  const reason = customerAccessFailureReason(error);
  return reason !== null && permanentReasons.has(reason);
}

export class CustomerAccessError extends Error {
  constructor(reason, message) {
    super(message);
    this.name = "CustomerAccessError";
    this.reason = reason;
  }
}
