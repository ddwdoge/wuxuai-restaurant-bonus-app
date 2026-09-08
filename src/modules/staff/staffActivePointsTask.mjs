export const ACTIVE_POINTS_TASK_MAX_AGE_MS = 5 * 60 * 1000;

export function createActivePointsTaskContext({ actorId, restaurantId, roleContext, now = Date.now() }) {
  return Object.freeze({
    actorId,
    restaurantId,
    roleContext,
    scannedAt: now,
    expiresAt: null,
  });
}

export function withActivePointsTaskExpiry(context, expiresAt) {
  return Object.freeze({ ...context, expiresAt: expiresAt || null });
}

export function activePointsTaskExpiryMs(context) {
  if (!context) return null;
  const authoritativeExpiry = context.expiresAt ? Date.parse(context.expiresAt) : Number.NaN;
  return Number.isFinite(authoritativeExpiry)
    ? authoritativeExpiry
    : context.scannedAt + ACTIVE_POINTS_TASK_MAX_AGE_MS;
}

export function isActivePointsTaskExpired(context, now = Date.now()) {
  const expiry = activePointsTaskExpiryMs(context);
  return expiry === null || now >= expiry;
}

export function isActivePointsTaskContextValid(context, { actorId, restaurantId, roleContext }) {
  return Boolean(
    context
    && actorId
    && restaurantId
    && context.actorId === actorId
    && context.restaurantId === restaurantId
    && context.roleContext === roleContext,
  );
}

export function activePointsTaskStage({ hasPreview, amountCents, pinRequired }) {
  if (pinRequired) return "pin";
  if (hasPreview) return "preview";
  if (amountCents > 0) return "amount";
  return "recognized";
}
