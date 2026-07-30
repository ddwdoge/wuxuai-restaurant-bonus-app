export type CustomerAccessFailureReason =
  | "CUSTOMER_ACCESS_TOKEN_INVALID"
  | "CUSTOMER_ACCESS_TOKEN_REVOKED"
  | "CUSTOMER_MEMBERSHIP_INACTIVE";

export const CUSTOMER_ACCESS_FAILURE_REASONS: Readonly<{
  invalid: "CUSTOMER_ACCESS_TOKEN_INVALID";
  revoked: "CUSTOMER_ACCESS_TOKEN_REVOKED";
  inactiveMembership: "CUSTOMER_MEMBERSHIP_INACTIVE";
}>;

export function customerAccessFailureReason(error: unknown): CustomerAccessFailureReason | null;
export function isPermanentCustomerAccessError(error: unknown): boolean;

export class CustomerAccessError extends Error {
  readonly reason: CustomerAccessFailureReason;
  constructor(reason: CustomerAccessFailureReason, message: string);
}
