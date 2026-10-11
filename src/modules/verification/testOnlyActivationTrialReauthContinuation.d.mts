export function createTestOnlyActivationTrialReauthContinuation(input: {
  restaurantId: string;
  identityId: string;
  now?: number;
}): string;
export function matchesTestOnlyActivationTrialReauthContinuation(
  raw: string | null | undefined,
  input: { restaurantId: string; identityId: string; now?: number },
): boolean;
export function readTestOnlyActivationTrialReauthContinuation(storage: Storage | null | undefined): string | null;
export function writeTestOnlyActivationTrialReauthContinuation(storage: Storage | null | undefined, value: string): void;
export function clearTestOnlyActivationTrialReauthContinuation(storage: Storage | null | undefined): void;
