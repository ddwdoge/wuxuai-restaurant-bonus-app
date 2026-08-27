import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const qrCenter = await readFile(new URL("../src/modules/admin/pages/QrCenterPage.tsx", import.meta.url), "utf8");
const onboarding = await readFile(new URL("../src/modules/admin/pages/RestaurantOnboarding.tsx", import.meta.url), "utf8");
const qrCenterPrint = qrCenter.slice(qrCenter.indexOf("function drawBonusBoostHint"), qrCenter.indexOf("function downloadQrPng"));
const onboardingPrint = onboarding.slice(
  onboarding.indexOf("function drawBonusBoostKpiBox"),
  onboarding.indexOf("function linesToList"),
);
const printSources = `${qrCenterPrint}\n${onboardingPrint}`;

test("Starter Kit removes operational labels from every QR sheet", () => {
  for (const removedLabel of ["Für den Eingang", "Für Tisch oder Flyer", "Für den Team", "Für dein Team"]) {
    assert.doesNotMatch(printSources, new RegExp(removedLabel, "i"));
  }
  assert.match(qrCenter, /secondaryNote: "Nur für Mitarbeiter · Nicht für Gäste"/);
  assert.match(onboarding, /secondaryNote: "Nur für Mitarbeiter · Nicht für Gäste"/);
});

test("three core print pages use the approved content hierarchy", () => {
  for (const source of [qrCenter, onboarding]) {
    assert.match(source, /audienceLabel: "Bonus für Gäste"/);
    assert.match(source, /headline: "Neu hier\?"/);
    assert.match(source, /Scanne den QR-Code und sichere dir dein Willkommensgeschenk\./);
    assert.match(source, /headline: "Bonusprogramm entdecken"/);
    assert.match(source, /Scanne den QR-Code und werde Gast in unserem Bonusprogramm\./);
    assert.match(source, /headline: "Mitarbeiterbereich"/);
    assert.match(source, /Persönlich anmelden für Tages-PIN, Gästeprüfung und Restaurant-Service\./);
  }
  assert.doesNotMatch(onboarding, /drawStarterKitInfoPage/);
});

test("both guest sheets use two evergreen 2x benefit cells without printed duration", () => {
  for (const source of [qrCenter, onboarding]) {
    assert.match(source, /Freunde einladen lohnt sich/);
    assert.match(source, /icon: "🔥", label: "Du bekommst", value: "2× Punkte"/);
    assert.match(source, /icon: "👥", label: "Dein Freund bekommt", value: "2× Punkte"/);
    assert.match(source, /Aktiv nach dem ersten qualifizierten Besuch deines Freundes\./);
    assert.doesNotMatch(source, /\b(?:7|14|15|28|30)\s*Tage\b/i);
  }
  assert.equal((qrCenter.match(/referralHint: true/g) ?? []).length, 2);
  assert.equal((onboarding.match(/referralHint: true/g) ?? []).length, 2);
});

test("A6 PDF logo gains adaptive visual presence and keeps Smart Logo metadata", () => {
  assert.match(qrCenter, /height: 160,[\s\S]{0,240}presentation: branding\.presentation[\s\S]{0,240}width: 460/);
  assert.ok(160 / 118 >= 1.3 && 160 / 118 <= 1.4);
  for (const source of [qrCenter, onboarding]) {
    assert.match(source, /logoCanvasPlacement\([\s\S]{0,260}presentation \?\? \{\}/);
  }
  assert.match(onboarding, /logoPresentation: tenantBranding \? \{/);
});

test("QR frames preserve white quiet space, crisp modules and larger QR output", () => {
  assert.match(qrCenter, /const qrSize = 680/);
  assert.match(onboarding, /const qrSize = 1120/);
  for (const source of [qrCenter, onboarding]) {
    assert.match(source, /context\.fillStyle = "#ffffff";\s*context\.fill\(\);[\s\S]*?context\.imageSmoothingEnabled = false;\s*context\.drawImage\([^;]+\);/);
  }
});

test("all sheets share fixed brand, headline, QR and footer positions", () => {
  for (const source of [qrCenter, onboarding]) {
    assert.match(source, /context\.font = "600 [^\n]+Inter/);
    assert.match(source, /context\.font = "800 [^\n]+Inter/);
    assert.match(source, /context\.font = "400 [^\n]+Inter/);
    assert.match(source, /Powered by WUXUAI Bonus/);
  }
});

test("guest and staff QR payload canvases remain unchanged", () => {
  const qrCenterSpecs = qrCenter.slice(
    qrCenter.indexOf("const pageSpecs: QrPrintPage[]"),
    qrCenter.indexOf("if (input.includeCustomerCollectCompatibility", qrCenter.indexOf("const pageSpecs: QrPrintPage[]")),
  );
  const onboardingSpecs = onboarding.slice(
    onboarding.indexOf("const pageSpecs: StarterKitPageSpec[]"),
    onboarding.indexOf("const pdf = buildStarterKitPdf", onboarding.indexOf("const pageSpecs: StarterKitPageSpec[]")),
  );

  assert.equal((qrCenterSpecs.match(/qrCanvas: restaurantQr/g) ?? []).length, 2);
  assert.equal((qrCenterSpecs.match(/qrCanvas: staffQr/g) ?? []).length, 1);
  assert.equal((onboardingSpecs.match(/qrCanvas: restaurantQr/g) ?? []).length, 2);
  assert.equal((onboardingSpecs.match(/qrCanvas: staffQr/g) ?? []).length, 1);
});
