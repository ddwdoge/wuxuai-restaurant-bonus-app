export function createTestOnlyKybReauthContinuation(input: {
  restaurantId: string;
  identityId: string;
  now?: number;
}): string;
export function matchesTestOnlyKybReauthContinuation(
  raw: string | null | undefined,
  input: { restaurantId: string; identityId: string; now?: number },
): boolean;
export function readTestOnlyKybReauthContinuation(storage: Storage | null | undefined): string | null;
export function writeTestOnlyKybReauthContinuation(storage: Storage | null | undefined, value: string): void;
export function clearTestOnlyKybReauthContinuation(storage: Storage | null | undefined): void;
