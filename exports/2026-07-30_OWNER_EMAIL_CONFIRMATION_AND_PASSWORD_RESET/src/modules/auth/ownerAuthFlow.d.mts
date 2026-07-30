export const OWNER_AUTH_PATHS: Readonly<{
  callback: "/auth/callback";
  confirmEmail: "/auth/confirm-email";
  forgotPassword: "/auth/forgot-password";
  updatePassword: "/auth/update-password";
}>;

export type PasswordValidation = { valid: boolean; message: string | null };
export type OwnerAuthErrorCategory =
  | "rate_limit"
  | "email_unconfirmed"
  | "weak_password"
  | "invalid_credentials"
  | "expired_link"
  | "server"
  | "network"
  | "unknown";

export function buildOwnerAuthRedirect(origin: string, path: string): string;
export function isOwnerEmailConfirmed(user: { email_confirmed_at?: string | null } | null | undefined): boolean;
export function validateOwnerPassword(password: string, confirmation?: string): PasswordValidation;
export function classifyOwnerAuthError(error: unknown): OwnerAuthErrorCategory;
export function ownerAuthErrorMessage(error: unknown, context?: "general" | "recovery"): string;
export function hasRecoveryIntent(locationLike: { search?: string; hash?: string } | null | undefined): boolean;
export function hasAuthCallbackPayload(locationLike: { search?: string; hash?: string } | null | undefined): boolean;
