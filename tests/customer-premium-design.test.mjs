import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const portal = readFileSync(new URL("../src/modules/customer/CustomerPortal.tsx", import.meta.url), "utf8");
const referral = readFileSync(new URL("../src/modules/customer/ReferralLanding.tsx", import.meta.url), "utf8");
const staff = readFileSync(new URL("../src/modules/staff/StaffTablet.tsx", import.meta.url), "utf8");
const staffErrors = readFileSync(new URL("../src/modules/staff/staffRedemptionError.ts", import.meta.url), "utf8");
const components = readFileSync(new URL("../src/modules/customer/components/PremiumCustomerUi.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/modules/customer/customer-premium.css", import.meta.url), "utf8");

test("Premium-Kundenshell verwendet zentrale Tokens und Komponenten", () => {
  assert.match(styles, /--premium-background: #f8f5ef/);
  assert.match(styles, /--premium-gold: #bf8f36/);
  assert.match(styles, /--premium-gold-dark: #956820/);
  assert.match(styles, /--premium-gold-soft: #f3e6cc/);
  assert.match(styles, /--premium-primary: var\(--premium-gold\)/);
  assert.match(components, /export function AppShell/);
  assert.match(components, /export function PremiumCard/);
  assert.match(components, /export function PointsCard/);
  assert.match(components, /export function RewardCard/);
});

test("Kundennavigation hat exakt vier verständliche deutsche Hauptpunkte", () => {
  assert.match(components, /label: "Start"/);
  assert.match(components, /label: "Einlösen"/);
  assert.match(components, /label: "Sammeln"/);
  assert.match(components, /label: "Konto"/);
  assert.match(styles, /grid-template-columns: repeat\(4/);
});

test("Punkte sammeln und Einlösung behalten vorhandene Service-Aufrufe", () => {
  assert.match(portal, /collectBonusPoints\(\{/);
  assert.match(portal, /startCustomerGiftPresentation\(\{/);
  assert.match(portal, /startCustomerPointsPresentation\(\{/);
  assert.match(portal, /type="password"/);
  assert.match(portal, /\[0, 1, 2, 3\]\.map/);
  assert.match(portal, /maxLength=\{1\}/);
  assert.match(portal, /Vierstellige Tages-PIN/);
});

test("Info und Einlösung verwenden den gemeinsamen barrierefreien Drawer", () => {
  assert.match(portal, /<AppDrawer/);
  assert.match(referral, /<AppDrawer/);
  assert.match(portal, /redemptionDrawerOpen/);
});

test("Kundenoberflächen verwenden keine Emoji-Icons", () => {
  assert.doesNotMatch(portal, /[🔥🎉🎁🔒☕🍰🥤🥗🍣🍱🍽️]/u);
  assert.doesNotMatch(referral, /[🔥🎉🎁🔒☕🍰🥤🥗🍣🍱🍽️]/u);
});

test("Mobile Navigation berücksichtigt Safe Areas und Inhalte", () => {
  assert.match(styles, /env\(safe-area-inset-bottom\)/);
  assert.match(styles, /padding: max\(12px, env\(safe-area-inset-top\)\) 16px calc\(112px/);
  assert.match(styles, /min-height: 100dvh/);
  assert.doesNotMatch(styles, /\.customer-page-container[\s\S]{0,260}height: calc\(100dvh/);
  assert.doesNotMatch(styles, /\.customer-premium-shell[\s\S]{0,900}overflow: hidden/);
  assert.match(styles, /min-width: 0/);
});

test("Legacy-Codefehler bleiben sicher klassifiziert, aber aus der primären Staff-UX entfernt", () => {
  assert.doesNotMatch(staff, /classifyStaffRedemptionError\(error, phase\)/);
  assert.match(staffErrors, /typeof errorLike\?\.message === "string"/);
  assert.match(staffErrors, /Diese Belohnung wurde bereits eingelöst/);
});
