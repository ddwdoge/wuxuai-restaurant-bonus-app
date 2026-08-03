import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  distanceInKilometers,
  filterPartnerRestaurants,
  filterPartnerRestaurantsByCategory,
  googleMapsUrl,
  isRewardNear,
  markerStatus,
  rewardProgressPercent,
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
  assert.equal(markerStatus({ membership: { registered: true, points_balance: 70, available_rewards: [], next_reward: { required_points: 100, missing_points: 30 } } }), "near");
  assert.equal(markerStatus({ membership: { registered: true, points_balance: 25, available_rewards: [{}] } }), "reward");
  assert.equal(markerStatus({ opening_status: { isOpen: false }, membership: null }), "closed");
  assert.equal(markerStatus({ opening_status: { isOpen: false }, membership: { registered: true, points_balance: 25, available_rewards: [{}] } }), "reward");
});

test("Belohnung bald erreichbar verwendet verbindlich mindestens 70 Prozent", () => {
  const near = { membership: { registered: true, points_balance: 70, available_rewards: [], next_reward: { required_points: 100 } } };
  const below = { membership: { registered: true, points_balance: 69, available_rewards: [], next_reward: { required_points: 100 } } };
  assert.equal(rewardProgressPercent(near), 70);
  assert.equal(isRewardNear(near), true);
  assert.equal(isRewardNear(below), false);
});

test("V1-Filter trennen Besuche, Punkte, Reward-Nähe, Öffnung und Standort", () => {
  const filterLocations = [
    { name: "Besucht", distance_km: 1, opening_status: { isOpen: true }, membership: { registered: true, visits_count: 2, points_balance: 70, available_rewards: [], next_reward: { required_points: 100 } } },
    { name: "Punkte", distance_km: null, opening_status: { isOpen: false }, membership: { registered: true, visits_count: 0, points_balance: 10, available_rewards: [], next_reward: { required_points: 100 } } },
    { name: "Neu", distance_km: 4, opening_status: { isOpen: true }, membership: null },
  ];
  assert.deepEqual(filterPartnerRestaurantsByCategory(filterLocations, "visited").map((item) => item.name), ["Besucht"]);
  assert.deepEqual(filterPartnerRestaurantsByCategory(filterLocations, "points").map((item) => item.name), ["Besucht", "Punkte"]);
  assert.deepEqual(filterPartnerRestaurantsByCategory(filterLocations, "near_reward").map((item) => item.name), ["Besucht"]);
  assert.deepEqual(filterPartnerRestaurantsByCategory(filterLocations, "open").map((item) => item.name), ["Besucht", "Neu"]);
  assert.deepEqual(filterPartnerRestaurantsByCategory(filterLocations, "nearby").map((item) => item.name), ["Besucht", "Neu"]);
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

test("Aggregierter V1-Finder ersetzt N+1 und liefert einen begrenzten Payload", async () => {
  const migration = await readFile(new URL("../supabase/migrations/20260803004000_aggregate_partner_local_finder.sql", import.meta.url), "utf8");
  const service = await readFile(new URL("../src/modules/customer/partnerRestaurantService.ts", import.meta.url), "utf8");
  assert.match(migration, /create or replace function public\.get_partner_local_finder/);
  assert.match(migration, /least\(coalesce\(input_limit, 100\), 100\)/);
  assert.match(migration, /access_token\.token_hash = public\.hash_public_token\(token\.customer_token\)/);
  assert.match(migration, /customer\.membership_status = 'active'/);
  assert.match(service, /rpc\("get_partner_local_finder"/);
  assert.doesNotMatch(service, /Promise\.all\(locations\.map|rpc\("get_customer_partner_membership"/);
  assert.match(service, /hasCustomerAccess: locations\.some\(\(location\) => location\.membership\?\.registered === true\)/);
});

test("Finder veröffentlicht nur aktive, vollständige und nicht beendete Programme", async () => {
  const migration = await readFile(new URL("../supabase/migrations/20260803004000_aggregate_partner_local_finder.sql", import.meta.url), "utf8");
  assert.match(migration, /r\.status = 'active'/);
  assert.match(migration, /ls\.active = true/);
  assert.match(migration, /r\.operational_ready = true/);
  assert.match(migration, /r\.legal_ready = true/);
  assert.match(migration, /r\.security_ready = true/);
  assert.match(migration, /b\.is_discoverable = true/);
  assert.match(migration, /termination\.status = 'completed'/);
  assert.match(migration, /termination\.last_points_earning_at <= now\(\)/);
});

test("Finder-Payload enthält keine PII oder Kundenzugänge", async () => {
  const migration = await readFile(new URL("../supabase/migrations/20260803004000_aggregate_partner_local_finder.sql", import.meta.url), "utf8");
  const responseShape = migration.slice(migration.indexOf("select jsonb_build_object("), migration.indexOf("revoke all on function"));
  assert.doesNotMatch(responseShape, /'phone'|'birthday'|'customer_token'|'device_id'|'token_hash'/);
  assert.match(migration, /revoke all on function public\.get_partner_local_finder[\s\S]*from public/);
  assert.match(migration, /grant execute on function public\.get_partner_local_finder[\s\S]*to anon, authenticated/);
  assert.doesNotMatch(migration, /create policy|disable row level security/i);
});

test("Kundenseite verwendet V1-Titel, sechs Filter und sichere Aktionen", async () => {
  const page = await readFile(new URL("../src/modules/customer/PartnerRestaurantFinderPage.tsx", import.meta.url), "utf8");
  for (const label of ["Lokale entdecken", "In meiner Nähe", "Bereits besucht", "Meine Punkte", "Belohnung bald erreichbar", "Jetzt geöffnet", "Alle Partner"]) {
    assert.match(page, new RegExp(label));
  }
  assert.match(page, />Bonus öffnen</);
  assert.match(page, /Route starten/);
  assert.match(page, /Melde dich an, um deine Punkte bei teilnehmenden Lokalen zu sehen/);
  assert.doesNotMatch(page, /result\.locations\[0\]\?\.branch_id/);
});
