export type CustomerInstallState = "installed" | "prompt_available" | "manual_ios" | "manual_browser" | "unavailable";
export type CustomerPushState = "granted" | "available" | "denied" | "unavailable";
export type CustomerActivationPresentationState = "open" | "snoozed_until" | "dismissed";
export type CustomerActivationUiState = CustomerActivationPresentationState | "hydrating" | "installed" | "install_prompt_available" | "complete";
export type CustomerActivationPreference = {
  version: 2;
  presentation: "open" | "dismissed";
  snoozedUntil: string | null;
};

export const CUSTOMER_ACTIVATION_STORAGE_PREFIX: string;
export const CUSTOMER_ACTIVATION_PREFERENCE_VERSION: 2;
export const CUSTOMER_ACTIVATION_SNOOZE_MS: number;
export function defaultCustomerActivationPreference(): CustomerActivationPreference;
export function readCustomerActivationPreference(storage: Pick<Storage, "getItem"> | null, userId: string | null): CustomerActivationPreference;
export function writeCustomerActivationPreference(storage: Pick<Storage, "setItem"> | null, userId: string | null, preference: CustomerActivationPreference): boolean;
export function snoozeCustomerActivation(preference: CustomerActivationPreference, now?: Date): CustomerActivationPreference;
export function dismissCustomerActivation(preference: CustomerActivationPreference): CustomerActivationPreference;
export function resetCustomerActivationPreference(): CustomerActivationPreference;
export function customerActivationPresentationState(preference: CustomerActivationPreference, now?: Date): CustomerActivationPresentationState;
export function customerInstallState(input: {
  displayModeStandalone: boolean;
  iosStandalone: boolean;
  promptAvailable: boolean;
  isIos: boolean;
  isEmbeddedBrowser: boolean;
}): CustomerInstallState;
export function customerPushState(input: { available: boolean; permission: NotificationPermission | "unsupported" }): CustomerPushState;
export function customerActivationSummary(input: {
  emailConfirmed: boolean;
  installState: CustomerInstallState;
  pushState: CustomerPushState;
}): {
  complete: boolean;
  incompleteCount: number;
  steps: Record<"email" | "install" | "push", "complete" | "pending" | "not_applicable">;
};
type CustomerActivationUiInput = {
  preferenceReady: boolean;
  setupComplete: boolean;
  installState: CustomerInstallState;
  preference: CustomerActivationPreference;
  now?: Date;
};
export function customerActivationUiState(input: CustomerActivationUiInput): CustomerActivationUiState;
export function shouldShowCustomerActivationBanner(input: CustomerActivationUiInput): boolean;
export function shouldAutoOpenCustomerActivation(input: CustomerActivationUiInput & {
  accountReady: boolean;
  view: "home" | "locations" | "account";
}): boolean;
