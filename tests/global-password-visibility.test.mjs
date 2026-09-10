import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { SUPPORTED_UI_LANGUAGES } from "../src/shared/i18n/language.mjs";
import { translateStructural } from "../src/shared/i18n/catalog.mjs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const accountPasswordFields = {
  "src/modules/customer/CustomerAuthPage.tsx": { passwordInput: 2, publicPassword: 0 },
  "src/modules/auth/LoginPage.tsx": { passwordInput: 0, publicPassword: 1 },
  "src/modules/auth/RegisterPage.tsx": { passwordInput: 0, publicPassword: 3 },
  "src/modules/auth/StaffLoginPage.tsx": { passwordInput: 0, publicPassword: 1 },
  "src/modules/auth/StaffInvitePage.tsx": { passwordInput: 0, publicPassword: 2 },
  "src/modules/auth/UpdatePasswordPage.tsx": { passwordInput: 0, publicPassword: 2 },
};

test("all 11 account-password fields use the shared visibility contract", () => {
  let total = 0;
  for (const [path, expected] of Object.entries(accountPasswordFields)) {
    const source = read(path);
    const passwordInput = (source.match(/<PasswordInput\b/g) ?? []).length;
    const publicPassword = (source.match(/<PublicFormField\b(?:(?!\/>)[\s\S])*?type="password"(?:(?!\/>)[\s\S])*?\/>/g) ?? []).length;
    assert.equal(passwordInput, expected.passwordInput, `${path}: PasswordInput`);
    assert.equal(publicPassword, expected.publicPassword, `${path}: PublicFormField password`);
    total += passwordInput + publicPassword;
  }
  assert.equal(total, 11);
  assert.match(read("src/modules/public/PublicPageComponents.tsx"), /type === "password"[\s\S]*<PasswordInput/);
});

test("visibility toggle is non-submitting, accessible and preserves the controlled input", () => {
  const source = read("src/shared/components/PasswordInput.tsx");
  assert.match(source, /useState\(false\)/);
  assert.match(source, /type=\{visible \? "text" : "password"\}/);
  assert.match(source, /type="button"/);
  assert.match(source, /aria-label=\{label\}/);
  assert.match(source, /aria-pressed=\{visible\}/);
  assert.match(source, /\.\.\.inputProps/);
  assert.match(source, /inputRef\.current\?\.focus/);
  assert.match(read("src/shared/components/password-input.css"), /min-height: 44px/);
});

test("show and hide labels exist in every supported language", () => {
  for (const language of SUPPORTED_UI_LANGUAGES) {
    assert.notEqual(translateStructural("auth.password.show", language), "auth.password.show", language);
    assert.notEqual(translateStructural("auth.password.hide", language), "auth.password.hide", language);
  }
  assert.equal(translateStructural("auth.password.show", "de"), "Passwort anzeigen");
  assert.equal(translateStructural("auth.password.hide", "de"), "Passwort ausblenden");
});

test("daily PIN fields remain hidden and outside the account-password visibility scope", () => {
  const customerPortal = read("src/modules/customer/CustomerPortal.tsx");
  const staffTablet = read("src/modules/staff/StaffTablet.tsx");
  assert.match(customerPortal, /Tages-PIN Ziffer[\s\S]*type="password"/);
  assert.match(staffTablet, /placeholder="Tages-PIN eingeben"[\s\S]*type="password"/);
  assert.doesNotMatch(customerPortal, /PasswordInput/);
  assert.doesNotMatch(staffTablet, /PasswordInput/);
});
