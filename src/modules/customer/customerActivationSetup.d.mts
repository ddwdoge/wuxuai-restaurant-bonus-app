export type CustomerInstallState = "installed" | "prompt_available" | "manual_ios" | "manual_browser" | "unavailable";
export type CustomerPushState = "granted" | "available" | "denied" | "unavailable";
export type CustomerActivationPreference = {
  autoReminderEnabled: boolean;
  firstLoginDrawerSeen: boolean;
  lastSnoozedAt: string | null;
};

export const CUSTOMER_ACTIVATION_STORAGE_PREFIX: string;
export function defaultCustomerActivationPreference(): CustomerActivationPreference;
export function readCustomerActivationPreference(storage: Pick<Storage, "getItem"> | null, userId: string | null): CustomerActivationPreference;
export function writeCustomerActivationPreference(storage: Pick<Storage, "setItem"> | null, userId: string | null, preference: CustomerActivationPreference): boolean;
export function customerInstallState(input: {
  displayModeStandalone: boolean;
  iosStandalone: boolean;
  promptAvailable: boolean;
  isIos: boolean;
  isAndroid: boolean;
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
export function shouldAutoOpenCustomerActivation(input: {
  accountReady: boolean;
  view: "home" | "locations" | "account";
  setupComplete: boolean;
  preference: CustomerActivationPreference;
}): boolean;
