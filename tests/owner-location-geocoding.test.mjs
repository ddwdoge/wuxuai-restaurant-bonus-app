import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildNominatimSearchUrl,
  hashOwnerAddress,
  normalizeNominatimResults,
  normalizeOwnerAddress,
} from "../supabase/functions/_shared/ownerGeocoding.mjs";

test("Geschäftsadresse wird begrenzt, normalisiert und sicher kodiert", async () => {
  const address = normalizeOwnerAddress({
    address: "  Kärntner   Straße  1 ",
    postalCode: " 1010 ",
    city: " Wien ",
    country: "at",
  });
  assert.deepEqual(address, {
    address: "Kärntner Straße 1",
    postalCode: "1010",
    city: "Wien",
    country: "AT",
    query: "Kärntner Straße 1, 1010 Wien, AT",
  });
  const url = buildNominatimSearchUrl(address);
  assert.equal(url.origin, "https://nominatim.openstreetmap.org");
  assert.equal(url.pathname, "/search");
  assert.equal(url.searchParams.get("q"), address.query);
  assert.equal(url.searchParams.get("countrycodes"), "at");
  assert.equal(url.searchParams.get("limit"), "5");
  assert.equal((await hashOwnerAddress(address)).length, 64);
});

test("Unvollständige und ungültige Adressen werden vor dem Provider-Aufruf abgelehnt", () => {
  assert.throws(() => normalizeOwnerAddress({ address: "", postalCode: "1010", city: "Wien", country: "AT" }), /ADDRESS_INCOMPLETE/);
  assert.throws(() => normalizeOwnerAddress({ address: "Ring 1", postalCode: "1010", city: "Wien", country: "Austria" }), /ADDRESS_INCOMPLETE/);
});

test("Nominatim-Ergebnisse werden validiert, dedupliziert und auf öffentliche Standortfelder reduziert", () => {
  const fallback = normalizeOwnerAddress({ address: "Ring 1", postalCode: "1010", city: "Wien", country: "AT" });
  const results = normalizeNominatimResults([
    { lat: "48.208174", lon: "16.373819", display_name: "Ring 1, Wien", address: { road: "Ring", house_number: "1", postcode: "1010", city: "Wien", country_code: "at" }, licence: "nicht übernehmen" },
    { lat: "48.208174", lon: "16.373819", display_name: "Duplikat" },
    { lat: "999", lon: "16", display_name: "Ungültig" },
  ], fallback);
  assert.equal(results.length, 1);
  assert.deepEqual(results[0], {
    latitude: 48.208174,
    longitude: 16.373819,
    displayName: "Ring 1, Wien",
    address: "Ring 1",
    postalCode: "1010",
    city: "Wien",
    country: "AT",
  });
  assert.equal("licence" in results[0], false);
});

test("Edge Function prüft Auth und Tenant vor festem Nominatim-Aufruf", async () => {
  const edge = await readFile(new URL("../supabase/functions/owner-location-geocode/index.ts", import.meta.url), "utf8");
  assert.match(edge, /adminClient\.auth\.getUser\(token\)/);
  assert.match(edge, /\.from\("restaurant_members"\)/);
  assert.match(edge, /\.eq\("restaurant_id", restaurantId\)/);
  assert.match(edge, /\.eq\("user_id", userData\.user\.id\)/);
  assert.match(edge, /\.in\("role", \["owner", "admin"\]\)/);
  assert.match(edge, /fetch\(buildNominatimSearchUrl\(address\)/);
  assert.doesNotMatch(edge, /body\.(endpoint|provider|url)|restaurantId.*searchParams|userData\.user\.(email|phone)/);
  assert.match(edge, /WUXUAI-Bonus\/1\.0 \(\+https:\/\/bonus\.wuxuaisbi\.com\)/);
  assert.match(edge, /claim_owner_geocoding_provider_slot/);
  assert.match(edge, /owner_geocoding_cache/);
});

test("DB-Vertrag begrenzt Nominatim global und bleibt für Browserrollen geschlossen", async () => {
  const migration = await readFile(new URL("../supabase/migrations/20260823001000_owner_location_geocoding_cache.sql", import.meta.url), "utf8");
  assert.match(migration, /alter table public\.owner_geocoding_cache enable row level security/);
  assert.match(migration, /revoke all on table public\.owner_geocoding_cache from anon, authenticated/);
  assert.match(migration, /next_allowed_at = statement_timestamp\(\) \+ interval '1\.1 seconds'/);
  assert.match(migration, /security definer[\s\S]*set search_path = pg_catalog, public/);
  assert.match(migration, /revoke all on function public\.claim_owner_geocoding_provider_slot\(\) from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.claim_owner_geocoding_provider_slot\(\) to service_role/);
  assert.doesNotMatch(migration, /disable row level security|grant .* to anon|grant .* to authenticated/i);
});

test("Owner UI sucht nur auf Klick und verwirft Koordinaten nach Adressänderung", async () => {
  const page = await readFile(new URL("../src/modules/admin/pages/SettingsPage.tsx", import.meta.url), "utf8");
  assert.match(page, /Adresse auf Karte anzeigen/);
  assert.match(page, /type="button"/);
  assert.match(page, /function updatePartnerAddress[\s\S]*latitude: "", longitude: ""/);
  assert.match(page, /verifiedLocationKey !== ownerLocationAddressKey\(partnerLocation\)/);
  assert.match(page, /Welche Adresse meinst du\?/);
  assert.match(page, /✓ Standort gefunden/);
  assert.match(page, /Erneut suchen/);
  assert.match(page, /Erweiterte Einstellungen/);
  assert.doesNotMatch(page, /id="location-latitude"|id="location-longitude"/);
  assert.doesNotMatch(page, /onChange=\{[^}]*findPartnerLocation/);
});
