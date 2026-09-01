import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { classifyOwnerSignUpResult } from "../src/modules/auth/ownerAuthFlow.mjs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const registerPage = read("../src/modules/auth/RegisterPage.tsx");
const registerService = read("../src/modules/auth/registerOwnerService.ts");
const publicEntryStyles = read("../src/modules/public/public-entry-premium.css");
const loginPage = read("../src/modules/auth/LoginPage.tsx");
const confirmEmailPage = read("../src/modules/auth/ConfirmEmailPage.tsx");
const trialMigration = read("../supabase/migrations/20260830001000_v1_commercial_contract_three_month_trial.sql");

test("Signup-Ergebnis unterscheidet neue und verschleierte bestehende Identitaeten", () => {
  assert.equal(classifyOwnerSignUpResult({ session: null, user: { identities: [{ id: "new" }] } }), "confirmation_required");
  assert.equal(classifyOwnerSignUpResult({ session: null, user: { identities: [] } }), "existing_or_obfuscated");
  assert.equal(classifyOwnerSignUpResult({ session: null, user: null }), "failed");
  assert.equal(
    classifyOwnerSignUpResult({ session: { user: { email_confirmed_at: "2026-09-01T10:00:00Z" } } }),
    "confirmed",
  );
});

test("bestehende E-Mail wechselt neutral in die hervorgehobene Passwort-Anmeldung", () => {
  assert.match(registerService, /signUpResult === "existing_or_obfuscated"/);
  assert.match(registerService, /requiresAuthentication: true/);
  assert.match(registerPage, /Bestehendes WUXUAI®-Bonus-Konto erkannt\. Gib oben dein bestehendes Passwort ein und aktiviere anschließend den Restaurantbereich\./);
  assert.match(registerPage, /Konto erkannt – gib jetzt dein bestehendes Passwort ein, um den Restaurantbereich zu aktivieren\./);
  assert.match(registerPage, /className="owner-existing-password-stage"/);
  assert.match(registerPage, /<LockKeyhole aria-hidden="true" size=\{18\}/);
  assert.match(registerPage, /autoComplete="current-password"/);
  assert.match(registerPage, /autoFocus/);
  assert.match(registerPage, /label="Bestehendes Passwort"/);
  assert.match(registerPage, /error=\{error\}/);
  assert.match(registerPage, /Das bestehende Passwort ist nicht korrekt\./);
  assert.doesNotMatch(registerPage, /Jetzt anmelden und fortfahren|ownerRegistrationContinuation|returnTo/);
  assert.match(publicEntryStyles, /\.owner-existing-password-stage \{[\s\S]*background: #f1faf5;[\s\S]*border: 2px solid #63a985;/);
  assert.match(publicEntryStyles, /\.owner-existing-password-stage \.public-premium-field input:focus-visible/);
  assert.doesNotMatch(registerPage, /existiert bereits als Kunde|Customer-Konto gefunden|Kundenkonto gefunden/i);
  assert.doesNotMatch(registerService, /from\(["'](?:profiles|customers|customer_memberships|restaurant_members)["']\).*eq\(["']email["']/s);
});

test("bestehende Identitaet wird authentifiziert und danach als Owner fortgesetzt", () => {
  assert.match(registerPage, /if \(existingIdentityFlow\)[\s\S]*await signIn\(email, password\)/);
  assert.match(registerPage, /await completePendingOwnerRegistration\(email\)/);
  assert.match(registerPage, /window\.location\.assign\("\/admin\/onboarding"\)/);
  assert.match(registerPage, /Restaurantbereich aktivieren/);
  assert.doesNotMatch(registerPage, /admin\.createUser|auth\.admin|createUser\(/);
});

test("bestaetigte bestehende Session braucht weder Passwort noch neue Bestaetigung", () => {
  assert.match(registerPage, /user && isOwnerEmailConfirmed\(user\).*![\s\S]*portalAccess\.owner_access/s);
  assert.match(registerPage, /await activateRestaurantOwnerForCurrentUser\(\{ ownerName, restaurantName, phone \}\)/);
  assert.match(registerPage, /label="Bestätigte E-Mail"/);
  assert.doesNotMatch(registerService, /activateRestaurantOwnerForCurrentUser[\s\S]*auth\.signUp/s);
});

test("unbestaetigte bestehende Identitaet behaelt Intent und nutzt Resend", () => {
  assert.match(registerPage, /caught\.name === "EmailConfirmationRequiredError"[\s\S]*navigate\("\/auth\/confirm-email"/);
  assert.match(confirmEmailPage, /RESEND_COOLDOWN_SECONDS = 60/);
  assert.match(confirmEmailPage, /Falls für diese Adresse ein noch nicht bestätigtes Konto existiert/);
  assert.match(loginPage, /await completePendingOwnerRegistration\(email\)/);
});

test("Pending Owner Intent speichert niemals ein Passwort", () => {
  const storedPayload = registerService.match(/function storePendingRegistration[\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(storedPayload, /ownerName: input\.ownerName/);
  assert.match(storedPayload, /email: input\.email/);
  assert.match(storedPayload, /restaurantName: input\.restaurantName/);
  assert.match(storedPayload, /phone: input\.phone/);
  assert.doesNotMatch(storedPayload, /password:/);
});

test("Owner-Provisionierung nutzt dieselbe Auth-ID atomar und laesst Customer und Staff unberuehrt", () => {
  assert.match(trialMigration, /user_id_value uuid := auth\.uid\(\)/);
  assert.match(trialMigration, /insert into public\.restaurants[\s\S]*owner_id[\s\S]*user_id_value/);
  assert.match(trialMigration, /insert into public\.restaurant_members[\s\S]*user_id_value,[\s\S]*'owner'/);
  assert.match(trialMigration, /branch_id_value := coalesce\([\s\S]*ensure_restaurant_branch/);
  assert.match(trialMigration, /insert into public\.branch_subscriptions/);
  assert.doesNotMatch(trialMigration, /delete from public\.(?:customers|customer_memberships|staff_members)/i);
  assert.doesNotMatch(trialMigration, /update public\.(?:customers|customer_memberships|staff_members)/i);
});

test("Owner-Trial ist fuer dieselbe Identitaet idempotent und nicht doppelt startbar", () => {
  assert.match(trialMigration, /from public\.restaurants[\s\S]*where owner_id = user_id_value[\s\S]*limit 1/);
  assert.match(trialMigration, /on conflict \(restaurant_id, user_id\) do update/);
  assert.match(trialMigration, /on conflict \(branch_id\) do update/);
  assert.match(trialMigration, /trial_started_at = coalesce\(branch_subscriptions\.trial_started_at/);
  assert.match(trialMigration, /trial_ends_at = coalesce\(branch_subscriptions\.trial_ends_at/);
  assert.match(trialMigration, /now\(\) \+ interval '3 months'/);
});

test("Owner-Provisionierung ist nur authentifiziert und tenantgebunden erreichbar", () => {
  assert.match(trialMigration, /if user_id_value is null then[\s\S]*raise exception 'not authenticated'/);
  assert.match(trialMigration, /revoke execute[\s\S]*from public, anon/);
  assert.match(trialMigration, /grant execute[\s\S]*to authenticated/);
  assert.doesNotMatch(registerService, /service_role|SUPABASE_SERVICE_ROLE/i);
});
