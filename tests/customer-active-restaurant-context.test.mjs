import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  customerPortalInstanceKey,
  readCustomerScanContext,
} from "../src/modules/customer/customerScanContext.mjs";
import { loadPortalForRestaurant } from "../src/modules/customer/customerRedemptionSession.mjs";

const publicEntrySource = await readFile(new URL("../src/modules/public/PublicHome.tsx", import.meta.url), "utf8");
const serviceWorkerSource = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");
const tokenStorageSource = await readFile(new URL("../src/modules/customer/customerTokenStorage.ts", import.meta.url), "utf8");
const accessStorageSource = await readFile(new URL("../src/modules/customer/customerAccessStorage.mjs", import.meta.url), "utf8");

test("Restaurant A wird beim Scan von Restaurant B vollständig als aktiver Kontext ersetzt", () => {
  const contextA = readCustomerScanContext("/w/restaurant-a");
  const contextB = readCustomerScanContext("/w/restaurant-b");

  assert.equal(contextA?.restaurantSlug, "restaurant-a");
  assert.equal(contextB?.restaurantSlug, "restaurant-b");
  assert.notEqual(
    customerPortalInstanceKey(contextA, "token-a"),
    customerPortalInstanceKey(contextB, "token-a"),
  );
});

test("ein gespeicherter Kundenzugang erzeugt ohne QR-Pfad keinen Restaurantkontext", () => {
  assert.equal(readCustomerScanContext("/customer"), null);
  assert.match(publicEntrySource, /Scanne den QR-Code im Restaurant, um dein Bonusprogramm zu öffnen\./);
  assert.doesNotMatch(tokenStorageSource, /lastRestaurant|activeRestaurant|currentRestaurant/);
});

test("Kundenzugänge bleiben pro Restaurant getrennt, ohne einen aktiven Restaurantkontext zu speichern", () => {
  assert.match(accessStorageSource, /wuxuai_customer_access/);
  assert.match(accessStorageSource, /encodeURIComponent\(normalizeSlug\(restaurantSlug\)\)/);
  assert.doesNotMatch(tokenStorageSource, /restaurantSlug\s*:\s*localStorage\.getItem/);
});

test("Retry verwendet ausschließlich den beim aktuellen Scan validierten Kontext", async () => {
  const calls = [];
  const result = await loadPortalForRestaurant({
    restaurantSlug: readCustomerScanContext("/w/restaurant-b").restaurantSlug,
    customerToken: "token-b",
    maxAttempts: 2,
    wait: async () => undefined,
    loadPortal: async (restaurantSlug, customerToken) => {
      calls.push([restaurantSlug, customerToken]);
      if (calls.length === 1) throw new Error("Mobilnetz kurz unterbrochen");
      return { restaurantSlug };
    },
  });

  assert.equal(result.status, "loaded");
  assert.deepEqual(calls, [
    ["restaurant-b", "token-b"],
    ["restaurant-b", "token-b"],
  ]);
});

test("der Service Worker hält keinen Restaurant- oder Portal-Response-Cache", () => {
  assert.doesNotMatch(serviceWorkerSource, /addEventListener\(["']fetch["']/);
  assert.doesNotMatch(serviceWorkerSource, /caches\.(?:open|match)|cache\.put/);
});
