export type CustomerSignUpState =
  | "confirmed"
  | "confirmation_required"
  | "existing_or_obfuscated"
  | "failed";

export type CustomerAuthErrorCategory =
  | "rate_limit"
  | "invalid_credentials"
  | "email_unconfirmed"
  | "invalid_email"
  | "weak_password"
  | "network"
  | "server"
  | "unknown";

export function validateCustomerPassword(password: string): { valid: boolean; message: string | null };
export function customerPasswordConfirmationError(password: string, confirmation: string, showError: boolean): string | null;
export function isCustomerPasswordConfirmationValid(password: string, confirmation: string): boolean;
export function classifyCustomerSignUpResult(data: unknown): CustomerSignUpState;
export function classifyCustomerAuthError(error: unknown): CustomerAuthErrorCategory;
export function customerAuthErrorMessage(error: unknown, context?: "signup" | "resend" | "login"): string;
