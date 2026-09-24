// Phase 7C.6C3A: local architecture only. No provider activation or payment call.
const RETURN_ROUTES = new Set(["/admin/settings/tarif-kapazitaet"]);
const PLAN_KEYS = new Set(["BASIC", "PRO"]);
const KNOWN_EVENTS = new Set([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseCheckoutRequest(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("CHECKOUT_REQUEST_INVALID");
  const keys = Object.keys(input).sort();
  if (keys.join(",") !== "plan_key,request_id,return_route") throw new Error("CHECKOUT_REQUEST_FIELDS_INVALID");
  if (!PLAN_KEYS.has(input.plan_key)) throw new Error("CHECKOUT_PLAN_INVALID");
  if (typeof input.request_id !== "string" || !UUID.test(input.request_id)) throw new Error("CHECKOUT_REQUEST_ID_INVALID");
  if (!RETURN_ROUTES.has(input.return_route)) throw new Error("CHECKOUT_RETURN_ROUTE_INVALID");
  return { plan_key: input.plan_key, request_id: input.request_id.toLowerCase(), return_route: input.return_route };
}

export async function orchestrateBlockedCheckout(input, resolveBlockedDecision) {
  const parsed = parseCheckoutRequest(input);
  const { data, error } = await resolveBlockedDecision(parsed);
  if (error) {
    if (error.code === "23505") throw new Error("CHECKOUT_REQUEST_PAYLOAD_CONFLICT");
    if (error.code === "42501") throw new Error("CHECKOUT_OWNER_REQUIRED");
    throw new Error("CHECKOUT_BLOCKED");
  }
  if (!data || data.status !== "BLOCKED" || !Array.isArray(data.blockers) || data.blockers.length === 0) {
    throw new Error("CHECKOUT_UNSAFE_DECISION");
  }
  return data;
}

export function addCalendarMonthUtc(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("TRIAL_TIME_INVALID");
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const lastDay = new Date(Date.UTC(year, month + 2, 0)).getUTCDate();
  const result = new Date(Date.UTC(year, month + 1, Math.min(date.getUTCDate(), lastDay),
    date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds(), date.getUTCMilliseconds()));
  return result.toISOString();
}

function bytesToHex(bytes) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(bytes) {
  return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)));
}

export async function checkoutIdempotencyKey(restaurantId, requestId) {
  if (typeof restaurantId !== "string" || !UUID.test(restaurantId)
    || typeof requestId !== "string" || !UUID.test(requestId)) throw new Error("CHECKOUT_IDEMPOTENCY_INPUT_INVALID");
  const digest = await sha256Hex(new TextEncoder().encode(
    `wuxuai:test:checkout:${restaurantId.toLowerCase()}:${requestId.toLowerCase()}`));
  return `wuxuai_test_checkout_${digest}`;
}

async function hmacHex(secret, bytes) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return bytesToHex(new Uint8Array(await crypto.subtle.sign("HMAC", key, bytes)));
}

function equalHex(left, right) {
  if (!/^[0-9a-f]{64}$/i.test(left) || !/^[0-9a-f]{64}$/i.test(right)) return false;
  let difference = 0;
  for (let index = 0; index < 64; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

export async function signFakeWebhook(rawBytes, secret, timestampSeconds) {
  if (!Number.isInteger(timestampSeconds) || !secret) throw new Error("WEBHOOK_SIGNING_INPUT_INVALID");
  const prefix = new TextEncoder().encode(`${timestampSeconds}.`);
  const signed = new Uint8Array(prefix.length + rawBytes.length);
  signed.set(prefix);
  signed.set(rawBytes, prefix.length);
  return `t=${timestampSeconds},v1=${await hmacHex(secret, signed)}`;
}

export async function verifyRawWebhook(rawBytes, signatureHeader, secret, nowSeconds, toleranceSeconds = 300) {
  if (!(rawBytes instanceof Uint8Array) || !secret || !Number.isInteger(nowSeconds)
    || typeof signatureHeader !== "string") return false;
  const parts = signatureHeader.split(",");
  const timestamp = parts.find((part) => part.startsWith("t="))?.slice(2);
  const signatures = parts.filter((part) => part.startsWith("v1=")).map((part) => part.slice(3));
  if (!/^[0-9]{1,12}$/.test(timestamp ?? "") || Math.abs(nowSeconds - Number(timestamp)) > toleranceSeconds
    || signatures.length === 0) return false;
  const expected = (await signFakeWebhook(rawBytes, secret, Number(timestamp))).split("v1=")[1];
  return signatures.some((signature) => equalHex(signature, expected));
}

export function parseTechnicalEvent(input, expectedAccount) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("WEBHOOK_EVENT_INVALID");
  if (typeof input.id !== "string" || !/^evt_[A-Za-z0-9_]{8,120}$/.test(input.id)) throw new Error("WEBHOOK_EVENT_ID_INVALID");
  if (input.livemode !== false || input.account !== expectedAccount || expectedAccount !== "LOCAL_FAKE_ACCOUNT") {
    throw new Error("WEBHOOK_ENVIRONMENT_INVALID");
  }
  if (typeof input.type !== "string" || input.type.length > 100) throw new Error("WEBHOOK_EVENT_TYPE_INVALID");
  if (!Number.isSafeInteger(input.created) || input.created <= 0) throw new Error("WEBHOOK_EVENT_TIME_INVALID");
  const object = input.data?.object;
  if (!object || typeof object !== "object" || Array.isArray(object)) throw new Error("WEBHOOK_OBJECT_INVALID");
  const subscriptionId = input.type.startsWith("customer.subscription.") ? object.id
    : (input.type === "checkout.session.completed" ? object.subscription : object.subscription);
  if (subscriptionId != null && (typeof subscriptionId !== "string" || !/^sub_[A-Za-z0-9_]{8,120}$/.test(subscriptionId))) {
    throw new Error("WEBHOOK_SUBSCRIPTION_ID_INVALID");
  }
  const tenantRef = object.metadata?.restaurant_id ?? null;
  if (tenantRef != null && (typeof tenantRef !== "string" || !UUID.test(tenantRef))) {
    throw new Error("WEBHOOK_TENANT_REF_INVALID");
  }
  return {
    event_id: input.id,
    event_type: input.type,
    event_created_at: new Date(input.created * 1000).toISOString(),
    provider_subscription_id: subscriptionId ?? null,
    tenant_ref: tenantRef,
    known_event: KNOWN_EVENTS.has(input.type),
  };
}

// A deterministic provider contract, isolated from the business orchestrator.
export function createFakeStripeAdapter() {
  const accepted = new Map();
  let callCount = 0;
  let acceptedCount = 0;
  return {
    get callCount() { return callCount; },
    get acceptedCount() { return acceptedCount; },
    async createCheckout(input, scenario = "success") {
      callCount += 1;
      if (scenario === "error" || scenario === "timeout_before") throw new Error(`FAKE_${scenario.toUpperCase()}`);
      if (!input || !input.idempotencyKey || !input.priceId || !PLAN_KEYS.has(input.planKey)) {
        throw new Error("FAKE_PROVIDER_INPUT_INVALID");
      }
      const payload = JSON.stringify({ priceId: input.priceId, planKey: input.planKey, returnRoute: input.returnRoute });
      const existing = accepted.get(input.idempotencyKey);
      if (existing && existing.payload !== payload) throw new Error("FAKE_PROVIDER_PAYLOAD_CONFLICT");
      if (!existing) {
        const promise = sha256Hex(new TextEncoder().encode(input.idempotencyKey)).then((digest) => ({
          sessionId: `cs_test_${digest.slice(0, 24)}`,
          url: `https://fake.invalid/checkout/${digest.slice(0, 24)}`,
        }));
        accepted.set(input.idempotencyKey, { payload, promise });
        acceptedCount += 1;
      }
      const result = await accepted.get(input.idempotencyKey).promise;
      if (scenario === "timeout_after") throw new Error("FAKE_TIMEOUT_AFTER_ACCEPTANCE");
      return result;
    },
  };
}
