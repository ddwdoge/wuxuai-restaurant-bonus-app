export function preparePlanOverrideRequest(input, previous, now = Date.now(), newId = () => globalThis.crypto.randomUUID()) {
  if (!input.restaurantId || !['activate', 'end'].includes(input.action)) throw new Error('invalid');
  if (input.reason.trim().length < 10) throw new Error('reason');
  if (input.confirmation !== 'CONFIRMED') throw new Error('confirmation');
  if (input.action === 'end' && !input.overrideId) throw new Error('target');
  const startsAt = input.startsAt ? new Date(input.startsAt).getTime() : null;
  const expiresAt = input.expiresAt ? new Date(input.expiresAt).getTime() : null;
  if (input.action === 'activate') {
    if (expiresAt === null || !Number.isFinite(expiresAt)) throw new Error('expiry');
    if (startsAt !== null && !Number.isFinite(startsAt)) throw new Error('start');
  }
  const intent = {
    restaurantId: input.restaurantId, action: input.action, reason: input.reason.trim(),
    confirmation: input.confirmation,
    ...(input.action === 'end' ? { overrideId: input.overrideId } : {}),
    startsAt: input.action === 'activate' && startsAt !== null ? new Date(startsAt).toISOString() : null,
    expiresAt: input.action === 'activate' ? new Date(expiresAt).toISOString() : null,
  };
  const fingerprint = JSON.stringify(intent);
  if (previous?.fingerprint === fingerprint) return previous;
  if (input.action === 'activate') {
    if (expiresAt <= now) throw new Error('expiry');
    if (startsAt !== null && (startsAt < now || startsAt >= expiresAt)) throw new Error('start');
  }
  return { ...intent, fingerprint, idempotencyKey: newId() };
}
