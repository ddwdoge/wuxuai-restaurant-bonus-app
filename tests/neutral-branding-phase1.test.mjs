import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

const terminology = source("../src/config/productTerminology.ts");
const publicHome = source("../src/modules/public/PublicHome.tsx");
const login = source("../src/modules/auth/LoginPage.tsx");
const register = source("../src/modules/auth/RegisterPage.tsx");
const onboarding = source("../src/modules/admin/pages/RestaurantOnboarding.tsx");
const adminLayout = source("../src/modules/admin/AdminLayout.tsx");
const customer = source("../src/modules/customer/CustomerPortal.tsx");
const staff = source("../src/modules/staff/StaffTablet.tsx");
const qrCenter = source("../src/modules/admin/pages/QrCenterPage.tsx");
const legalCenter = source("../src/modules/legal/LegalCenterPage.tsx");
const indexHtml = source("../index.html");

test("zentrale Produktterminologie enthält die verbindlichen Phase-1-Begriffe", () => {
  for (const [key, value] of Object.entries({
    productName: "WUXUAI Bonus",
    productTagline: "Kundenbindung für lokale Unternehmen",
    business: "Unternehmen",
    businessShort: "Geschäft",
    businessOwner: "Betreiber",
    businessName: "Unternehmensname",
    businessData: "Unternehmensdaten",
    businessProfile: "Unternehmensprofil",
    businessStatus: "Unternehmensstatus",
    businessSettings: "Unternehmenseinstellungen",
    businessQr: "Unternehmens-QR",
    businessSelector: "Unternehmen auswählen",
    businessSwitch: "Unternehmen wechseln",
    teamMember: "Teammitglied",
    businessType: "Branche",
  })) {
    assert.match(terminology, new RegExp(`${key}: "${value}"`));
  }
});

test("öffentliche Einstiege und Browser-Metadaten verwenden WUXUAI Bonus", () => {
  assert.match(publicHome, /productTerminology\.productName/);
  assert.match(publicHome, /productTerminology\.productTagline/);
  assert.match(publicHome, /title="Betreiber-Login"/);
  assert.match(publicHome, /title="Kunden-Bonus öffnen"/);
  assert.match(login, /title="Betreiber-Login"/);
  assert.match(register, /title="Unternehmen registrieren"/);
  assert.match(indexHtml, /<title>WUXUAI Bonus<\/title>/);
  assert.match(indexHtml, /Kundenbindung für lokale Unternehmen/);
});

test("Onboarding zeigt die sieben neutralen Schritte und aktiviert das Unternehmen", () => {
  for (const label of ["Unternehmen", "Aussehen", "Geöffnet", "Punkteeinlösung", "Willkommensgeschenke", "Rechtliches", "Startklar"]) {
    assert.match(onboarding, new RegExp(`"${label}"`));
  }
  assert.match(onboarding, /Wie heißt dein Unternehmen\?/);
  assert.match(onboarding, /Unternehmen aktivieren/);
  assert.doesNotMatch(onboarding, /<strong>Restaurant Starter Kit<\/strong>/);
});

test("Owner, Customer, Staff, QR und Legal verwenden neutrale sichtbare Begriffe", () => {
  assert.match(adminLayout, /Betreiber-Portal/);
  assert.match(adminLayout, /Unternehmensmenü/);
  assert.match(customer, /Unternehmens-QR scannen/);
  assert.match(customer, /Unternehmen erkannt/);
  assert.match(staff, /Teambereich/);
  assert.match(staff, /Team-Navigation/);
  assert.match(qrCenter, /<h2>Starter Kit<\/h2>/);
  assert.match(qrCenter, /<h2>Team-QR<\/h2>/);
  assert.match(legalCenter, /Unternehmensbezogene JSON-Datei/);
});

test("interne Legacy-Verträge bleiben als akzeptierte technische Namen erhalten", () => {
  assert.match(onboarding, /restaurantId: activeRestaurant\.id/);
  assert.match(register, /registerRestaurantOwner/);
  assert.match(customer, /restaurantSlug/);
  assert.match(customer, /loadPortalForRestaurant/);
});
