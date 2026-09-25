type QueueRequest = {
  redemption_id: string;
  expires_at: string;
  requested_at?: string;
};

const priority = (request: QueueRequest) =>
  Date.parse(request.expires_at) || Number.POSITIVE_INFINITY;

/** Keep already visible cards in place; append only genuinely new requests. */
export function stabilizeRedemptionQueue<T extends QueueRequest>(
  previousIds: readonly string[], incoming: readonly T[],
): T[] {
  const byId = new Map<string, T>();
  for (const request of incoming) {
    if (request.redemption_id && !byId.has(request.redemption_id))
      byId.set(request.redemption_id, request);
  }
  const retained = previousIds.filter((id) => byId.has(id));
  const retainedIds = new Set(retained);
  const appended = [...byId.values()].filter((request) => !retainedIds.has(request.redemption_id))
    .sort((a, b) => priority(a) - priority(b)
      || (a.requested_at ?? "").localeCompare(b.requested_at ?? "")
      || a.redemption_id.localeCompare(b.redemption_id));
  return [...retained.map((id) => byId.get(id)!), ...appended];
}

/** If the active card was finalized, the card in its former slot moves up. */
export function nextRedemptionCard(
  activeId: string | null, previousIds: readonly string[], nextIds: readonly string[],
): string | null {
  if (!nextIds.length) return null;
  if (activeId && nextIds.includes(activeId)) return activeId;
  const formerIndex = activeId ? previousIds.indexOf(activeId) : -1;
  return nextIds[Math.min(Math.max(formerIndex, 0), nextIds.length - 1)];
}
