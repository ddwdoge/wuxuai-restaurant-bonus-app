import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const onboarding = await readFile(
  new URL("../src/modules/admin/pages/RestaurantOnboarding.tsx", import.meta.url),
  "utf8",
);
const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

const appearanceStart = onboarding.indexOf('<section className="brand-live-preview">');
const appearanceEnd = onboarding.indexOf("{step === 2 ?", appearanceStart);
const appearancePreview = onboarding.slice(appearanceStart, appearanceEnd);

const starterKitStart = onboarding.indexOf("{step === 5 ?");
const starterKitEnd = onboarding.indexOf("{step === 6 ?", starterKitStart);
const starterKit = onboarding.slice(starterKitStart, starterKitEnd);

test("Aussehen-Schritt enthält keine Kunden-QRs oder Gast-Navigation", () => {
  assert.ok(appearanceStart >= 0 && appearanceEnd > appearanceStart);
  assert.doesNotMatch(appearancePreview, /QRCodeSVG|Restaurant-QR|Mein-Bonus-QR|So testest du es als Gast|Als Gast ansehen/);
  assert.doesNotMatch(onboarding, /openGuestPreview|window\.open\(`\/customer\//);
});

test("Bonus öffnen bleibt eine rein visuelle Vorschau", () => {
  assert.match(appearancePreview, /<span[\s\S]*onboarding-preview-button[\s\S]*Bonus öffnen[\s\S]*<\/span>/);
  assert.doesNotMatch(appearancePreview, /<Link|<a\s|onClick=|to=|href=/);
  assert.match(styles, /\.onboarding-preview-button\s*\{[\s\S]*pointer-events:\s*none/);
});

test("Bonuskarten-Vorschau nutzt eine zentrierte responsive Einzelspalte", () => {
  assert.match(styles, /\.brand-live-preview\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*680px\)[\s\S]*justify-content:\s*center/);
  assert.match(styles, /\.customer-app-preview\s*\{[\s\S]*box-sizing:\s*border-box[\s\S]*width:\s*100%/);
});

test("echte QR-Codes bleiben ausschließlich im Starter-Kit verfügbar", () => {
  assert.ok(starterKitStart >= 0 && starterKitEnd > starterKitStart);
  assert.match(starterKit, /id="restaurant-qr"/);
  assert.match(starterKit, /id="staff-qr"/);
  assert.doesNotMatch(starterKit, /id="bonus-qr"|\/w\/\$\{restaurantSlug\}/);
  assert.match(starterKit, /downloadRestaurantStarterKit/);
  assert.match(onboarding, /<OperationalQrCode[\s\S]*value=\{url\}/);
});
