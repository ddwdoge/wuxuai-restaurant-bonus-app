// One invocation handles at most one confirmation request. A claimed request
// may be retried before begin; after begin, an uncertain provider result is
// terminal until a customer explicitly makes a new request.
export async function runOfferEmailConfirmationDelivery({ claim, prepare, begin, deliver, complete }) {
  const delivery = await claim();
  if (!delivery?.claimed) return { claimed: 0, handed_over: 0 };
  const payload = prepare(delivery);
  if (!await begin(delivery)) {
    return { claimed: 1, handed_over: 0, reason: "final_recheck_blocked" };
  }
  try {
    const accepted = await deliver(payload, delivery);
    const completed = await complete(delivery, accepted);
    if (!completed) {
      return { claimed: 1, handed_over: accepted ? 1 : 0, uncertain: true };
    }
    return { claimed: 1, handed_over: accepted ? 1 : 0, uncertain: !accepted };
  } catch {
    // A provider may have accepted the message before the error or timeout.
    // No automatic retry follows this boundary, even if completion fails.
    try { await complete(delivery, false); } catch { /* remains SUBMITTING */ }
    return { claimed: 1, handed_over: 0, uncertain: true };
  }
}
