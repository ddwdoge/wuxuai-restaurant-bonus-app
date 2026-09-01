import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createEmailConfirmationSingleFlight,
  emailConfirmationPayloadKey,
  readEmailConfirmationPayload,
} from "../src/modules/auth/emailConfirmationFlow.mjs";

const read = async (path) => readFile(new URL(path, import.meta.url), "utf8");

test("TokenHash-Link wird aus dem Fragment gelesen", () => {
  assert.deepEqual(
    readEmailConfirmationPayload({ search: "", hash: "#token_hash=secret&type=email" }),
    { kind: "token_hash", tokenHash: "secret", type: "email" },
  );
});

test("Signup ist als kompatibler TokenHash-Typ erlaubt", () => {
  assert.equal(readEmailConfirmationPayload({ search: "?token_hash=secret&type=signup", hash: "" }).kind, "token_hash");
});

test("falscher TokenHash-Typ wird blockiert", () => {
  assert.deepEqual(
    readEmailConfirmationPayload({ search: "?token_hash=secret&type=recovery", hash: "" }),
    { kind: "invalid", reason: "invalid_type" },
  );
});

test("fehlender TokenHash und fehlender Code werden blockiert", () => {
  assert.deepEqual(readEmailConfirmationPayload({ search: "", hash: "" }), { kind: "invalid", reason: "missing_payload" });
});

test("PKCE-Bestandslinks bleiben unterstützt", () => {
  assert.deepEqual(readEmailConfirmationPayload({ search: "?code=pkce", hash: "" }), { kind: "pkce", code: "pkce" });
});

test("vollständiger Legacy-Hash bleibt unterstützt", () => {
  assert.equal(readEmailConfirmationPayload({ search: "", hash: "#access_token=a&refresh_token=b" }).kind, "legacy_session");
});

test("unvollständiger Legacy-Hash wird blockiert", () => {
  assert.deepEqual(
    readEmailConfirmationPayload({ search: "", hash: "#access_token=a" }),
    { kind: "invalid", reason: "incomplete_session" },
  );
});

test("Supabase-Callbackfehler hat Vorrang vor weiteren Parametern", () => {
  assert.deepEqual(
    readEmailConfirmationPayload({ search: "?error_code=otp_expired&token_hash=secret&type=email", hash: "" }),
    { kind: "invalid", reason: "callback_error" },
  );
});

test("Single-Flight verarbeitet Doppelklick und StrictMode nur einmal", async () => {
  const guard = createEmailConfirmationSingleFlight();
  let calls = 0;
  const operation = async () => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return "session";
  };
  const [first, second] = await Promise.all([guard.run("same", operation), guard.run("same", operation)]);
  assert.equal(first, "session");
  assert.equal(second, "session");
  assert.equal(await guard.run("same", operation), "session");
  assert.equal(calls, 1);
});

test("Single-Flight blockiert parallele unterschiedliche Bestätigungen", async () => {
  const guard = createEmailConfirmationSingleFlight();
  let release;
  const pending = guard.run("first", () => new Promise((resolve) => { release = resolve; }));
  await assert.rejects(guard.run("second", async () => "second"), /confirmation_in_progress/);
  release("first");
  assert.equal(await pending, "first");
});

test("fehlgeschlagene Bestätigung darf kontrolliert erneut versucht werden", async () => {
  const guard = createEmailConfirmationSingleFlight();
  let calls = 0;
  await assert.rejects(guard.run("same", async () => {
    calls += 1;
    throw new Error("temporary");
  }));
  assert.equal(await guard.run("same", async () => {
    calls += 1;
    return "ok";
  }), "ok");
  assert.equal(calls, 2);
});

test("Payload-Schlüssel unterscheidet TokenHash PKCE und Legacy", () => {
  assert.notEqual(
    emailConfirmationPayloadKey({ kind: "token_hash", tokenHash: "same", type: "email" }),
    emailConfirmationPayloadKey({ kind: "pkce", code: "same" }),
  );
});

test("Customer-Callback bestätigt automatisch und zeigt Resend nur zur Fehlerbehebung", async () => {
  const callback = await read("../src/modules/customer/CustomerAuthCallbackPage.tsx");
  assert.match(callback, /void confirmEmail\(\)/);
  assert.match(callback, /E-Mail-Adresse erfolgreich bestätigt/);
  assert.doesNotMatch(callback, /onClick=\{confirmEmail\}/);
  assert.match(callback, /Neue Bestätigungs-E-Mail senden/);
  assert.match(callback, /Verwende immer den neuesten Link/);
  assert.match(callback, /RESEND_COOLDOWN_SECONDS = 60/);
  assert.match(callback, /Falls ein unbestätigtes Konto besteht/);
  assert.doesNotMatch(callback, /console\./);
});

test("Bestätigungsservice nutzt verifyOtp und protokolliert keine Zugangsdaten", async () => {
  const service = await read("../src/modules/auth/emailConfirmationService.ts");
  assert.match(service, /auth\.verifyOtp/);
  assert.match(service, /type: "email"/);
  assert.doesNotMatch(service, /console\.|logger|analytics/);
});

test("Signup-Redirect ist exakt und Rückkehrkontext liegt in sicheren User-Metadaten", async () => {
  const service = await read("../src/modules/customer/customerAuthService.ts");
  assert.match(service, /customer_return_to: input\.returnTo/);
  assert.doesNotMatch(service, /callbackUrl\.searchParams\.set\("returnTo"/);
});
