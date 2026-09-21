import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260921002000_offer_capacity_enforcement.sql", import.meta.url),
  "utf8",
);
const service = readFileSync(
  new URL("../src/modules/offers/restaurantOfferService.ts", import.meta.url),
  "utf8",
);
const page = readFileSync(
  new URL("../src/modules/admin/pages/RestaurantOffersPage.tsx", import.meta.url),
  "utf8",
);
const messages = readFileSync(
  new URL("../src/modules/offers/offerCapacityMessages.mjs", import.meta.url),
  "utf8",
);

test("the additive trigger replacement uses only the central capacity resolver", () => {
  assert.match(migration, /create or replace function public\.validate_restaurant_offer_row\(\)/);
  assert.match(migration, /resolve_restaurant_capacity_internal\([\s\S]*new\.restaurant_id/);
  assert.doesNotMatch(migration, /resolve_restaurant_entitlements_internal|offer_limit_unlimited|overlapping_count/);
  assert.match(migration, /capacity_usage >= capacity_limit/);
  assert.match(migration, /message = 'OFFER_CAPACITY_REACHED'/);
});

test("only transitions into the canonical counted set consume a slot", () => {
  assert.match(migration, /new\.status = 'PUBLISHED'[\s\S]*new\.is_active = true[\s\S]*new\.valid_to > at_value/);
  assert.match(migration, /old\.status = 'PUBLISHED'[\s\S]*old\.is_active = true[\s\S]*old\.valid_to > at_value/);
  assert.match(migration, /if new_consumes_capacity and not old_consumes_capacity then/);
  assert.doesNotMatch(migration, /valid_from\s*[<>]=?\s*at_value/);
});

test("slot acquisition is tenant serialized before the authoritative read", () => {
  const lock = migration.indexOf("pg_advisory_xact_lock");
  const resolve = migration.indexOf("resolve_restaurant_capacity_internal", lock);
  assert.ok(lock > 0 && resolve > lock);
  assert.match(migration, /hashtextextended\(new\.restaurant_id::text, 0\)/);
  assert.match(migration, /OFFER_TENANT_IMMUTABLE/);
  assert.match(migration, /set search_path = pg_catalog, public, pg_temp/);
});

test("safe details expose capacity facts without internal tenant or billing data", () => {
  for (const key of ["usage", "effective_limit", "remaining", "plan_key", "addon_units", "over_limit"]) {
    assert.ok(migration.includes(`'${key}'`), key);
  }
  assert.doesNotMatch(migration, /stripe|customer|email|owner_id|organization_id/i);
});

test("owner offer reads use central finite capacity and no legacy unlimited authority", () => {
  assert.match(migration, /jsonb_set\([\s\S]*'\{write_enforcement_active\}'[\s\S]*'true'::jsonb/);
  assert.match(migration, /grant execute on function public\.get_restaurant_capacity\(uuid\) to authenticated/);
  assert.match(service, /rpc\("get_restaurant_capacity"/);
  assert.match(service, /loadOwnerOfferPlanWindow[\s\S]*rpc\("get_restaurant_entitlements"/);
  assert.doesNotMatch(service, /OwnerOfferPlanWindow[\s\S]*offer_limit|OwnerOfferPlanWindow[\s\S]*active_offer_count/);
  assert.match(page, /capacity\.offers\.usage/);
  assert.match(page, /capacity\.offers\.effective_limit/);
  assert.match(page, /Aktive und geplante Angebote/);
  assert.doesNotMatch(page, /offer_limit_unlimited|Unbegrenzt|Premium/);
  assert.doesNotMatch(page, /Upgrade kaufen|Paket wechseln|checkout|billing/i);
});

test("the stable capacity error has dedicated copy in all seven UI languages", () => {
  assert.match(service, /RestaurantOfferCapacityError/);
  assert.match(service, /OFFER_CAPACITY_REACHED/);
  assert.match(page, /offerCapacityReachedMessage\(language\)/);
  assert.match(messages, /Deine aktuelle Angebotskapazität ist erreicht\. Buche \+5 weitere Angebote für 19 € netto pro Monat\./);
  for (const locale of ["de", "en", "fr", "it", "es", "zh", "ko"]) {
    assert.match(messages, new RegExp(`\\b${locale}:`));
  }
});

test("migration has no product data remediation or unrelated write surface", () => {
  assert.doesNotMatch(migration, /\b(update|insert into|delete from|truncate)\s+public\./i);
  assert.doesNotMatch(migration, /drop table|drop column|disable row level security/i);
  assert.doesNotMatch(migration, /stripe/i);
  assert.doesNotMatch(migration, /create or replace function public\.(collect|redeem|confirm|register)/i);
});
