export type ActivePointsTaskContext = Readonly<{
  actorId: string;
  restaurantId: string;
  roleContext: string;
  scannedAt: number;
  expiresAt: string | null;
}>;

export type ActivePointsTaskStage = "recognized" | "amount" | "preview" | "pin";

export const ACTIVE_POINTS_TASK_MAX_AGE_MS: number;

export function createActivePointsTaskContext(input: {
  actorId: string;
  restaurantId: string;
  roleContext: string;
  now?: number;
}): ActivePointsTaskContext;

export function withActivePointsTaskExpiry(
  context: ActivePointsTaskContext,
  expiresAt: string | null | undefined,
): ActivePointsTaskContext;

export function activePointsTaskExpiryMs(context: ActivePointsTaskContext | null): number | null;
export function isActivePointsTaskExpired(context: ActivePointsTaskContext | null, now?: number): boolean;
export function isActivePointsTaskContextValid(
  context: ActivePointsTaskContext | null,
  input: {
    actorId: string | null | undefined;
    restaurantId: string | null | undefined;
    roleContext: string | null | undefined;
  },
): boolean;
export function activePointsTaskStage(input: {
  hasPreview: boolean;
  amountCents: number;
  pinRequired: boolean;
}): ActivePointsTaskStage;
