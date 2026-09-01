import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  customerPortalInstanceKey,
  readCustomerScanContext,
} from "../src/modules/customer/customerScanContext.mjs";

const app = readFileSync(new URL("../src/app/App.tsx", import.meta.url), "utf8");
const portal = readFileSync(new URL("../src/modules/customer/CustomerPortal.tsx", import.meta.url), "utf8");
const storage = readFileSync(new URL("../src/modules/customer/customerTokenStorage.ts", import.meta.url), "utf8");
const accessStorage = readFileSync(new URL("../src/modules/customer/customerAccessStorage.mjs", import.meta.url), "utf8");
const loyalty = readFileSync(new URL("../src/modules/loyalty/loyaltyService.ts", import.meta.url), "utf8");
const pointsMigration = readFileSync(new URL("../supabase/migrations/20260720002000_persist_pin_and_points_failures.sql", import.meta.url), "utf8");

test("ein neuer QR-Slug erzeugt eine neue CustomerPortal-Instanz", () => {
  const restaurantA = readCustomerScanContext("/w/restaurant-a");
  const restaurantB = readCustomerScanContext("/w/restaurant-b");

  assert.deepEqual(restaurantA, { restaurantSlug: "restaurant-a", routeKind: "collect" });
  assert.deepEqual(restaurantB, { restaurantSlug: "restaurant-b", routeKind: "collect" });
  assert.notEqual(
    customerPortalInstanceKey(restaurantA, "customer-token", 0),
    customerPortalInstanceKey(restaurantB, "customer-token", 0),
  );
  assert.match(app, /function CustomerPortalRoute\(\)/);
  assert.match(app, /key=\{customerPortalInstanceKey\(scanContext, customerToken, historyRevision\)\}/);
  assert.match(app, /path="\/customer\/:slug" element={<CustomerPortalRoute \/>}/);
  assert.match(app, /path="\/w\/:slug" element={<CustomerPortalRoute \/>}/);
});

test("der aktuelle URL-Slug ist die einzige Restaurantquelle", () => {
  assert.match(app, /const scanContext = readCustomerScanContext\(location\.pathname\);/);
  assert.match(app, /restaurantSlug=\{scanContext\.restaurantSlug\}/);
  assert.match(portal, /export function CustomerPortal\(\{ entryMessage, isBonusCollection, restaurantSlug \}: CustomerPortalProps\)/);
  assert.doesNotMatch(portal, /useParams|useLocation/);
  assert.doesNotMatch(portal, /slug \?\? restaurant\?\.slug/);
  assert.match(portal, /loadPortalForRestaurant\(\{[\s\S]*?restaurantSlug,[\s\S]*?customerToken: activeToken,[\s\S]*?loadPortal: loadCustomerPortalData/);
});

test("ohne aktuellen Restaurantpfad existiert kein Restaurantkontext", () => {
  assert.equal(readCustomerScanContext("/"), null);
  assert.equal(readCustomerScanContext("/customer"), null);
  assert.equal(readCustomerScanContext("/customer/restaurants"), null);
  assert.equal(readCustomerScanContext("/w/"), null);
  assert.equal(readCustomerScanContext("/w/restaurant%20a"), null);
  assert.match(app, /if \(!scanContext\) return <Navigate to="\/customer" replace \/>/);
});

test("Reload und Browser-History verwenden ausschließlich den aktuellen URL-Kontext", () => {
  const firstLoad = readCustomerScanContext("/customer/restaurant-a");
  const reload = readCustomerScanContext("/customer/restaurant-a");
  const forwardToB = readCustomerScanContext("/customer/restaurant-b");

  assert.deepEqual(reload, firstLoad);
  assert.equal(forwardToB?.restaurantSlug, "restaurant-b");
  assert.match(app, /window\.addEventListener\("pageshow", handlePageShow\)/);
  assert.match(app, /if \(event\.persisted\) setHistoryRevision/);
});

test("ein URL-Token gewinnt vor dem restaurantbezogenen lokalen Zugang", () => {
  assert.match(portal, /const activeToken = customerToken \?\? storedCustomerToken;/);
  assert.doesNotMatch(portal, /const activeToken =[^;]*registration/);
});

test("lokal gespeicherte Kundentokens sind nach Restaurant-Slug getrennt", () => {
  assert.match(accessStorage, /wuxuai_customer_access/);
  assert.match(accessStorage, /restaurant_slug:\s*slug/);
  assert.match(storage, /readCustomerAccess\(window\.localStorage, restaurantSlug\)/);
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
  assert.match(portal, /removeScopedActiveRedemption\(window\.sessionStorage/);
  assert.match(portal, /loadCustomerGiftPresentation\(/);
  assert.match(portal, /loadCustomerPointsPresentation\(/);
  assert.doesNotMatch(portal, /wuxuai-active-redemption:\$\{restaurantSlug\}/);
});
