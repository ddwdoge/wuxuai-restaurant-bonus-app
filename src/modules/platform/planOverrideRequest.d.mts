export type PlanOverrideInput = {
  restaurantId: string; action: 'activate' | 'end'; reason: string; confirmation: string;
  startsAt?: string; expiresAt?: string; overrideId?: string;
};
export type PlanOverrideRequest = Omit<PlanOverrideInput, 'startsAt' | 'expiresAt'> & {
  startsAt: string | null; expiresAt: string | null; fingerprint: string; idempotencyKey: string;
};
export function preparePlanOverrideRequest(input: PlanOverrideInput, previous?: PlanOverrideRequest | null, now?: number, newId?: () => string): PlanOverrideRequest;
