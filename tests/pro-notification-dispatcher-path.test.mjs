import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

function loadDispatcher(state, envOverrides = {}) {
  let handler;
  const source = readFileSync(new URL(
    "../supabase/functions/transactional-mail-dispatcher/index.ts",
    import.meta.url,
  ), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;

  const client = {
    rpc: async (name, input) => {
      (state.events ??= []).push(name);
      state.rpcCalls.push({ name, input });
      if (name === "reserve_customer_transactional_emails") {
        return { data: [state.delivery], error: null };
      }
      if (name === "reserve_capacity_warning_emails") return { data: [], error: null };
      if (name === "authorize_customer_transactional_email_delivery") {
        return state.authorizationError
          ? { data: null, error: { code: "LOCAL_AUTHORIZATION_ERROR" } }
          : { data: [state.authorization], error: null };
      }
      if (name === "complete_customer_transactional_email") {
        state.completions.push(input);
        return { data: null, error: null };
      }
      throw new Error(`unexpected RPC ${name}`);
    },
    from: () => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        is: () => chain,
        limit: async () => {
          if (state.withdrawOnRecipientLookup) {
            state.authorization = { authorized: false, reason_code: "OFFER_EMAIL_CONSENT_INACTIVE" };
          }
          return { data: [{ auth_user_id: null, first_name: "Synthetic" }], error: null };
        },
      };
      return chain;
    },
    auth: { admin: { getUserById: async () => ({ data: { user: null }, error: null }) } },
  };
  const transporter = {
    sendMail: async () => {
      (state.events ??= []).push("provider");
      state.providerCalls += 1;
      return { messageId: "local-provider-message" };
    },
  };
  const env = {
    SUPABASE_URL: "http://127.0.0.1:56121",
    SUPABASE_SERVICE_ROLE_KEY: "local-service-role-fixture",
    TRANSACTIONAL_MAIL_SCHEDULER_SECRET: "local-scheduler-fixture",
    // General dispatch regression is an in-memory transport test, not Staging.
    APP_BASE_URL: "https://app.bonus.wuxuaisbi.com",
    TRANSACTIONAL_MAIL_MODE: "general",
    SMTP_HOST: "smtp.example.invalid",
    SMTP_PORT: "587",
    SMTP_USERNAME: "local-user",
    SMTP_PASSWORD: "local-password",
    SMTP_FROM_EMAIL: "notifications@example.invalid",
    SMTP_REPLY_TO: "support@example.invalid",
    ...envOverrides,
  };
  const silentConsole = { info() {}, error() {}, log() {} };
  const context = {
    exports: {},
    require(name) {
      if (name.includes("supabase-js")) return { createClient: () => { state.clients = (state.clients ?? 0) + 1; return client; } };
      if (name.includes("nodemailer")) return { __esModule: true, default: { createTransport: () => { state.transports = (state.transports ?? 0) + 1; return transporter; } } };
      if (name.includes("appOrigin")) return { configuredAppOrigin: (value) => value };
      if (name.includes("transactionalMailTemplates")) return {
        renderOwnerCapacityWarningMail: () => ({ subject: "capacity", text: "capacity", html: "capacity" }),
        renderSyntheticCapacityTestMail: () => ({ subject: "synthetic", text: "synthetic", html: "synthetic" }),
        renderTransactionalMail: () => ({ subject: "customer", text: "customer", html: "customer" }),
        resolveTransactionalMailLanguage: () => "de",
      };
      throw new Error(`unexpected import ${name}`);
    },
    Deno: {
      env: { get: (key) => env[key] },
      serve: (value) => { handler = value; },
    },
    Request,
    Response,
    URL,
    TextEncoder,
    Uint8Array,
    crypto: globalThis.crypto,
    JSON,
    Object,
    Number,
    String,
    Error,
    Array,
    console: silentConsole,
  };
  vm.runInNewContext(compiled, context, { filename: "transactional-mail-dispatcher" });
  return handler;
}

test("staging synthetic-only mode never reserves the pending customer queue", async () => {
  const state = { rpcCalls: [], providerCalls: 0, completions: [] };
  const handler = loadDispatcher(state, { TRANSACTIONAL_MAIL_MODE: "staging_synthetic_only",
    SUPABASE_URL: "https://bwhvfjuwixgwduoeqaya.supabase.co",
    APP_BASE_URL: "https://staging-app.bonus.wuxuaisbi.com" });
  const response = await handler(new Request("http://127.0.0.1/dispatcher", {
    method: "POST",
    headers: { "x-wuxuai-scheduler-secret": "local-scheduler-fixture" },
    body: JSON.stringify({ limit: 50 }),
  }));
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: "staging_synthetic_contract_required" });
  assert.equal(state.rpcCalls.length, 0);
  assert.equal(state.providerCalls, 0);
});

async function dispatch(eventType, authorization, authorizationError = false, withdrawOnRecipientLookup = false) {
  const state = {
    providerCalls: 0,
    rpcCalls: [],
    completions: [],
    authorization,
    authorizationError,
    withdrawOnRecipientLookup,
    delivery: {
      delivery_id: "75000000-0000-4000-8000-000000000099",
      event_type: eventType,
      email: "synthetic@example.invalid",
      restaurant_name: "Synthetic Restaurant",
      restaurant_slug: "synthetic-restaurant",
      payload: {},
      attempt_count: 1,
    },
  };
  const handler = loadDispatcher(state);
  const response = await handler(new Request("http://127.0.0.1/dispatcher", {
    method: "POST",
    headers: { "x-wuxuai-scheduler-secret": "local-scheduler-fixture" },
    body: JSON.stringify({ limit: 1 }),
  }));
  return { state, response, body: await response.json() };
}

for (const [eventType, reasonCode] of [
  ["OFFER_PUBLISHED", "PRO_ENTITLEMENT_INACTIVE"],
  ["OFFER_PUBLISHED", "OFFER_EMAIL_CONSENT_INACTIVE"],
  ["OFFER_PUBLISHED", "CUSTOMER_IDENTITY_MISMATCH"],
  ["OFFER_PUBLISHED", "TENANT_MISMATCH"],
  ["POINT_REWARD_AVAILABLE", "PRO_ENTITLEMENT_INACTIVE"],
  ["POINT_REWARD_AVAILABLE", "REWARD_EMAIL_CONSENT_CONTRACT_MISSING"],
]) {
  test(`${eventType} ${reasonCode} never reaches the provider`, async () => {
    const { state, body } = await dispatch(eventType, { authorized: false, reason_code: reasonCode });
    assert.equal(state.providerCalls, 0);
    assert.equal(state.completions.length, 0);
    assert.deepEqual(body, { processed: 1, sent: 0, failed: 0, provider_accepted: false });
    assert.equal(state.rpcCalls.filter(({ name }) => name === "authorize_customer_transactional_email_delivery").length, 1);
  });
}

test("an authorization RPC failure is fail-closed and queued for safe retry", async () => {
  const { state, body } = await dispatch("OFFER_PUBLISHED", null, true);
  assert.equal(state.providerCalls, 0);
  assert.equal(state.completions.length, 1);
  assert.equal(state.completions[0].input_success, false);
  assert.equal(state.completions[0].input_error_code, "DISPATCH_AUTHORIZATION_FAILED");
  assert.deepEqual(body, { processed: 1, sent: 0, failed: 1, provider_accepted: false });
});

test("withdrawal during recipient preparation is rechecked before the provider", async () => {
  const { state, body } = await dispatch(
    "OFFER_PUBLISHED", { authorized: true, reason_code: null }, false, true,
  );
  assert.equal(state.providerCalls, 0);
  assert.equal(state.rpcCalls.filter(({ name }) => name === "authorize_customer_transactional_email_delivery").length, 1);
  assert.deepEqual(body, { processed: 1, sent: 0, failed: 0, provider_accepted: false });
});

test("a currently authorized offer preserves the existing provider and completion path", async () => {
  const { state, body } = await dispatch("OFFER_PUBLISHED", { authorized: true, reason_code: null });
  assert.equal(state.providerCalls, 1);
  assert.equal(state.completions.length, 1);
  assert.equal(state.completions[0].input_success, true);
  assert.equal(state.events[state.events.indexOf("provider") - 1], "authorize_customer_transactional_email_delivery");
  assert.deepEqual(body, { processed: 1, sent: 1, failed: 0, provider_accepted: true });
});

test("general mode can deliver an already pending birthday reminder", async () => {
  const { state, body } = await dispatch(
    "BIRTHDAY_GIFT_EXPIRY_REMINDER", { authorized: true, reason_code: null },
  );
  assert.equal(state.providerCalls, 1);
  assert.equal(state.completions.length, 1);
  assert.deepEqual(body, { processed: 1, sent: 1, failed: 0, provider_accepted: true });
});

for (const mode of [undefined, "", "typo", "staging_paused", "general"]) {
  test(`staging ${String(mode)} cannot touch three pending birthday jobs even with authorized parallel callers`, async () => {
    const pending = Array.from({ length: 3 }, (_, i) => ({ id: i, status: "PENDING", tenant: "synthetic-other-tenant" }));
    const before = JSON.stringify(pending);
    const state = { rpcCalls: [], providerCalls: 0, completions: [], pending,
      delivery: { delivery_id: "75000000-0000-4000-8000-000000000099", event_type: "BIRTHDAY_GIFT_EXPIRY_REMINDER", email: "synthetic@example.invalid", payload: {}, attempt_count: 1 },
      authorization: { authorized: true } };
    const handler = loadDispatcher(state, {
      TRANSACTIONAL_MAIL_MODE: mode,
      SUPABASE_URL: "https://bwhvfjuwixgwduoeqaya.supabase.co",
    });
    const responses = await Promise.all(Array.from({ length: 12 }, (_, i) => handler(new Request("https://local.invalid/dispatcher?mode=general", {
      method: "POST", headers: { "x-wuxuai-scheduler-secret": i % 2 ? "local-scheduler-fixture" : "unknown-caller" },
      body: JSON.stringify({ mode: "general", limit: 50, restaurant_id: "foreign-tenant" }),
    }))));
    assert.ok(responses.every(r => r.status === 503));
    assert.equal(state.rpcCalls.length, 0);
    assert.equal(state.clients ?? 0, 0);
    assert.equal(state.transports ?? 0, 0);
    assert.equal(state.providerCalls, 0);
    assert.equal(state.completions.length, 0);
    assert.equal(JSON.stringify(pending), before);
  });
}

test("pause ignores synthetic scheduler capabilities, malformed bodies and client mode overrides", async () => {
  const state = { rpcCalls: [], providerCalls: 0, completions: [] };
  const handler = loadDispatcher(state, { TRANSACTIONAL_MAIL_MODE: "staging_paused", SMTP_PASSWORD: undefined });
  for (const body of ["", "not-json", "null", JSON.stringify({ mode: "scheduled_synthetic_capacity_test",
    message_type: "synthetic_capacity", environment: "staging", synthetic_test: true,
    request_id: "75000000-0000-4000-8000-000000000001", correlation_id: "75000000-0000-4000-8000-000000000002",
    scheduler_token: "0".repeat(64), recipient: "synthetic@example.invalid" })]) {
    assert.equal((await handler(new Request("https://local.invalid/dispatcher?mode=general", {
      method: "POST", headers: { "x-wuxuai-scheduler-secret": "local-scheduler-fixture", "x-mode": "general" }, body,
    }))).status, 503);
  }
  assert.equal(state.rpcCalls.length, 0); assert.equal(state.clients ?? 0, 0);
  assert.equal(state.transports ?? 0, 0); assert.equal(state.providerCalls, 0);
});

for (const env of [
  { TRANSACTIONAL_MAIL_MODE: "general", APP_BASE_URL: "https://staging-app.bonus.wuxuaisbi.com" },
  { TRANSACTIONAL_MAIL_MODE: "staging_synthetic_only", APP_BASE_URL: "https://staging-app.bonus.wuxuaisbi.com" },
  { TRANSACTIONAL_MAIL_MODE: "staging_synthetic_only", SUPABASE_URL: "https://bwhvfjuwixgwduoeqaya.supabase.co" },
]) {
  test(`contradictory deployment pairing fails before any queue: ${JSON.stringify(env)}`, async () => {
    const state = { rpcCalls: [], providerCalls: 0, completions: [] };
    const response = await loadDispatcher(state, env)(new Request("https://local.invalid/dispatcher", {
      method: "POST", headers: { "x-wuxuai-scheduler-secret": "local-scheduler-fixture" }, body: "{}",
    }));
    assert.equal(response.status, 503); assert.equal(state.rpcCalls.length, 0);
    assert.equal(state.clients ?? 0, 0); assert.equal(state.transports ?? 0, 0);
  });
}

test("an enabled general transport still requires the existing scheduler authorization", async () => {
  for (const credential of [undefined, "foreign-caller"]) {
    const state = { rpcCalls: [], providerCalls: 0, completions: [] };
    const response = await loadDispatcher(state)(new Request("https://local.invalid/dispatcher", {
      method: "POST", headers: credential ? { "x-wuxuai-scheduler-secret": credential } : {}, body: "{}",
    }));
    assert.equal(response.status, 401); assert.equal(state.rpcCalls.length, 0);
    assert.equal(state.transports ?? 0, 0);
  }
});
