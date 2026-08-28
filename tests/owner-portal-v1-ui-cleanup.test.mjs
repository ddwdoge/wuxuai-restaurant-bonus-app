import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const settings = read("../src/modules/admin/pages/SettingsPage.tsx");
const onboarding = read("../src/modules/admin/pages/RestaurantOnboarding.tsx");
const loyalty = read("../src/modules/admin/pages/LoyaltyPage.tsx");
const finderPage = read("../src/modules/customer/PartnerRestaurantFinderPage.tsx");
const finderService = read("../src/modules/customer/partnerRestaurantService.ts");
const offers = read("../src/modules/admin/pages/RestaurantOffersPage.tsx");

const brandingSection = settings.slice(
  settings.indexOf('if (section === "aussehen")'),
  settings.indexOf('if (section === "oeffnungszeiten")'),
);
const locationSection = settings.slice(
  settings.indexOf('if (section === "standort")'),
  settings.indexOf('if (section === "bonusprogramm")'),
);

test("Standort zeigt nur verständliche Standort- und Suchdaten", () => {
  assert.match(locationSection, /Standort & Restaurantsuche/);
  assert.match(locationSection, /Adresse auf Karte anzeigen/);
  assert.match(locationSection, /Öffentliche Kurzbeschreibung/);
  assert.match(locationSection, /In Restaurantsuche sichtbar/);
  assert.doesNotMatch(locationSection, /Öffentliches Bild \(HTTPS-Adresse\)/);
  assert.doesNotMatch(locationSection, /SmartMediaEditor/);
  assert.doesNotMatch(locationSection, /Breitengrad|Längengrad|location-cover/);
});

test("Branding ist der einzige Owner-Ort für das Restaurant-Titelbild", () => {
  assert.match(brandingSection, /Restaurantbild \/ Titelbild/);
  assert.match(brandingSection, /Restaurantbild auswählen/);
  assert.match(brandingSection, /SmartMediaEditor/);
  assert.equal((settings.match(/<SmartMediaEditor/g) ?? []).length, 1);
});

test("bestehende Titelbilddaten bleiben kompatibel und tenantgebunden", () => {
  assert.match(settings, /public_cover_image_url/);
  assert.match(settings, /public_cover_image_zoom/);
  assert.match(settings, /public_cover_image_position_x/);
  assert.match(settings, /public_cover_image_position_y/);
  assert.match(settings, /\.eq\("id", partnerLocation\.id\)[\s\S]*?\.eq\("restaurant_id", details\.id\)/);
});

test("Restaurantsuche erhält weiterhin Bild, Logo, Beschreibung und Adresse", () => {
  assert.match(finderService, /cover_image_url/);
  assert.match(finderService, /short_description/);
  assert.match(finderService, /address/);
  assert.match(finderPage, /coverImageUrl=\{location\.cover_image_url\}/);
  assert.match(finderPage, /logoUrl=\{location\.logo_url\}/);
});

test("rohe Medien- und Slug-Felder sind nicht mehr in der normalen Owner-UI", () => {
  assert.doesNotMatch(onboarding, /Logo-Link manuell einfügen|id="logo-url"/);
  assert.doesNotMatch(settings, /InfoValue label="Restaurant-Link"/);
  assert.doesNotMatch(offers, /Restaurant\/Filiale|id="offer-branch"/);
  assert.match(offers, /branchId: form\.branchId/);
});

test("Bonusprogramm bleibt auf den V1-Freundschaftsbonus begrenzt", () => {
  assert.match(loyalty, /Freunde einladen & 2× Bonus/);
  assert.doesNotMatch(loyalty, />Modus<|Regel speichern|Aktive Regel/);
});
