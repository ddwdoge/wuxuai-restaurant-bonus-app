import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

function loadDispatcher(state) {
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
      state.providerCalls += 1;
      return { messageId: "local-provider-message" };
    },
  };
  const env = {
    SUPABASE_URL: "http://127.0.0.1:56121",
    SUPABASE_SERVICE_ROLE_KEY: "local-service-role-fixture",
    TRANSACTIONAL_MAIL_SCHEDULER_SECRET: "local-scheduler-fixture",
    APP_BASE_URL: "https://staging-app.bonus.wuxuaisbi.com",
    SMTP_HOST: "smtp.example.invalid",
    SMTP_PORT: "587",
    SMTP_USERNAME: "local-user",
    SMTP_PASSWORD: "local-password",
    SMTP_FROM_EMAIL: "notifications@example.invalid",
    SMTP_REPLY_TO: "support@example.invalid",
  };
  const silentConsole = { info() {}, error() {}, log() {} };
  const context = {
    exports: {},
    require(name) {
      if (name.includes("supabase-js")) return { createClient: () => client };
      if (name.includes("nodemailer")) return { __esModule: true, default: { createTransport: () => transporter } };
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
  assert.deepEqual(body, { processed: 1, sent: 1, failed: 0, provider_accepted: true });
});
