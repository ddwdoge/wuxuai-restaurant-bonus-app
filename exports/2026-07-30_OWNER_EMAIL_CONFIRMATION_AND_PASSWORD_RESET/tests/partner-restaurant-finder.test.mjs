import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  distanceInKilometers,
  filterPartnerRestaurants,
  googleMapsUrl,
  markerStatus,
  sortPartnerRestaurants,
} from "../src/modules/customer/partnerRestaurantFinder.mjs";

const locations = [
  { name: "WUXING Mödling", address: "Hauptstraße 1", postal_code: "2340", city: "Mödling" },
  { name: "WUXING Wien", address: "Ring 2", postal_code: "1010", city: "Wien" },
];

test("Partnerfinder sucht nach Name, Ort, PLZ und Adresse ohne Großschreibung oder Umlautzwang", () => {
  assert.equal(filterPartnerRestaurants(locations, "wuxing").length, 2);
  assert.equal(filterPartnerRestaurants(locations, "Wien")[0].postal_code, "1010");
  assert.equal(filterPartnerRestaurants(locations, "2340")[0].city, "Mödling");
  assert.equal(filterPartnerRestaurants(locations, "modling")[0].name, "WUXING Mödling");
  assert.equal(filterPartnerRestaurants(locations, "Hauptstraße")[0].postal_code, "2340");
  assert.deepEqual(filterPartnerRestaurants(locations, "Graz"), []);
});

test("Entfernung wird lokal als Luftlinie berechnet", () => {
  const distance = distanceInKilometers(
    { latitude: 48.2082, longitude: 16.3738 },
    { latitude: 48.086, longitude: 16.289 },
  );
  assert.ok(distance > 14 && distance < 16);
});

test("Empfehlungen priorisieren verfügbare Rewards und danach fehlende Punkte", () => {
  const sorted = sortPartnerRestaurants([
    { name: "C", membership: null, distance_km: 1 },
    { name: "B", membership: { available_rewards: [], next_reward: { missing_points: 5 }, last_visit_at: null }, distance_km: 9 },
    { name: "A", membership: { available_rewards: [{ id: "reward", expires_at: "2026-07-24T00:00:00Z" }], next_reward: null, last_visit_at: null }, distance_km: 20 },
  ]);
  assert.deepEqual(sorted.map((item) => item.name), ["A", "B", "C"]);
});

test("Google Maps Links benötigen keinen API-Key und kodieren Koordinaten sicher", () => {
  const searchUrl = new URL(googleMapsUrl({ latitude: 48.2, longitude: 16.3 }, "search"));
  const directionsUrl = new URL(googleMapsUrl({ latitude: 48.2, longitude: 16.3 }, "directions"));
  assert.equal(searchUrl.origin, "https://www.google.com");
  assert.equal(searchUrl.searchParams.get("query"), "48.2,16.3");
  assert.equal(directionsUrl.searchParams.get("destination"), "48.2,16.3");
  assert.equal(searchUrl.searchParams.has("key"), false);
});

test("Markerstatus bleibt zusätzlich zur Farbe semantisch ableitbar", () => {
  assert.equal(markerStatus({ membership: null }), "partner");
  assert.equal(markerStatus({ membership: { registered: true, points_balance: 0, available_rewards: [] } }), "registered");
  assert.equal(markerStatus({ membership: { registered: true, points_balance: 25, available_rewards: [] } }), "member");
  assert.equal(markerStatus({ membership: { registered: true, points_balance: 0, available_rewards: [], next_reward: { missing_points: 12 } } }), "near");
  assert.equal(markerStatus({ membership: { registered: true, points_balance: 25, available_rewards: [{}] } }), "reward");
});

test("Public RPC veröffentlicht nur explizit freigegebene aktive Standorte", async () => {
  const migration = await readFile(new URL("../supabase/migrations/20260723001000_partner_restaurant_finder.sql", import.meta.url), "utf8");
  assert.match(migration, /b\.is_discoverable = true/);
  assert.match(migration, /r\.status = 'active'/);
  assert.match(migration, /b\.status = 'active'/);
  assert.match(migration, /b\.latitude between -90 and 90/);
  assert.match(migration, /b\.longitude between -180 and 180/);
  assert.match(migration, /revoke all on function public\.get_public_partner_restaurants\(\) from public/);
  assert.doesNotMatch(migration, /create policy[\s\S]*for select[\s\S]*to anon/i);
});

test("Mitgliedsstatus bindet Token und Restaurant serverseitig", async () => {
  const migration = await readFile(new URL("../supabase/migrations/20260723001000_partner_restaurant_finder.sql", import.meta.url), "utf8");
  assert.match(migration, /cqt\.restaurant_id = restaurant_record\.id/);
  assert.match(migration, /cqt\.token_hash = public\.hash_public_token\(input_customer_token\)/);
  assert.match(migration, /c\.restaurant_id = cqt\.restaurant_id/);
  assert.match(migration, /'registered', false/);
});
