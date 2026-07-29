import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  customerAccessStorageKey,
  persistCustomerAccess,
  readCustomerAccess,
  removeCustomerAccess,
} from "../src/modules/customer/customerAccessStorage.mjs";
import {
  CustomerAccessError,
  CUSTOMER_ACCESS_FAILURE_REASONS,
  isPermanentCustomerAccessError,
} from "../src/modules/customer/customerAccessErrors.mjs";

const portalSource = await readFile(new URL("../src/modules/customer/CustomerPortal.tsx", import.meta.url), "utf8");
const tokenStorageSource = await readFile(new URL("../src/modules/customer/customerTokenStorage.ts", import.meta.url), "utf8");
const appSource = await readFile(new URL("../src/app/App.tsx", import.meta.url), "utf8");
const identityMigration = await readFile(new URL("../supabase/migrations/20260727001000_customer_identity_v1_no_sms.sql", import.meta.url), "utf8");
const deviceMigration = await readFile(new URL("../supabase/migrations/20260704242000_flow_05_device_referral_abuse_protection.sql", import.meta.url), "utf8");
const portalMigration = await readFile(new URL("../supabase/migrations/20260726002000_reward_image_crop_metadata.sql", import.meta.url), "utf8");
const accessHardeningMigration = await readFile(new URL("../supabase/migrations/20260729001000_customer_repeat_qr_access_hardening.sql", import.meta.url), "utf8");

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

test("temporäre Netzwerkfehler entfernen den restaurantbezogenen Zugang nicht", () => {
  const storage = memoryStorage();
  persistCustomerAccess(storage, { restaurantSlug: "restaurant-a", customerToken: "token-a" });

  for (const error of [
    new TypeError("Failed to fetch"),
    { code: "ETIMEDOUT", message: "Zeitüberschreitung" },
    { code: "503", message: "Service unavailable" },
    new Error("Unbekannter temporärer Fehler"),
  ]) {
    assert.equal(isPermanentCustomerAccessError(error), false);
  }

  assert.equal(readCustomerAccess(storage, "restaurant-a").access.customer_token, "token-a");
});

test("nur strukturierte dauerhafte Zugangsfehler erlauben die lokale Entfernung", () => {
  for (const reason of Object.values(CUSTOMER_ACCESS_FAILURE_REASONS)) {
    const error = new CustomerAccessError(reason, "Zugang kann nicht verwendet werden.");
    assert.equal(isPermanentCustomerAccessError(error), true);
  }

  assert.equal(isPermanentCustomerAccessError({ code: "PGRST301", message: "JWT expired" }), false);
  assert.equal(isPermanentCustomerAccessError({ code: "P0001", message: "customer token not valid" }), true);
});

test("device_id allein ist kein Kundenzugang und stellt keinen Token aus", () => {
  assert.match(deviceMigration, /resolve_customer_from_public_token\([\s\S]*input_customer_token text/);
  assert.doesNotMatch(deviceMigration, /create or replace function public\.[^(]*(?:device|customer)[^(]*\(\s*input_device_id text\s*\)[\s\S]*customer_qr_token/i);
  assert.doesNotMatch(identityMigration, /select[\s\S]{0,500}from public\.customer_devices[\s\S]{0,500}new_customer_token/i);
});

test("Telefonnummer oder Geburtstag allein öffnen kein bestehendes Konto", () => {
  const guardStart = identityMigration.indexOf("create or replace function public.prepare_customer_registration");
  const guardEnd = identityMigration.indexOf("create or replace function public.register_restaurant_customer_legal", guardStart);
  const guard = identityMigration.slice(guardStart, guardEnd);
  assert.match(guard, /CUSTOMER_ACCOUNT_EXISTS/);
  assert.match(guard, /known_device_required/);
  assert.doesNotMatch(guard, /customer_qr_token|new_customer_token/);
  assert.doesNotMatch(guard, /birthday/);
});

test("fremder Restauranttoken ist durch Restaurant und Tokenhash gebunden", () => {
  assert.match(portalMigration, /cqt\.restaurant_id = restaurant_record\.id/);
  assert.match(portalMigration, /cqt\.token_hash = public\.hash_public_token\(input_customer_token\)/);
  assert.match(portalMigration, /c\.restaurant_id = restaurant_record\.id/);
});

test("zweiter Registrierungsversuch blockiert vor Tokenausstellung und widerruft kein erstes Gerät", () => {
  const registrationStart = identityMigration.indexOf("create or replace function public.register_restaurant_customer_legal");
  const registrationEnd = identityMigration.indexOf("create or replace function public.register_referral_customer_legal", registrationStart);
  const registration = identityMigration.slice(registrationStart, registrationEnd);
  const guardCall = registration.indexOf("prepare_customer_registration");
  const blockedReturn = registration.indexOf("return jsonb_build_object('success', false", guardCall);
  const underlyingRegistration = registration.indexOf("register_restaurant_customer(", guardCall);

  assert.ok(guardCall >= 0);
  assert.ok(blockedReturn > guardCall);
  assert.ok(underlyingRegistration > blockedReturn);
  assert.doesNotMatch(registration.slice(guardCall, underlyingRegistration), /customer_qr_tokens set active = false/);
});

test("Portalzugang verlangt Restaurant, geheimen Token und aktive Membership", () => {
  assert.match(accessHardeningMigration, /t\.restaurant_id = restaurant_id_value/);
  assert.match(accessHardeningMigration, /t\.token_hash = public\.hash_public_token\(input_customer_token\)/);
  assert.match(accessHardeningMigration, /membership_status_value is distinct from 'active'/);
  assert.doesNotMatch(accessHardeningMigration, /input_device_id|customer_devices/);
});

test("Backend liefert nur die freigegebenen strukturierten dauerhaften Zugangsgründe", () => {
  assert.match(accessHardeningMigration, /message = 'CUSTOMER_ACCESS_TOKEN_INVALID'/);
  assert.match(accessHardeningMigration, /message = 'CUSTOMER_ACCESS_TOKEN_REVOKED'/);
  assert.match(accessHardeningMigration, /message = 'CUSTOMER_MEMBERSHIP_INACTIVE'/);
  assert.match(accessHardeningMigration, /revoke execute on function public\.get_public_customer_portal_unchecked\(text, text\)[\s\S]*from public, anon, authenticated/);
  assert.match(accessHardeningMigration, /grant execute on function public\.get_public_customer_portal\(text, text\) to anon, authenticated/);
});
