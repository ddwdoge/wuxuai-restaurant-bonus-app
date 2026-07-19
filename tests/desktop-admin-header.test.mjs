import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const adminLayout = readFileSync(new URL("../src/modules/admin/AdminLayout.tsx", import.meta.url), "utf8");
const tenantSwitcher = readFileSync(new URL("../src/modules/tenant/TenantSwitcher.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

test("Desktop-Header zeigt Status, Restaurant und Profil als gemeinsame Gruppe", () => {
  assert.match(adminLayout, /className="topbar-actions"/);
  assert.match(adminLayout, /restaurant-status-badge/);
  assert.match(adminLayout, /restaurant-status-dot/);
  assert.match(adminLayout, /<TenantSwitcher \/>/);
  assert.match(adminLayout, /profile-menu desktop-profile-menu/);
  assert.match(adminLayout, /profile-menu-avatar/);
  assert.match(adminLayout, /profile-menu-role/);
});

test("Status und Restaurantrolle stammen aus vorhandenen Laufzeitdaten", () => {
  assert.match(adminLayout, /activeRestaurant\?\.status/);
  assert.match(adminLayout, /restaurantRoleLabels\[restaurantRole\]/);
  assert.match(adminLayout, /owner: "Owner"/);
  assert.match(adminLayout, /manager: "Manager"/);
  assert.match(adminLayout, /staff: "Mitarbeiter"/);
  assert.match(adminLayout, /user\?\.user_metadata\?\.full_name/);
});

test("Restaurantwechsel und Profilmenü bleiben funktional verbunden", () => {
  assert.match(tenantSwitcher, /onChange=\{\(event\) => setActiveRestaurantId\(event\.target\.value\)\}/);
  assert.match(adminLayout, /onClick=\{\(\) => setProfileMenuOpen/);
  assert.match(adminLayout, /onClick=\{handleLogout\}/);
});

test("Neue Header-Gestaltung greift ausschließlich ab 1024 Pixeln", () => {
  assert.match(styles, /@media \(min-width: 1024px\) \{[\s\S]*\.restaurant-status-badge/);
  assert.match(styles, /@media \(min-width: 1024px\) \{[\s\S]*\.tenant-switcher-field/);
  assert.match(styles, /@media \(min-width: 1024px\) \{[\s\S]*\.profile-menu-trigger/);
  assert.match(styles, /@media \(max-width: 1023px\) \{[\s\S]*\.desktop-profile-menu \{\s*display: none;/);
  assert.match(styles, /@media \(max-width: 1023px\) \{[\s\S]*\.button\.mobile-menu-button \{\s*display: inline-flex;/);
});

test("Lange Restaurant- und Profiltexte sind gegen Überlauf abgesichert", () => {
  assert.match(styles, /\.admin-restaurant-brand \.restaurant-brand-title \{[\s\S]*text-overflow: ellipsis;[\s\S]*white-space: nowrap;/);
  assert.match(styles, /\.profile-menu-label \{[\s\S]*text-overflow: ellipsis;[\s\S]*white-space: nowrap;/);
  assert.match(styles, /\.tenant-switcher-field \.select \{[\s\S]*text-overflow: ellipsis;[\s\S]*white-space: nowrap;/);
});
