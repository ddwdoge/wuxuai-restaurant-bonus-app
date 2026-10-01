const textOf = (failure) => [failure?.code, failure?.message, failure?.details, failure?.hint]
  .filter(Boolean)
  .join(" ")
  .toLowerCase();

export function classifyStaffPointsFailure(failure) {
  const text = textOf(failure);
  const status = Number(failure?.status ?? failure?.statusCode ?? 0);

  if (status === 401 || /jwt.*(expired|invalid)|no active session|pgrst30[12]/.test(text)) {
    return { category: "session_expired", safeCode: "STAFF_POINTS_SESSION_EXPIRED" };
  }
  if (/tages-pin|daily[_ -]?pin|too many.*attempt|zu viele falsche versuche/.test(text)) {
    return { category: "daily_pin", safeCode: "STAFF_POINTS_DAILY_PIN_REJECTED" };
  }
  if (/customer|gast|membership|mitgliedschaft/.test(text) && /(invalid|ungültig|not found|nicht gefunden|inactive|inaktiv)/.test(text)) {
    return { category: "customer_membership", safeCode: "STAFF_POINTS_CUSTOMER_REJECTED" };
  }
  if (/amount|betrag/.test(text) && /(invalid|ungültig|limit|range|zulässig)/.test(text)) {
    return { category: "amount_invalid", safeCode: "STAFF_POINTS_AMOUNT_REJECTED" };
  }
  if (/23505|duplicate|idempot|already.*(recorded|completed)|gerade schon erfasst/.test(text)) {
    return { category: "duplicate", safeCode: "STAFF_POINTS_DUPLICATE" };
  }
  if (/notification|inbox|benachrichtigung/.test(text)) {
    return { category: "notification_sidepath", safeCode: "STAFF_POINTS_NOTIFICATION_SIDE_PATH" };
  }
  if (status === 403 || /42501|staff_action_access_denied|not authorized|permission denied|keinen.*zugang/.test(text)) {
    return { category: "staff_unauthorized", safeCode: "STAFF_POINTS_STAFF_UNAUTHORIZED" };
  }
  if (/failed to fetch|network|load failed|connection|timeout|econn/.test(text)) {
    return { category: "transport", safeCode: "STAFF_POINTS_TRANSPORT_UNAVAILABLE" };
  }
  if (/points_collection_failed|points.*(blocked|rejected)|post_trial.*blocked|restaurant_not_operational/.test(text)) {
    return { category: "booking_rejected", safeCode: "STAFF_POINTS_BOOKING_REJECTED" };
  }
  return { category: "unknown", safeCode: "STAFF_POINTS_UNKNOWN" };
}
