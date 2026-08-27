import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  getOfferValidityState,
  isPublicOfferVisible,
  maximumConcurrentOffers,
  sortPublicOffers,
  validateRestaurantOfferDraft,
} from "../src/modules/offers/restaurantOffers.mjs";

const migrationUrl = new URL("../supabase/migrations/20260804001000_restaurant_offers_v1.sql", import.meta.url);
const auditFixMigrationUrl = new URL("../supabase/migrations/20260819001000_fix_offers_audit_actor_type.sql", import.meta.url);
const visibilityMigrationUrl = new URL("../supabase/migrations/20260826001000_customer_offer_visibility_validity_split.sql", import.meta.url);
const ownerPageUrl = new URL("../src/modules/admin/pages/RestaurantOffersPage.tsx", import.meta.url);
const serviceUrl = new URL("../src/modules/offers/restaurantOfferService.ts", import.meta.url);
const customerOfferCardUrl = new URL("../src/modules/customer/components/RestaurantOfferCard.tsx", import.meta.url);
const customerOfferCssUrl = new URL("../src/modules/customer/components/restaurant-offer-card.css", import.meta.url);
const customerPortalUrl = new URL("../src/modules/customer/CustomerPortal.tsx", import.meta.url);
const finderUrl = new URL("../src/modules/customer/PartnerRestaurantFinderPage.tsx", import.meta.url);

function validDraft(overrides = {}) {
  return {
    title: "Mittagsmenü",
    shortDescription: "Frisch gekocht",
    branchId: "branch-a",
    offerType: "WEEKLY_OFFER",
    validFrom: "2026-08-04T10:00:00Z",
    validTo: "2026-08-11T10:00:00Z",
    currentPrice: 12,
    previousPrice: null,
    weekdays: [],
    timeFrom: null,
    timeTo: null,
    ...overrides,
  };
}

test("Owner kann einen fachlich gültigen Entwurf erstellen", () => {
  assert.equal(validateRestaurantOfferDraft(validDraft()), null);
});

test("Pflichtfelder und Gültigkeitszeitraum werden validiert", () => {
  assert.equal(validateRestaurantOfferDraft(validDraft({ title: "" })), "REQUIRED_FIELDS");
  assert.equal(validateRestaurantOfferDraft(validDraft({ validTo: "2026-08-03T10:00:00Z" })), "INVALID_PERIOD");
});

test("Mittagsmenü verlangt Wochentag und Zeitfenster", () => {
  assert.equal(validateRestaurantOfferDraft(validDraft({ offerType: "LUNCH_MENU" })), "LUNCH_WINDOW_REQUIRED");
  assert.equal(validateRestaurantOfferDraft(validDraft({ offerType: "LUNCH_MENU", weekdays: [1], timeFrom: "11:00", timeTo: "14:00" })), null);
});

test("Preisvalidierung erlaubt keine negativen oder irreführenden Vergleichspreise", () => {
  assert.equal(validateRestaurantOfferDraft(validDraft({ currentPrice: 0 })), "INVALID_CURRENT_PRICE");
  assert.equal(validateRestaurantOfferDraft(validDraft({ previousPrice: 10 })), "INVALID_PREVIOUS_PRICE");
  assert.equal(validateRestaurantOfferDraft(validDraft({ previousPrice: 15 })), null);
});

test("Veröffentlichung und Aktivierung steuern die Sichtbarkeit bis zum Ablauf", () => {
  const now = new Date("2026-08-05T12:00:00Z");
  const active = { status: "PUBLISHED", is_active: true, valid_from: "2026-08-05T00:00:00Z", valid_to: "2026-08-06T00:00:00Z" };
  assert.equal(isPublicOfferVisible(active, now), true);
  assert.equal(isPublicOfferVisible({ ...active, status: "DRAFT" }, now), false);
  assert.equal(isPublicOfferVisible({ ...active, is_active: false }, now), false);
  assert.equal(isPublicOfferVisible({ ...active, valid_from: "2026-08-06T00:00:00Z" }, now), true);
  assert.equal(isPublicOfferVisible({ ...active, valid_to: "2026-08-05T00:00:00Z" }, now), false);
});

test("Zeitplan ändert die Europe/Vienna-Gültigkeit, nicht die öffentliche Sichtbarkeit", () => {
  const mondayLunch = {
    status: "PUBLISHED",
    is_active: true,
    valid_from: "2026-08-01T00:00:00Z",
    valid_to: "2026-08-31T00:00:00Z",
    weekdays: [1],
    time_from: "11:00:00",
    time_to: "14:00:00",
  };
  assert.equal(isPublicOfferVisible(mondayLunch, new Date("2026-08-03T10:30:00Z")), true);
  assert.equal(getOfferValidityState(mondayLunch, new Date("2026-08-03T10:30:00Z")), "CURRENT");
  assert.equal(isPublicOfferVisible(mondayLunch, new Date("2026-08-03T13:30:00Z")), true);
  assert.equal(getOfferValidityState(mondayLunch, new Date("2026-08-03T13:30:00Z")), "NOT_CURRENT");
  assert.equal(isPublicOfferVisible(mondayLunch, new Date("2026-08-04T10:30:00Z")), true);
  assert.equal(getOfferValidityState(mondayLunch, new Date("2026-08-04T10:30:00Z")), "NOT_CURRENT");
});

test("Bevorstehende Angebote bleiben sichtbar und erhalten einen eigenen Gültigkeitsstatus", () => {
  const upcoming = {
    status: "PUBLISHED",
    is_active: true,
    valid_from: "2026-08-28T00:00:00Z",
    valid_to: "2026-09-01T00:00:00Z",
  };
  const now = new Date("2026-08-26T10:00:00Z");
  assert.equal(isPublicOfferVisible(upcoming, now), true);
  assert.equal(getOfferValidityState(upcoming, now), "UPCOMING");
});

test("Fünf parallele Beiträge sind erlaubt, ein sechster ist erkennbar", () => {
  const five = Array.from({ length: 5 }, () => ({ valid_from: "2026-08-05T00:00:00Z", valid_to: "2026-08-06T00:00:00Z" }));
  assert.equal(maximumConcurrentOffers(five), 5);
  assert.equal(maximumConcurrentOffers([...five, five[0]]), 6);
});

test("Aneinandergrenzende Zeiträume zählen nicht gleichzeitig", () => {
  assert.equal(maximumConcurrentOffers([
    { valid_from: "2026-08-05T00:00:00Z", valid_to: "2026-08-06T00:00:00Z" },
    { valid_from: "2026-08-06T00:00:00Z", valid_to: "2026-08-07T00:00:00Z" },
  ]), 1);
});

test("Kundensortierung priorisiert Mittags-, Wochen- und Monatsangebote deterministisch", () => {
  const sorted = sortPublicOffers([
    { id: "news", offer_type: "NEWS", valid_from: "2026-08-01T00:00:00Z", published_at: "2026-08-03T00:00:00Z" },
    { id: "week", offer_type: "WEEKLY_OFFER", valid_from: "2026-08-01T00:00:00Z", published_at: "2026-08-01T00:00:00Z" },
    { id: "lunch", offer_type: "LUNCH_MENU", valid_from: "2026-08-01T00:00:00Z", published_at: "2026-08-01T00:00:00Z" },
  ]);
  assert.deepEqual(sorted.map((offer) => offer.id), ["lunch", "week", "news"]);
});

test("Migration erstellt ein eigenständiges Modell ohne Reward- oder Punkte-Fremdschlüssel", async () => {
  const migration = await readFile(migrationUrl, "utf8");
  const tableBlock = migration.slice(migration.indexOf("create table if not exists public.restaurant_offers"), migration.indexOf("create table if not exists public.restaurant_offer_metrics"));
  assert.match(tableBlock, /restaurant_id uuid not null/);
  assert.match(tableBlock, /branch_id uuid/);
  assert.doesNotMatch(tableBlock, /reward_id|coupon_id|redemption_id|point_transaction_id|campaign_id/);
});

test("RLS bleibt aktiv und Tabellenzugriffe werden nicht öffentlich geöffnet", async () => {
  const migration = await readFile(migrationUrl, "utf8");
  assert.match(migration, /alter table public\.restaurant_offers enable row level security/);
  assert.match(migration, /revoke all on table public\.restaurant_offers from anon, authenticated/);
  assert.doesNotMatch(migration, /disable row level security/i);
  assert.doesNotMatch(migration, /for (insert|update|delete) to anon/i);
});

test("Owner-RPCs prüfen Rolle und Mandant serverseitig", async () => {
  const migration = await readFile(migrationUrl, "utf8");
  assert.match(migration, /public\.is_restaurant_admin\(input_restaurant_id\)/);
  assert.match(migration, /where id = input_offer_id and restaurant_id = input_restaurant_id/);
  assert.match(migration, /OFFER_ACCESS_DENIED/);
  assert.match(migration, /b\.restaurant_id = new\.restaurant_id/);
});

test("Parallelveröffentlichung wird mit Restaurant-Lock und Fünfergrenze geschützt", async () => {
  const migration = await readFile(migrationUrl, "utf8");
  assert.match(migration, /pg_advisory_xact_lock\(hashtextextended\(new\.restaurant_id::text, 0\)\)/);
  assert.match(migration, /overlapping_count >= 5/);
  assert.match(migration, /OFFER_ACTIVE_LIMIT_REACHED/);
});

test("Forward-Migration trennt öffentliche Sichtbarkeit von Zeitplan und Startdatum", async () => {
  const migration = await readFile(visibilityMigrationUrl, "utf8");
  const publicFunction = migration.slice(migration.indexOf("create or replace function public.get_public_restaurant_offers"), migration.indexOf("revoke all on function public.get_public_restaurant_offers"));
  assert.match(publicFunction, /o\.status = 'PUBLISHED'/);
  assert.match(publicFunction, /o\.is_active = true/);
  assert.match(publicFunction, /o\.valid_to > now\(\)/);
  const whereClause = publicFunction.slice(publicFunction.indexOf("where o.status"), publicFunction.indexOf("order by priority"));
  assert.doesNotMatch(whereClause, /o\.valid_from <= now\(\)/);
  assert.doesNotMatch(whereClause, /extract\(isodow|time_from|time_to|Europe\/Vienna/);
  assert.match(publicFunction, /r\.slug = trim\(input_restaurant_slug\)/);
  assert.match(publicFunction, /b\.restaurant_id = r\.id/);
  assert.doesNotMatch(publicFunction, /customer_id|phone|birthday|token_hash/);
});

test("Forward-Migration behält sichere RPC-Eigenschaften und enge Grants", async () => {
  const migration = await readFile(visibilityMigrationUrl, "utf8");
  assert.match(migration, /security definer/);
  assert.match(migration, /set search_path = public, pg_temp/);
  assert.match(migration, /revoke all on function public\.get_public_restaurant_offers\(text, integer\) from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.get_public_restaurant_offers\(text, integer\) to anon, authenticated/);
  assert.doesNotMatch(migration, /service_role|disable row level security/i);
});

test("Analytics speichert ausschließlich aggregierte PII-freie Zähler", async () => {
  const migration = await readFile(migrationUrl, "utf8");
  const metricsBlock = migration.slice(migration.indexOf("create table if not exists public.restaurant_offer_metrics"), migration.indexOf("create index if not exists restaurant_offers_owner_idx"));
  assert.match(metricsBlock, /event_count bigint/);
  assert.doesNotMatch(metricsBlock, /customer_id|user_id|device_id|ip_address|token/);
  for (const event of ["OFFER_VIEWED", "OFFER_CTA_CLICKED", "OFFER_ROUTE_CLICKED", "OFFER_BONUS_OPENED"]) assert.match(metricsBlock, new RegExp(event));
});

test("Audit wird bei Erstellung, Veröffentlichung, Deaktivierung und Archivierung geschrieben", async () => {
  const migration = await readFile(migrationUrl, "utf8");
  for (const event of ["OFFER_CREATED", "OFFER_UPDATED", "OFFER_PUBLISHED", "OFFER_DISABLED", "OFFER_ARCHIVED", "OFFER_DUPLICATED", "OFFER_DRAFT_DELETED"]) assert.match(migration, new RegExp(event));
  assert.match(migration, /public\.write_audit_event/);
});

test("Forward-Fix verwendet den gültigen Admin-Akteurstyp für alle Offers-Schreib-RPCs", async () => {
  const migration = await readFile(auditFixMigrationUrl, "utf8");
  for (const rpc of ["save_restaurant_offer", "change_restaurant_offer_status", "duplicate_restaurant_offer", "delete_restaurant_offer_draft"]) {
    assert.match(migration, new RegExp(`create or replace function public\\.${rpc}`));
  }
  assert.doesNotMatch(migration, /'restaurant_user'/);
  assert.equal((migration.match(/null, 'admin', auth\.uid\(\)/g) ?? []).length, 4);
  assert.match(migration, /set search_path = public, pg_temp/g);
  assert.match(migration, /OFFER_ACCESS_DENIED/);
});

test("Load-Fehler und Empty State bleiben sichtbar getrennt", async () => {
  const [page, service] = await Promise.all([readFile(ownerPageUrl, "utf8"), readFile(serviceUrl, "utf8")]);
  assert.match(page, /loading \? \(/);
  assert.match(page, /error \? \(/);
  assert.match(page, /visibleOffers\.length \? \(/);
  assert.match(page, /Angebote konnten nicht geladen werden\./);
  assert.match(page, /Erneut versuchen/);
  assert.match(page, /Noch keine Angebote/);
  assert.match(service, /function offerLoadError\(\)/);
  assert.match(service, /new Error\("Angebote konnten nicht geladen werden\."\)/);
});

test("Owner-Seite bietet vollständige Aktionen und sicheren bestehenden Bildupload", async () => {
  const page = await readFile(ownerPageUrl, "utf8");
  for (const label of ["Neues Angebot erstellen", "Bearbeiten", "Vorschau", "Veröffentlichen", "Deaktivieren", "Duplizieren", "Archivieren", "Entwurf löschen"]) assert.match(page, new RegExp(label));
  assert.match(page, /OwnerRewardImageUploader/);
  assert.match(page, /folder: "offers"/);
  assert.match(page, /JPG|PNG|WebP|ownerRewardImageService/);
});

test("CustomerPortal zeigt höchstens drei aktuelle Beiträge und verändert keine Bonuslogik", async () => {
  const page = await readFile(customerPortalUrl, "utf8");
  assert.match(page, /restaurantOffers\.slice\(0, 3\)/);
  assert.match(page, /title="Aktuelles & Angebote"/);
  const offersSection = page.slice(page.indexOf("restaurantOffers.length"), page.indexOf("restaurantOffers.length") + 1800);
  assert.doesNotMatch(offersSection, /collectBonusPoints|startCustomerRedemption|setStoredCustomerToken|registerRestaurantGuest/);
});

test("Customer-Angebote zeigen Gültigkeitsstatus und kompakten Zeitplan", async () => {
  const [card, service] = await Promise.all([readFile(customerOfferCardUrl, "utf8"), readFile(serviceUrl, "utf8")]);
  for (const copy of ["Jetzt gültig", "Heute nicht gültig", "Gültig ab", "Gültigkeit:"]) {
    assert.match(`${card}\n${service}`, new RegExp(copy));
  }
  assert.match(card, /formatRestaurantOfferSchedule/);
  assert.match(card, /formatRestaurantOfferPeriod/);
  assert.match(card, /onError=\{\(\) => setFailed\(true\)\}/);
});

test("Mobile Customer-Angebotskarten halten 16:9, Textgrenzen und volle CTA-Breite", async () => {
  const css = await readFile(customerOfferCssUrl, "utf8");
  assert.match(css, /aspect-ratio: var\(--customer-card-media-ratio, 16 \/ 9\)/);
  assert.match(css, /object-fit: cover/);
  assert.match(css, /-webkit-line-clamp: 2/);
  assert.match(css, /customer-offer-card \.premium-button \{ min-height: 44px; width: 100%; \}/);
  assert.match(css, /@media \(max-width: 560px\)/);
  assert.match(css, /grid-template-columns: minmax\(0, 1fr\)/);
  assert.doesNotMatch(css, /(?:^|[;{])\s*width:\s*[5-9]\d\dpx/m);
});

test("Owner UI trennt Veröffentlichung, Kundensichtbarkeit und aktuelle Gültigkeit", async () => {
  const page = await readFile(ownerPageUrl, "utf8");
  assert.match(page, /Kundensichtbarkeit/);
  assert.match(page, /Aktuelle Gültigkeit/);
  assert.match(page, /veröffentlicht und sichtbar/);
  assert.match(page, /restaurantOfferCustomerVisibility/);
  assert.match(page, /restaurantOfferValidityPresentation/);
});

test("Finder zeigt einen kompakten Hinweis und sichere Aktionen", async () => {
  const finder = await readFile(finderUrl, "utf8");
  assert.match(finder, /partner-offer-badge/);
  assert.match(finder, /Angebot ansehen/);
  assert.match(finder, /OFFER_ROUTE_CLICKED/);
  assert.match(finder, /OFFER_BONUS_OPENED/);
  assert.doesNotMatch(finder, /saveStoredCustomerToken|collectBonusPoints|registerRestaurantGuest/);
});

test("Formular und Karten bleiben mobil, tastaturbedienbar und ohne feste Breite", async () => {
  const [page, css] = await Promise.all([
    readFile(ownerPageUrl, "utf8"),
    readFile(new URL("../src/modules/admin/pages/restaurant-offers.css", import.meta.url), "utf8"),
  ]);
  assert.match(page, /aria-required="true"/);
  assert.match(page, /type="button"/);
  assert.match(css, /minmax\(0, 1fr\)/);
  assert.match(css, /min-height: 44px/);
  assert.match(css, /@media \(max-width: 699px\)/);
  assert.doesNotMatch(css, /(?:^|[;{])\s*width:\s*[5-9]\d\dpx/m);
});

test("Migration enthält keine Service-Role, Reward-Schreiblogik oder öffentliche DML-Grants", async () => {
  const migration = await readFile(migrationUrl, "utf8");
  assert.doesNotMatch(migration, /service_role/i);
  assert.doesNotMatch(migration, /(insert|update|delete)\s+(into|from)?\s*public\.(rewards|points_transactions|redemption)/i);
  assert.doesNotMatch(migration, /grant (insert|update|delete).*to anon/i);
});
