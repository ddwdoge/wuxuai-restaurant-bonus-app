import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const app = readFileSync(new URL("../src/app/App.tsx", import.meta.url), "utf8");
const portal = readFileSync(new URL("../src/modules/customer/CustomerPortal.tsx", import.meta.url), "utf8");
const storage = readFileSync(new URL("../src/modules/customer/customerTokenStorage.ts", import.meta.url), "utf8");
const loyalty = readFileSync(new URL("../src/modules/loyalty/loyaltyService.ts", import.meta.url), "utf8");
const pointsMigration = readFileSync(new URL("../supabase/migrations/20260720002000_persist_pin_and_points_failures.sql", import.meta.url), "utf8");

test("ein neuer QR-Slug erzeugt eine neue CustomerPortal-Instanz", () => {
  assert.match(app, /function CustomerPortalRoute\(\)/);
  assert.match(app, /<CustomerPortal key={`\$\{routeKind\}:\$\{slug\}:\$\{customerToken\}`} \/>/);
  assert.match(app, /path="\/customer\/:slug" element={<CustomerPortalRoute \/>}/);
  assert.match(app, /path="\/w\/:slug" element={<CustomerPortalRoute \/>}/);
});

test("der aktuelle URL-Slug ist die einzige Restaurantquelle", () => {
  assert.match(portal, /const restaurantSlug = slug\?\.trim\(\) \?\? "";/);
  assert.doesNotMatch(portal, /slug \?\? restaurant\?\.slug/);
  assert.match(portal, /loadPortalForRestaurant\(\{[\s\S]*?restaurantSlug,[\s\S]*?customerToken: activeToken,[\s\S]*?loadPortal: loadCustomerPortalData/);
});

test("ein URL-Token gewinnt vor Registrierung und lokalem Cache", () => {
  assert.match(portal, /const activeToken = customerToken \?\? registration\?\.customer\.customer_qr_token \?\? storedCustomerToken;/);
});

test("lokal gespeicherte Kundentokens sind nach Restaurant-Slug getrennt", () => {
  assert.match(storage, /storedTokens\[restaurantSlug\]\?\.customer_token/);
  assert.match(storage, /wuxuai-customer-token:\$\{restaurantSlug\}/);
  assert.doesNotMatch(storage, /lastRestaurant|activeRestaurant|currentRestaurant/);
});

test("Punkte werden mit dem aktuell validierten URL-Slug gebucht", () => {
  assert.match(portal, /collectBonusPoints\(\{[\s\S]*?restaurantSlug,[\s\S]*?customerToken: activeToken/);
  assert.match(loyalty, /input_restaurant_slug: input\.restaurantSlug/);
});

test("die Punkte-RPC bindet Kundentoken und Kunde an das URL-Restaurant", () => {
  assert.match(pointsMigration, /where slug = trim\(input_restaurant_slug\) and status = 'active'/);
  assert.match(pointsMigration, /cqt\.restaurant_id = restaurant_record\.id and cqt\.token_hash = token_hash_value/);
  assert.match(pointsMigration, /c\.restaurant_id = restaurant_record\.id/);
});

test("ungültiger QR-Kontext kann nicht auf ein altes Restaurant zurückfallen", () => {
  assert.match(portal, /setRestaurant\(data\.restaurant\)/);
  assert.match(portal, /setRestaurant\(null\)/);
  assert.match(portal, /setBranding\(null\)/);
  assert.match(portal, /setSettings\(null\)/);
  assert.match(portal, /setCustomer\(null\)/);
  assert.match(portal, /setRewards\(\[\]\)/);
  assert.doesNotMatch(portal, /restaurant\?\.slug \?\?/);
});

test("aktive Einlösungen verwenden den gescopten Restore-Service", () => {
  assert.match(portal, /restoreScopedActiveRedemption\(window\.sessionStorage/);
  assert.match(portal, /persistScopedActiveRedemption\(window\.sessionStorage/);
  assert.match(portal, /removeScopedActiveRedemption\(window\.sessionStorage/);
  assert.doesNotMatch(portal, /wuxuai-active-redemption:\$\{restaurantSlug\}/);
});
