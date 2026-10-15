export function createTestOnlyBasicReauthContinuation(input: {
  restaurantId: string;
  identityId: string;
  continuationId?: string;
  now?: number;
}): string;

export function matchesTestOnlyBasicReauthContinuation(raw: string | null, input: {
  restaurantId: string;
  identityId: string;
  now?: number;
}): boolean;

export function writeTestOnlyBasicReauthContinuation(storage: Storage | null | undefined, value: string): void;
export function readTestOnlyBasicReauthContinuation(storage: Storage | null | undefined): string | null;
export function consumeTestOnlyBasicReauthContinuation(
  storage: Storage | null | undefined,
  expectedValue?: string,
): string | null;
export function clearTestOnlyBasicReauthContinuation(storage: Storage | null | undefined): void;
