import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const app = readFileSync(new URL("../src/app/App.tsx", import.meta.url), "utf8");
const publicHome = readFileSync(new URL("../src/modules/public/PublicHome.tsx", import.meta.url), "utf8");
const publicStyles = readFileSync(new URL("../src/modules/public/public-entry-premium.css", import.meta.url), "utf8");
const appDrawer = readFileSync(new URL("../src/shared/components/AppDrawer.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const onboarding = readFileSync(new URL("../src/modules/admin/pages/RestaurantOnboarding.tsx", import.meta.url), "utf8");
const adminLayout = readFileSync(new URL("../src/modules/admin/AdminLayout.tsx", import.meta.url), "utf8");
const staff = readFileSync(new URL("../src/modules/staff/StaffTablet.tsx", import.meta.url), "utf8");
const customer = readFileSync(new URL("../src/modules/customer/CustomerPortal.tsx", import.meta.url), "utf8");
const rewards = readFileSync(new URL("../src/modules/admin/pages/RewardsPage.tsx", import.meta.url), "utf8");
const platform = readFileSync(new URL("../src/modules/platform/PlatformAuditPage.tsx", import.meta.url), "utf8");
const finder = readFileSync(new URL("../src/modules/customer/PartnerRestaurantFinderPage.tsx", import.meta.url), "utf8");
const finderStyles = readFileSync(new URL("../src/modules/customer/partner-restaurant-finder.css", import.meta.url), "utf8");

test("öffentliche Startseite zeigt zwei klare Hauptwege auf Route /", () => {
  assert.match(app, /<Route path="\/" element=\{<PublicHome \/>\}/);
  assert.equal((publicHome.match(/<PublicEntryCard/g) ?? []).length, 2);
  assert.match(publicHome, /title="Betreiber-Login" to="\/login"/);
  assert.match(publicHome, /title="Kunden-Bonus öffnen" to="\/customer"/);
  assert.match(publicHome, /productTerminology\.productTagline/);
});

test("Startseite verwendet zentrale Premium-Tokens und kompakte Mobile-Karten", () => {
  for (const token of [
    "--wux-background",
    "--wux-surface",
    "--wux-text",
    "--wux-text-secondary",
    "--wux-gold",
    "--wux-border",
    "--wux-radius-card",
    "--wux-radius-sheet",
    "--wux-shadow-card",
    "--wux-shadow-overlay",
    "--wux-motion",
    "--wux-ease",
  ]) assert.match(styles, new RegExp(token));

  assert.match(publicStyles, /@media \(max-width: 639px\)[\s\S]*\.public-premium-entry-card \{[\s\S]*grid-template-columns: 48px minmax\(0, 1fr\)[\s\S]*min-height: 0/);
  assert.doesNotMatch(publicStyles.match(/\.public-premium-entry-card \{[\s\S]*?\n\}/)?.[0] ?? "", /min-height: 250px/);
  assert.match(publicStyles, /\.public-premium-entry-card:focus-visible/);
  assert.match(publicStyles, /\.public-premium-entry-action[\s\S]*min-height: 44px/);
});

test("AppDrawer definiert compact, standard und large auf einer Basis", () => {
  assert.match(appDrawer, /size\?: "compact" \| "standard" \| "large"/);
  assert.match(appDrawer, /size = "standard"/);
  assert.match(appDrawer, /app-drawer-panel app-drawer-\$\{size\}/);
  assert.match(styles, /\.app-drawer-compact/);
  assert.match(styles, /\.app-drawer-large/);
  assert.match(styles, /\.app-drawer-handle/);
});

test("gemeinsamer Drawer hält Fokus, sperrt Scroll und schließt sicher", () => {
  assert.match(appDrawer, /aria-modal="true"/);
  assert.match(appDrawer, /role="dialog"/);
  assert.match(appDrawer, /document\.body\.style\.overflow = "hidden"/);
  assert.match(appDrawer, /event\.key === "Escape"/);
  assert.match(appDrawer, /event\.key !== "Tab"/);
  assert.match(appDrawer, /previousFocus\?\.focus/);
  assert.match(appDrawer, /dismissOnOverlay/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(styles, /env\(safe-area-inset-bottom\)/);
});

test("Owner, Customer, Staff und Plattform verwenden dieselbe Drawer-Basis", () => {
  for (const source of [adminLayout, onboarding, staff, customer, rewards, platform]) {
    assert.match(source, /AppDrawer/);
  }
  assert.doesNotMatch(adminLayout, /mobile-menu-backdrop|mobile-menu-drawer/);
  assert.doesNotMatch(onboarding, /modal-backdrop|how-modal/);
  assert.doesNotMatch(staff, /modal-backdrop|pin-modal card/);
  assert.doesNotMatch(styles, /\.modal-backdrop|\.how-modal|\.customer-info-modal/);
});

test("kritische Formulare schließen nicht über einen versehentlichen Overlay-Klick", () => {
  assert.match(rewards, /dismissOnOverlay=\{false\}/);
  assert.match(staff, /dismissOnOverlay=\{false\}/);
  assert.match(customer, /dismissOnOverlay=\{accountSheet !== "profile"\}/);
});

test("mobiles Finder-Detail nutzt Premium-Sheet-Tokens und einen echten Schließen-Button", () => {
  assert.match(finder, /aria-label="Unternehmensdetails schließen"/);
  assert.match(finder, /onClose=\{\(\) => setSelectedId\(null\)\}/);
  assert.match(finderStyles, /partner-detail-close[\s\S]*height: 44px[\s\S]*width: 44px/);
  assert.match(finderStyles, /--wux-radius-sheet/);
  assert.match(finderStyles, /--wux-shadow-overlay/);
});

test("unreferenzierte zweite globale Stylesammlung ist entfernt", () => {
  assert.equal(existsSync(new URL("../src/styles 2.css", import.meta.url)), false);
});
