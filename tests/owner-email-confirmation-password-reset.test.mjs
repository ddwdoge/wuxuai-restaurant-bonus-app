import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildOwnerAuthRedirect,
  classifyOwnerAuthError,
  hasAuthCallbackPayload,
  hasRecoveryIntent,
  isOwnerEmailConfirmed,
  OWNER_AUTH_PATHS,
  ownerAuthErrorMessage,
  validateOwnerPassword,
} from "../src/modules/auth/ownerAuthFlow.mjs";
import { requiresAuthenticatedSession } from "../src/modules/auth/authRoutePolicy.mjs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const app = read("../src/app/App.tsx");
const authProvider = read("../src/modules/auth/AuthProvider.tsx");
const callback = read("../src/modules/auth/AuthCallbackPage.tsx");
const confirmEmail = read("../src/modules/auth/ConfirmEmailPage.tsx");
const forgotPassword = read("../src/modules/auth/ForgotPasswordPage.tsx");
const login = read("../src/modules/auth/LoginPage.tsx");
const protectedRoute = read("../src/modules/auth/ProtectedRoute.tsx");
const register = read("../src/modules/auth/RegisterPage.tsx");
const registerService = read("../src/modules/auth/registerOwnerService.ts");
const updatePassword = read("../src/modules/auth/UpdatePasswordPage.tsx");
const ownerAuthService = read("../src/modules/auth/ownerAuthService.ts");
const emailConfirmationService = read("../src/modules/auth/emailConfirmationService.ts");
const ownerRecoveryFlow = read("../src/modules/auth/ownerRecoveryFlow.mjs");
const supabaseClient = read("../src/shared/lib/supabase.ts");

test("Owner-Registrierung nutzt den zentralen Bestätigungs-Callback", () => {
  assert.match(registerService, /emailRedirectTo:\s*buildOwnerAuthRedirect\(window\.location\.origin, OWNER_AUTH_PATHS\.callback\)/);
  assert.match(registerService, /storePendingRegistration\(input\)/);
  assert.doesNotMatch(registerService, /emailRedirectTo:\s*`\$\{window\.location\.origin\}\/admin\/onboarding`/);
});

test("Tenant-Erzeugung erfolgt erst mit bestätigtem Benutzer", () => {
  assert.match(registerService, /completeConfirmedOwnerRegistration\(user: User\)/);
  assert.match(registerService, /!isOwnerEmailConfirmed\(user\)/);
  assert.match(callback, /completeConfirmedOwnerRegistration\(session\.user\)/);
  assert.match(registerService, /startOwnerTrial\(registration, 3\)/);
});

test("direkte Session nach signUp wird nicht als Bestätigung akzeptiert", () => {
  assert.match(registerService, /if \(data\.session\)[\s\S]*signOut\(\{ scope: "local" \}\)/);
  assert.doesNotMatch(registerService, /await startOwnerTrial\(input\)/);
});

test("Callback-, Bestätigungs- und Recovery-Routen sind registriert", () => {
  for (const path of Object.values(OWNER_AUTH_PATHS)) {
    assert.match(app, new RegExp(`path="${path.replaceAll("/", "\\/")}"`));
  }
});

test("nur der Bestätigungs-Callback lädt die normale Auth-Session", () => {
  assert.equal(requiresAuthenticatedSession("/auth/callback"), true);
  assert.equal(requiresAuthenticatedSession("/auth/update-password"), false);
  assert.equal(requiresAuthenticatedSession("/auth/forgot-password"), false);
  assert.equal(requiresAuthenticatedSession("/auth/confirm-email"), false);
});

test("Owner-Portal verlangt eine bestätigte E-Mail", () => {
  assert.match(app, /allowedRoles=\{\["owner", "admin", "manager"\]\} requireConfirmedEmail/);
  assert.match(protectedRoute, /requireConfirmedEmail && !isOwnerEmailConfirmed\(user\)/);
  assert.match(authProvider, /if \(!isOwnerEmailConfirmed\(data\.user\)\)/);
});

test("unbestätigter Login wird verständlich zum Bestätigungsflow geleitet", () => {
  assert.equal(classifyOwnerAuthError({ message: "Email not confirmed" }), "email_unconfirmed");
  assert.equal(ownerAuthErrorMessage({ message: "Email not confirmed" }), "Bitte bestätige zuerst deine E-Mail-Adresse.");
  assert.match(login, /EmailConfirmationRequiredError/);
  assert.match(login, /navigate\("\/auth\/confirm-email"/);
});

test("erneutes Senden bleibt generisch und besitzt einen Cooldown", () => {
  assert.match(confirmEmail, /RESEND_COOLDOWN_SECONDS = 60/);
  assert.match(confirmEmail, /Falls für diese Adresse ein noch nicht bestätigtes Konto existiert/);
  assert.match(confirmEmail, /disabled=\{!email\.trim\(\) \|\| cooldown > 0\}/);
  assert.match(ownerAuthService, /auth\.resend\(\{/);
});

test("Passwort-vergessen gibt keinen Kontobestand preis", () => {
  assert.match(ownerAuthService, /resetPasswordForEmail/);
  assert.match(forgotPassword, /Wenn ein Konto mit dieser E-Mail-Adresse existiert/);
  assert.doesNotMatch(forgotPassword, /nicht registriert|unbekannte E-Mail/);
});

test("Recovery-URL nutzt ausschließlich einen nicht sensitiven Flow-Marker", () => {
  assert.match(ownerAuthService, /searchParams\.set\("flow", "recovery"\)/);
  assert.equal(hasRecoveryIntent({ search: "?flow=recovery" }), true);
  assert.equal(hasRecoveryIntent({ hash: "#type=recovery" }), true);
  assert.equal(hasRecoveryIntent({ search: "?code=abc" }), false);
});

test("Callback-Seite akzeptiert nur echte Supabase-Callbackdaten", () => {
  assert.equal(hasAuthCallbackPayload({ hash: "#token_hash=opaque&type=email" }), true);
  assert.equal(hasAuthCallbackPayload({ search: "?code=pkce-code" }), true);
  assert.equal(hasAuthCallbackPayload({ hash: "#access_token=session-token&type=signup" }), true);
  assert.equal(hasAuthCallbackPayload({ search: "?error_code=otp_expired" }), true);
  assert.equal(hasAuthCallbackPayload({ search: "" }), false);
  assert.match(callback, /readEmailConfirmationPayload\(window\.location\)/);
});

test("Passwortregeln blockieren kurze und triviale Passwörter", () => {
  assert.equal(validateOwnerPassword("kurz").valid, false);
  assert.equal(validateOwnerPassword("12345678").valid, false);
  assert.equal(validateOwnerPassword("aaaaaaaa").valid, false);
  assert.equal(validateOwnerPassword("Sicher!42").valid, true);
});

test("Passwortwiederholung muss übereinstimmen", () => {
  assert.equal(validateOwnerPassword("Sicher!42", "Anders!42").valid, false);
  assert.equal(validateOwnerPassword("Sicher!42", "Sicher!42").valid, true);
  assert.match(updatePassword, /validateOwnerPassword\(password, confirmation\)/);
});

test("Owner-Registrierung verlangt eine passende Passwortbestätigung", () => {
  assert.match(register, /label="Passwort bestätigen"/);
  assert.match(register, /type="password"[\s\S]{0,100}value=\{confirmPassword\}/);
  assert.match(register, /confirmPassword\.length > 0 && confirmPassword === password/);
  assert.match(register, /disabled=\{!formValid\}/);
  assert.match(register, /Passwörter stimmen nicht überein\./);
  assert.match(register, /Bitte bestätige dein Passwort\./);
});

test("Bestätigungsfehler erscheint erst nach Feldnutzung oder Submit", () => {
  assert.match(register, /confirmPasswordTouched \|\| submitAttempted/);
  assert.match(register, /onBlur=\{\(\) => setConfirmPasswordTouched\(true\)\}/);
  assert.match(register, /setSubmitAttempted\(true\)/);
});

test("Passwortbestätigung verlässt den Registrierungs-Client nicht", () => {
  const registrationCall = register.match(/registerRestaurantOwner\(\{[\s\S]*?\}\)/)?.[0] ?? "";
  assert.match(registrationCall, /password/);
  assert.doesNotMatch(registrationCall, /confirmPassword/);
  assert.doesNotMatch(registerService, /confirmPassword/);
  assert.match(registerService, /auth\.signUp\(\{[\s\S]*password: input\.password/);
});

test("Passwort wird ausschließlich über Supabase Auth aktualisiert", () => {
  assert.match(ownerAuthService, /auth\.updateUser\(\{ password \}\)/);
  assert.match(ownerAuthService, /recoveryLifecycle\.complete\(\)/);
  assert.doesNotMatch(ownerAuthService, /localStorage.*password|sessionStorage.*password/);
});

test("Recovery verwendet einen tabgebundenen Supabase-Client", () => {
  assert.match(supabaseClient, /ownerRecoverySupabase/);
  assert.match(supabaseClient, /storage:\s*window\.sessionStorage/);
  assert.match(supabaseClient, /storageKey:\s*"wuxuai-owner-recovery-auth"/);
  assert.match(supabaseClient, /detectSessionInUrl:\s*false/);
});

test("Update-Seite bereinigt URL erst nach erfolgreichem Session-Aufbau", () => {
  assert.match(updatePassword, /await establishOwnerRecoverySession\(\);[\s\S]*clearSensitiveAuthUrl\(\)/);
  assert.doesNotMatch(updatePassword, /catch[\s\S]{0,160}clearSensitiveAuthUrl/);
  assert.match(updatePassword, /acquireOwnerRecoveryLifecycle\(\)/);
  assert.match(updatePassword, /releaseRecoveryLifecycle\(\)/);
});

test("Recovery-Marker speichert keine Tokens, Codes oder Passwörter", () => {
  assert.match(ownerRecoveryFlow, /owner_password_recovery_in_progress/);
  assert.match(ownerRecoveryFlow, /sessionStorage|storage/);
  assert.doesNotMatch(ownerRecoveryFlow, /setItem\([^\n]*(accessToken|refreshToken|payload\.code|password)/);
});

test("Recovery-Flow erzeugt weder Tenant noch Trial", () => {
  const combined = [ownerAuthService, ownerRecoveryFlow, updatePassword].join("\n");
  assert.doesNotMatch(combined, /start_restaurant_owner_trial|startOwnerTrial|completeConfirmedOwnerRegistration/);
});

test("Bestätigungs-Callback verarbeitet weiterhin PKCE und vollständigen Hash", () => {
  assert.match(emailConfirmationService, /exchangeCodeForSession\(payload\.code\)/);
  assert.match(emailConfirmationService, /auth\.setSession\(\{[\s\S]*access_token: payload\.accessToken,[\s\S]*refresh_token: payload\.refreshToken/);
  assert.match(emailConfirmationService, /verifyOtp\(\{[\s\S]*token_hash: payload\.tokenHash,[\s\S]*type: "email"/);
  assert.match(callback, /completeConfirmedOwnerRegistration\(session\.user\)/);
  assert.match(callback, /void completeCallback\(\)/);
  assert.match(callback, /E-Mail-Adresse erfolgreich bestätigt/);
  assert.doesNotMatch(callback, /onClick=\{completeCallback\}/);
});

test("sensitive Callback-Werte werden aus der URL entfernt", () => {
  assert.match(ownerAuthService, /history\.replaceState\(\{\}, document\.title, window\.location\.pathname\)/);
  assert.doesNotMatch(callback, /console\./);
  assert.doesNotMatch(updatePassword, /console\./);
});

test("Owner-Callback verarbeitet den bestätigten Link automatisch und genau einmal", () => {
  assert.doesNotMatch(callback, /onClick=\{completeCallback\}/);
  assert.match(callback, /useEffect\(\(\) => \{[\s\S]*clearSensitiveAuthUrl\(\);[\s\S]*void completeCallback\(\)/);
  assert.match(callback, /async function completeCallback\(\)[\s\S]*establishOwnerAuthSession\(payload\)/);
});

test("Fehlerzustände werden ohne technische Supabase-Texte abgebildet", () => {
  assert.equal(classifyOwnerAuthError({ status: 429, message: "rate limit" }), "rate_limit");
  assert.equal(classifyOwnerAuthError({ message: "Weak password" }), "weak_password");
  assert.equal(classifyOwnerAuthError({ message: "Invalid login credentials" }), "invalid_credentials");
  assert.equal(classifyOwnerAuthError({ status: 503, message: "server" }), "server");
  assert.doesNotMatch(ownerAuthErrorMessage({ status: 503, message: "internal database error" }), /database|503/i);
});

test("Bestätigungsstatus wird ausschließlich aus Supabase User gelesen", () => {
  assert.equal(isOwnerEmailConfirmed({ email_confirmed_at: "2026-07-30T12:00:00Z" }), true);
  assert.equal(isOwnerEmailConfirmed({ email_confirmed_at: null }), false);
  assert.equal(buildOwnerAuthRedirect("https://bonus.example/", OWNER_AUTH_PATHS.callback), "https://bonus.example/auth/callback");
});

test("Customer- und Staff-Module werden vom neuen Owner-Auth-Flow nicht importiert", () => {
  const combined = [callback, confirmEmail, forgotPassword, updatePassword, ownerAuthService].join("\n");
  assert.doesNotMatch(combined, /modules\/(customer|staff)|\.\.\/(customer|staff)/);
  assert.doesNotMatch(app, /path="\/staff\/:slug"[\s\S]{0,240}requireConfirmedEmail/);
});
