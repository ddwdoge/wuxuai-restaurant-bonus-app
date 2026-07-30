import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const components = readFileSync(new URL("../src/modules/public/PublicPageComponents.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/modules/public/public-entry-premium.css", import.meta.url), "utf8");
const home = readFileSync(new URL("../src/modules/public/PublicHome.tsx", import.meta.url), "utf8");
const login = readFileSync(new URL("../src/modules/auth/LoginPage.tsx", import.meta.url), "utf8");
const register = readFileSync(new URL("../src/modules/auth/RegisterPage.tsx", import.meta.url), "utf8");

test("alle vier öffentlichen Einstiegsseiten verwenden dieselbe Premium-Shell", () => {
  assert.equal((home.match(/<PublicPageShell/g) ?? []).length, 2);
  assert.match(login, /<PublicPageShell/);
  assert.match(register, /<PublicPageShell/);
  assert.match(home, /title="Dein Bonus"/);
  assert.match(styles, /\.public-premium-page-entry \{ max-width: 680px; \}/);
  assert.match(styles, /\.public-premium-page-form \{ max-width: 560px; \}/);
});

test("Login und Registrierung verwenden gemeinsame zugängliche Formularfelder", () => {
  assert.match(login, /<PublicFormField/);
  assert.match(register, /<PublicFormField/);
  assert.match(components, /<label htmlFor=\{inputId\}>/);
  assert.match(components, /aria-describedby=\{describedBy\}/);
  assert.match(components, /aria-invalid=\{error \? true : undefined\}/);
  assert.match(login, /autoComplete="email"/);
  assert.match(login, /autoComplete="current-password"/);
  assert.match(register, /autoComplete="new-password"/);
  assert.match(styles, /\.public-premium-field input[\s\S]*min-height: 52px/);
});

test("bestehende Login- und Registrierungslogik bleibt an nativen Formularen", () => {
  assert.match(login, /<form className="public-premium-form" onSubmit=\{handleSubmit\}>/);
  assert.match(login, /await signIn\(email, password\)/);
  assert.match(register, /<form className="public-premium-form" onSubmit=\{handleSubmit\}>/);
  assert.match(register, /await registerRestaurantOwner\(/);
  assert.match(components, /type PublicPrimaryButtonProps = ButtonHTMLAttributes<HTMLButtonElement>/);
  assert.match(login, /type="submit"/);
  assert.match(register, /type="submit"/);
});

test("Einstiegskarten sind vollständig und per Leertaste bedienbar", () => {
  assert.equal((home.match(/<PublicEntryCard/g) ?? []).length, 2);
  assert.match(components, /event\.key === " "/);
  assert.match(components, /event\.currentTarget\.click\(\)/);
  assert.match(components, /aria-label=\{`\$\{title\}: \$\{action\}`\}/);
  assert.match(styles, /\.public-premium-entry-card:focus-visible/);
});

test("öffentliche Premium-Styles bleiben kompakt und responsiv", () => {
  assert.match(styles, /env\(safe-area-inset-top\)/);
  assert.match(styles, /env\(safe-area-inset-bottom\)/);
  assert.match(styles, /overflow-x: clip/);
  assert.match(styles, /@media \(max-width: 639px\)/);
  assert.match(styles, /@media \(max-width: 359px\)/);
  assert.doesNotMatch(styles, /min-height:\s*250px/);
  assert.doesNotMatch(styles, /#[0-9a-f]{6}[\s\S]*#[0-9a-f]{6}[\s\S]*linear-gradient/i);
});

test("Fehler- und Ladezustände werden verständlich angekündigt", () => {
  assert.match(login, /role="alert" aria-live="assertive"/);
  assert.match(register, /role="alert" aria-live="assertive"/);
  assert.match(register, /role="status" aria-live="polite"/);
  assert.match(components, /aria-busy=\{loading\}/);
  assert.match(login, /Anmeldung läuft …/);
  assert.match(register, /Unternehmen wird eingerichtet …/);
});
