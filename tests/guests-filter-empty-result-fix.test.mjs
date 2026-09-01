import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createGuestListState,
  filterGuestList,
  guestListStateReducer,
} from "../src/modules/admin/guestListState.mjs";

const pageSource = await readFile(
  new URL("../src/modules/admin/pages/CustomersPage.tsx", import.meta.url),
  "utf8",
);
const serviceSource = await readFile(
  new URL("../src/modules/loyalty/loyaltyService.ts", import.meta.url),
  "utf8",
);

const guestsA = [
  {
    id: "guest-a-1",
    restaurant_id: "restaurant-a",
    name: "Anna Österreicher",
    phone: "+43 **** 1234",
    customer_code: "A12345",
  },
  {
    id: "guest-a-2",
    restaurant_id: "restaurant-a",
    name: "Berta Beispiel",
    phone: "+43 **** 9876",
    customer_code: "B98765",
  },
];

test("Gäste werden ohne Suchbegriff vollständig angezeigt", () => {
  assert.deepEqual(filterGuestList(guestsA, ""), guestsA);
});

test("Suche findet Name, maskierte Telefonnummer und Gästecode", () => {
  assert.deepEqual(filterGuestList(guestsA, "Anna"), [guestsA[0]]);
  assert.deepEqual(filterGuestList(guestsA, "9876"), [guestsA[1]]);
  assert.deepEqual(filterGuestList(guestsA, "a12345"), [guestsA[0]]);
});

test("Suche behandelt Großschreibung, Umlaute und mehrere Begriffe stabil", () => {
  assert.deepEqual(filterGuestList(guestsA, "ANNA OSTERREICHER"), [guestsA[0]]);
});

test("nicht passende Suche liefert einen echten leeren Filterstand", () => {
  assert.deepEqual(filterGuestList(guestsA, "nicht vorhanden"), []);
});

test("Löschen der Suche zeigt wieder alle Gäste", () => {
  assert.equal(filterGuestList(guestsA, "Anna").length, 1);
  assert.equal(filterGuestList(guestsA, "").length, 2);
});

test("Restaurantwechsel setzt den restaurantbezogenen Suchzustand zurück", () => {
  const stateA = guestListStateReducer(createGuestListState("restaurant-a"), {
    type: "query_changed",
    restaurantId: "restaurant-a",
    query: "Anna",
  });
  const stateB = guestListStateReducer(stateA, {
    type: "restaurant_changed",
    restaurantId: "restaurant-b",
  });
  assert.deepEqual(stateB, { restaurantId: "restaurant-b", query: "" });
});

test("erneutes Rendern desselben Restaurants verändert die Suche nicht", () => {
  const state = { restaurantId: "restaurant-a", query: "Anna" };
  assert.equal(guestListStateReducer(state, {
    type: "restaurant_changed",
    restaurantId: "restaurant-a",
  }), state);
});

test("Gästeliste und optionale Support-Berechtigung laden unabhängig", () => {
  assert.match(pageSource, /loadCustomers\(restaurantId\)[\s\S]*\.then\(\(nextCustomers\)/);
  assert.match(pageSource, /canManageCustomerIdentity\(restaurantId\)[\s\S]*\.then\(\(supportAllowed\)/);
  assert.doesNotMatch(pageSource, /Promise\.all\(\[loadCustomers\(restaurantId\), canManageCustomerIdentity/);
});

test("Loading, Empty und Error sind getrennte Zustände mit Retry", () => {
  assert.match(pageSource, /loading \? \(/);
  assert.match(pageSource, /!loading && loadError \? \(/);
  assert.match(pageSource, /!loading && !loadError && filteredCustomers\.length === 0/);
  assert.match(pageSource, /Erneut versuchen/);
});

test("Tenant bleibt serverseitiger Parameter des minimierten Gäste-RPC", () => {
  assert.match(serviceSource, /list_restaurant_customers_safe/);
  assert.match(serviceSource, /input_restaurant_id: restaurantId/);
  assert.doesNotMatch(serviceSource, /\.from\("customers"\)/);
  assert.match(pageSource, /supportCustomer\.restaurant_id === restaurantId/);
});
