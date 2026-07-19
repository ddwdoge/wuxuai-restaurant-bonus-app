import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const drawer = readFileSync(new URL("../src/shared/components/AppDrawer.tsx", import.meta.url), "utf8");
const rewardsPage = readFileSync(new URL("../src/modules/admin/pages/RewardsPage.tsx", import.meta.url), "utf8");
const welcomeGiftsPage = readFileSync(new URL("../src/modules/admin/pages/WelcomeGiftsPage.tsx", import.meta.url), "utf8");
const dashboard = readFileSync(new URL("../src/modules/admin/pages/AdminDashboard.tsx", import.meta.url), "utf8");
const staffPage = readFileSync(new URL("../src/modules/admin/pages/StaffPage.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

test("AppDrawer besitzt Dialogsemantik und zentrale Schließwege", () => {
  assert.match(drawer, /createPortal/);
  assert.match(drawer, /aria-modal="true"/);
  assert.match(drawer, /role="dialog"/);
  assert.match(drawer, /event\.key === "Escape"/);
  assert.match(drawer, /event\.target === event\.currentTarget/);
  assert.match(drawer, /aria-label="Ansicht schließen"/);
});

test("AppDrawer hält den Fokus und gibt ihn beim Schließen zurück", () => {
  assert.match(drawer, /event\.key !== "Tab"/);
  assert.match(drawer, /focusableElements\[0\]/);
  assert.match(drawer, /focusableElements\[focusableElements\.length - 1\]/);
  assert.match(drawer, /previousFocus\?\.focus/);
  assert.match(drawer, /document\.body\.style\.overflow = "hidden"/);
});

test("Punkteeinlösungen und Willkommensgeschenke bearbeiten im gemeinsamen Drawer", () => {
  assert.match(rewardsPage, /<AppDrawer[\s\S]*title="Punkteeinlösung bearbeiten"/);
  assert.match(rewardsPage, /editingOffer\?\.id === offer\.id \? " drawer-active"/);
  assert.match(welcomeGiftsPage, /<AppDrawer[\s\S]*title="Willkommensgeschenk bearbeiten"/);
  assert.match(welcomeGiftsPage, /editing\?\.id === gift\.id \? " drawer-active"/);
  assert.doesNotMatch(welcomeGiftsPage, /scrollIntoView/);
});

test("Bestehende Speicher- und Datenlogik bleibt verbunden", () => {
  assert.match(rewardsPage, /saveRewardOffer\(/);
  assert.match(rewardsPage, /loadRewardOffers\(restaurantId\)/);
  assert.match(welcomeGiftsPage, /saveRewardOffer\(/);
  assert.match(welcomeGiftsPage, /loadRewardOffers\(restaurantId\)/);
  assert.match(welcomeGiftsPage, /form="welcome-gift-editor-form"/);
});

test("Informations-KPIs bleiben nicht klickbar und echte Navigation bleibt erhalten", () => {
  assert.match(dashboard, /<article className="card dashboard-kpi-card"/);
  assert.doesNotMatch(dashboard, /dashboard-kpi-card[^\n]*onClick/);
  assert.match(staffPage, /className="card staff-admin-card"/);
  assert.match(staffPage, /className="card staff-admin-card staff-admin-card-clickable"/);
  assert.match(staffPage, /to=\{staffTabletPath\}/);
});

test("Drawer ist auf Desktop, Tablet und Mobil begrenzt", () => {
  assert.match(styles, /width: clamp\(420px, 38vw, 520px\)/);
  assert.match(styles, /@media \(min-width: 768px\) and \(max-width: 1023px\)/);
  assert.match(styles, /max-width: 80vw/);
  assert.match(styles, /@media \(max-width: 767px\)[\s\S]*\.app-drawer-panel \{[\s\S]*width: 100%/);
  assert.match(styles, /overflow-y: auto/);
  assert.match(styles, /grid-template-rows: auto minmax\(0, 1fr\) auto/);
});
