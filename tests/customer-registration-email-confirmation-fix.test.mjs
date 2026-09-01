import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  classifyCustomerAuthError,
  classifyCustomerSignUpResult,
  customerAuthErrorMessage,
  customerPasswordConfirmationError,
  isCustomerPasswordConfirmationValid,
} from "../src/modules/customer/customerAuthFlow.mjs";

const read = async (path) => readFile(new URL(path, import.meta.url), "utf8");

test("Customer-Passwortbestätigung akzeptiert nur zwei passende gültige Werte", () => {
  assert.equal(isCustomerPasswordConfirmationValid("Sicher!42", "Sicher!42"), true);
  assert.equal(isCustomerPasswordConfirmationValid("Sicher!42", "Anders!42"), false);
  assert.equal(isCustomerPasswordConfirmationValid("Sicher!42", ""), false);
  assert.equal(isCustomerPasswordConfirmationValid("kurz", "kurz"), false);
});

test("Bestätigungsfehler erscheint erst nach Feldnutzung oder Submit", () => {
  assert.equal(customerPasswordConfirmationError("Sicher!42", "A", false), null);
  assert.equal(customerPasswordConfirmationError("Sicher!42", "", true), "Bitte bestätige dein Passwort.");
  assert.equal(customerPasswordConfirmationError("Sicher!42", "Anders!42", true), "Passwörter stimmen nicht überein.");
  assert.equal(customerPasswordConfirmationError("Sicher!42", "Sicher!42", true), null);
});

test("echter Signup und obfuskiertes Bestandskonto werden getrennt", () => {
  assert.equal(classifyCustomerSignUpResult({
    session: null,
    user: { confirmation_sent_at: "2026-08-21T12:00:00Z", identities: [{ id: "identity" }] },
  }), "confirmation_required");
  assert.equal(classifyCustomerSignUpResult({
    session: null,
    user: { confirmation_sent_at: "2026-08-21T12:00:00Z", identities: [] },
  }), "existing_or_obfuscated");
  assert.equal(classifyCustomerSignUpResult({
    session: { user: { email_confirmed_at: "2026-08-21T12:00:00Z" } },
    user: {},
  }), "confirmed");
  assert.equal(classifyCustomerSignUpResult({ session: null, user: null }), "failed");
});

test("Auth-Fehler werden ohne technische Supabase-Details dargestellt", () => {
  assert.equal(classifyCustomerAuthError({ status: 429, message: "rate limit" }), "rate_limit");
  assert.equal(classifyCustomerAuthError({ status: 503, message: "internal database error" }), "server");
  assert.equal(classifyCustomerAuthError({ message: "fetch failed" }), "network");
  assert.doesNotMatch(customerAuthErrorMessage({ status: 503, message: "internal database error" }), /database|503/i);
  assert.match(customerAuthErrorMessage({ status: 429 }, "resend"), /warte kurz/);
});

test("Customer-Formular besitzt Passwortbestätigung und blockiert ungültigen Submit", async () => {
  const [page, flow] = await Promise.all([
    read("../src/modules/customer/CustomerAuthPage.tsx"),
    read("../src/modules/customer/customerAuthFlow.mjs"),
  ]);
  assert.match(page, /Passwort bestätigen/);
  assert.match(page, /id="customer-confirm-password"/);
  assert.match(page, /type="password"/);
  assert.match(page, /confirmPasswordTouched \|\| submitAttempted/);
  assert.match(page, /setSubmitAttempted\(true\)/);
  assert.match(flow, /Passwörter stimmen nicht überein\./);
  assert.match(page, /!registrationValid/);
});

test("confirmPassword verlässt weder Formular noch Customer-Auth-Service", async () => {
  const [page, service] = await Promise.all([
    read("../src/modules/customer/CustomerAuthPage.tsx"),
    read("../src/modules/customer/customerAuthService.ts"),
  ]);
  const registrationCall = page.match(/registerCustomerAuthAccount\(\{[\s\S]*?\}\)/)?.[0] ?? "";
  assert.match(registrationCall, /password/);
  assert.doesNotMatch(registrationCall, /confirmPassword/);
  assert.doesNotMatch(service, /confirmPassword/);
  assert.match(service, /auth\.signUp\(\{[\s\S]*password: input\.password/);
  assert.doesNotMatch(`${page}\n${service}`, /console\.|analytics/);
});

test("Resend verwendet Supabase Signup-API, Cooldown und sicheren Callback", async () => {
  const [page, service] = await Promise.all([
    read("../src/modules/customer/CustomerAuthPage.tsx"),
    read("../src/modules/customer/customerAuthService.ts"),
  ]);
  assert.match(service, /auth\.resend\(\{/);
  assert.match(service, /type: "signup"/);
  assert.match(service, /customer\/auth\/callback/);
  assert.match(page, /RESEND_COOLDOWN_SECONDS = 60/);
  assert.match(page, /Bestätigungs-E-Mail erneut senden/);
  assert.match(page, /resendCooldown > 0/);
});

test("Restaurantkontext und optionaler Geburtstag bleiben im Signup-Vertrag", async () => {
  const service = await read("../src/modules/customer/customerAuthService.ts");
  assert.match(service, /customer_return_to: input\.returnTo/);
  assert.match(service, /customer_birthday: input\.birthday \|\| null/);
  assert.match(service, /customer_phone: input\.phone/);
  assert.match(service, /customer_first_name: input\.firstName\.trim\(\)/);
});

test("Owner-Registrierung bleibt vom Customer-Fix unberührt", async () => {
  const [ownerPage, ownerService] = await Promise.all([
    read("../src/modules/auth/RegisterPage.tsx"),
    read("../src/modules/auth/registerOwnerService.ts"),
  ]);
  assert.match(ownerPage, /Passwort bestätigen/);
  assert.match(ownerPage, /registerRestaurantOwner/);
  assert.match(ownerService, /start_restaurant_owner_trial/);
  assert.doesNotMatch(`${ownerPage}\n${ownerService}`, /customerAuthService|customerAuthFlow/);
});
