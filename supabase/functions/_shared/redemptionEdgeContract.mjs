// A narrow, fail-closed envelope. Actor, tenant and branch are never sourced
// from caller-controlled JSON; the database resolves them for the verified UID.
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const slug = /^[a-z0-9](?:[a-z0-9-]{0,158}[a-z0-9])?$/;

const shapes = Object.freeze({
  start: ["action", "restaurant_slug", "source_type", "entitlement_id", "request_id", "correlation_id", "idempotency_key"],
  verify_pin: ["action", "redemption_id", "pin", "request_id", "correlation_id", "idempotency_key"],
  swipe: ["action", "redemption_id", "request_id", "correlation_id", "idempotency_key"],
  approve: ["action", "redemption_id", "request_id", "correlation_id", "idempotency_key"],
  reject: ["action", "redemption_id", "request_id", "correlation_id", "idempotency_key"],
  cancel: ["action", "redemption_id", "request_id", "correlation_id", "idempotency_key"],
  rotate_pin: ["action", "restaurant_slug", "request_id", "correlation_id", "idempotency_key"],
});

export function parseRedemptionMutation(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("REDEMPTION_REQUEST_INVALID");
  const expected = shapes[value.action];
  if (!expected || Object.keys(value).some((key) => !expected.includes(key)) || expected.some((key) => !(key in value))) {
    throw new Error("REDEMPTION_REQUEST_INVALID");
  }
  for (const key of ["request_id", "correlation_id", "idempotency_key", "redemption_id", "entitlement_id"]) {
    if (key in value && (typeof value[key] !== "string" || !uuid.test(value[key]))) {
      throw new Error("REDEMPTION_REQUEST_INVALID");
    }
  }
  if ("restaurant_slug" in value && (typeof value.restaurant_slug !== "string" || !slug.test(value.restaurant_slug))) {
    throw new Error("REDEMPTION_REQUEST_INVALID");
  }
  if ("source_type" in value && !["points", "gift"].includes(value.source_type)) {
    throw new Error("REDEMPTION_REQUEST_INVALID");
  }
  if ("pin" in value && (typeof value.pin !== "string" || !/^\d{6}$/.test(value.pin))) {
    throw new Error("REDEMPTION_REQUEST_INVALID");
  }
  return value;
}

export function allowedRedemptionOrigin(requestedOrigin, mode, localOrigin, stagingProjectRef) {
  if (mode === "local_only" && /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(localOrigin)
    && requestedOrigin === localOrigin) return localOrigin;
  if (mode === "staging" && stagingProjectRef === "bwhvfjuwixgwduoeqaya"
    && requestedOrigin === "https://staging-app.bonus.wuxuaisbi.com") return requestedOrigin;
  return null;
}

export function allowedRedemptionPreflight(method, requestedHeaders) {
  const headers = requestedHeaders.split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
  return method === "POST" && headers.every((value) =>
    ["authorization", "apikey", "content-type", "x-client-info"].includes(value));
}
