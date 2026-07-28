import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  customerAccessStorageKey,
  persistCustomerAccess,
  readCustomerAccess,
  removeCustomerAccess,
} from "../src/modules/customer/customerAccessStorage.mjs";

const portalSource = await readFile(new URL("../src/modules/customer/CustomerPortal.tsx", import.meta.url), "utf8");
const tokenStorageSource = await readFile(new URL("../src/modules/customer/customerTokenStorage.ts", import.meta.url), "utf8");
const appSource = await readFile(new URL("../src/app/App.tsx", import.meta.url), "utf8");
const identityMigration = await readFile(new URL("../supabase/migrations/20260727001000_customer_identity_v1_no_sms.sql", import.meta.url), "utf8");

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
    snapshot() { return Object.fromEntries(values); },
  };
}

test("derselbe Restaurant-QR stellt den verifizierten lokalen Zugang wieder her", () => {
  const storage = memoryStorage();
  const saved = persistCustomerAccess(storage, {
    restaurantSlug: "restaurant-a",
    customerToken: "token-a",
    deviceId: "device-a",
  }, new Date("2026-07-28T08:00:00.000Z"));

  assert.equal(saved.ok, true);
  const restored = readCustomerAccess(storage, "restaurant-a");
  assert.equal(restored.status, "found");
  assert.equal(restored.access.customer_token, "token-a");
  assert.equal(restored.access.restaurant_slug, "restaurant-a");
  assert.equal(restored.access.device_id, "device-a");
});

test("Restaurant A und B überschreiben ihre Kundenzugänge nicht", () => {
  const storage = memoryStorage();
  persistCustomerAccess(storage, { restaurantSlug: "restaurant-a", customerToken: "token-a" });
  persistCustomerAccess(storage, { restaurantSlug: "restaurant-b", customerToken: "token-b" });

  assert.equal(readCustomerAccess(storage, "restaurant-a").access.customer_token, "token-a");
  assert.equal(readCustomerAccess(storage, "restaurant-b").access.customer_token, "token-b");
  assert.notEqual(customerAccessStorageKey("restaurant-a"), customerAccessStorageKey("restaurant-b"));
});

test("Logout entfernt nur den Zugang des gewählten Restaurants", () => {
  const storage = memoryStorage();
  persistCustomerAccess(storage, { restaurantSlug: "restaurant-a", customerToken: "token-a" });
  persistCustomerAccess(storage, { restaurantSlug: "restaurant-b", customerToken: "token-b" });

  assert.equal(removeCustomerAccess(storage, "restaurant-a"), true);
  assert.equal(readCustomerAccess(storage, "restaurant-a").status, "missing");
  assert.equal(readCustomerAccess(storage, "restaurant-b").access.customer_token, "token-b");
});

test("blockierter Safari-Speicher kann nicht als erfolgreiche Persistierung gelten", () => {
  const blockedStorage = {
    getItem() { throw new Error("SecurityError"); },
    setItem() { throw new Error("QuotaExceededError"); },
    removeItem() { throw new Error("SecurityError"); },
  };

  const result = persistCustomerAccess(blockedStorage, {
    restaurantSlug: "restaurant-a",
    customerToken: "token-a",
  });
  assert.deepEqual(result, { ok: false, access: null, reason: "storage_unavailable" });
});

test("Legacy-Zugang wird restaurantbezogen in das verifizierte Format migriert", () => {
  const storage = memoryStorage({
    "wuxuai-customer-token:restaurant-a": "legacy-token-a",
  });
  const restored = readCustomerAccess(storage, "restaurant-a", new Date("2026-07-28T08:00:00.000Z"));

  assert.equal(restored.status, "found");
  assert.equal(restored.access.customer_token, "legacy-token-a");
  assert.ok(storage.snapshot()[customerAccessStorageKey("restaurant-a")]);
});

test("Portal liest den Zugang synchron vor dem ersten Load und zeigt keinen Registrierungs-Flash", () => {
  assert.match(portalSource, /useState<string \| null>\(\(\) => \([\s\S]*readStoredCustomerToken\(restaurantSlug\)/);
  assert.doesNotMatch(portalSource, /useEffect\(\(\) => \{\s*if \(!isUsableRestaurantSlug\(restaurantSlug\)\) return;\s*setStoredCustomerToken/);
  assert.match(portalSource, /LoadingState description="Dein Bonuskonto wird erkannt …"/);
  assert.match(appSource, /Dein Bonuskonto wird erkannt …/);
});

test("Registrierung wird erst nach verifizierter Speicherung als fertig angezeigt", () => {
  assert.match(portalSource, /const activeToken = customerToken \?\? storedCustomerToken;/);
  assert.match(portalSource, /const persisted = saveStoredCustomerToken\(restaurantSlug/);
  assert.match(portalSource, /if \(!persisted\) \{[\s\S]*setGuestStep\("persist"\)/);
  assert.match(portalSource, /retryPersistRegisteredAccess/);
  assert.match(portalSource, /Dein Bonuskonto wurde erstellt, konnte auf diesem Gerät aber nicht gespeichert werden/);
});

test("BFCache und Fokus validieren auch einen lokal restaurierten Zugang erneut", () => {
  assert.match(portalSource, /if \(!activeToken\) return;/);
  assert.match(portalSource, /window\.addEventListener\("pageshow", refreshFromPageCache\)/);
  assert.match(appSource, /if \(event\.persisted\) setHistoryRevision/);
});

test("serverseitige Dublettensperre bleibt restaurant- und telefonbezogen", () => {
  assert.match(identityMigration, /restaurant_id = restaurant_record\.id and normalized_phone = normalized_value/);
  assert.match(identityMigration, /pg_advisory_xact_lock/);
  assert.match(identityMigration, /CUSTOMER_DUPLICATE_ACCOUNT_BLOCKED/);
});

test("Diagnoseevents enthalten keine Zugangsdaten oder persönlichen Felder", () => {
  const diagnosticStart = tokenStorageSource.indexOf("export function emitCustomerAccessDiagnostic");
  const diagnosticEnd = tokenStorageSource.indexOf("export function readStoredCustomerAccess");
  const diagnosticImplementation = tokenStorageSource.slice(diagnosticStart, diagnosticEnd);
  for (const eventType of [
    "CUSTOMER_ACCESS_LOOKUP_STARTED",
    "CUSTOMER_ACCESS_FOUND",
    "CUSTOMER_ACCESS_NOT_FOUND",
    "CUSTOMER_ACCESS_INVALID",
    "CUSTOMER_ACCESS_PERSISTED",
    "CUSTOMER_ACCESS_PERSIST_FAILED",
    "CUSTOMER_EXISTING_MEMBERSHIP_RESTORED",
  ]) {
    assert.match(tokenStorageSource + portalSource, new RegExp(eventType));
  }
  assert.match(diagnosticImplementation, /event_type:[\s\S]*restaurant_slug:[\s\S]*occurred_at:/);
  assert.doesNotMatch(diagnosticImplementation, /customer_token|phone|birthday|authorization/i);
});
