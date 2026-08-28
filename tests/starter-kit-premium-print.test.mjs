import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  getStarterKitPageDefinitions,
  STARTER_KIT_FOOTER,
  STARTER_KIT_LAYOUT,
  STARTER_KIT_REFERRAL,
} from "../src/shared/lib/starterKitPages.mjs";

const qrCenter = await readFile(new URL("../src/modules/admin/pages/QrCenterPage.tsx", import.meta.url), "utf8");
const onboarding = await readFile(new URL("../src/modules/admin/pages/RestaurantOnboarding.tsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
const pageModel = await readFile(new URL("../src/shared/lib/starterKitPages.mjs", import.meta.url), "utf8");
const qrCenterPrint = qrCenter.slice(qrCenter.indexOf("function drawBonusBoostHint"), qrCenter.indexOf("function downloadQrPng"));
const onboardingPrint = onboarding.slice(onboarding.indexOf("function drawBonusBoostKpiBox"), onboarding.indexOf("function linesToList"));
const corePages = getStarterKitPageDefinitions();

test("canonical Starter Kit model defines the three approved A6 pages", () => {
  assert.deepEqual(corePages.map(({ headline, qrKind }) => ({ headline, qrKind })), [
    { headline: "Neu hier?", qrKind: "restaurant" },
    { headline: "Bonusprogramm entdecken", qrKind: "restaurant" },
    { headline: "Mitarbeiterbereich", qrKind: "staff" },
  ]);
  assert.equal(corePages[0].referralHint, true);
  assert.equal(corePages[1].referralHint, true);
  assert.equal(corePages[2].referralHint, undefined);
  assert.equal(corePages[2].secondaryNote, "Nur für Mitarbeiter · Nicht für Gäste");
});

test("preview and both PDF generators consume one canonical page model", () => {
  assert.match(qrCenter, /const starterKitPages = getStarterKitPageDefinitions\(showCustomerCollectCompatibility\)/);
  assert.match(qrCenterPrint, /getStarterKitPageDefinitions\(input\.includeCustomerCollectCompatibility\)/);
  assert.match(onboardingPrint, /getStarterKitPageDefinitions\(\)/);
  assert.match(qrCenter, /starterKitPages\.map\(\(page\) =>/);
  for (const legacyTree of [qrCenterPrint, onboardingPrint]) {
    assert.doesNotMatch(legacyTree, /headline: "Neu hier\?"|headline: "Bonusprogramm entdecken"|headline: "Mitarbeiterbereich"/);
  }
});

test("A6 geometry is canonical and preview scales the same model", () => {
  assert.deepEqual(STARTER_KIT_LAYOUT.canvas, { height: 1748, width: 1240 });
  assert.deepEqual(STARTER_KIT_LAYOUT.logo, { height: 208, width: 598, x: 321, y: 106 });
  assert.deepEqual(STARTER_KIT_LAYOUT.qr, { frameInset: 44, frameRadius: 30, size: 680, x: 280, y: 610 });
  assert.equal(STARTER_KIT_LAYOUT.contentMargin, 96);
  assert.match(qrCenterPrint, /canvas\.width = STARTER_KIT_LAYOUT\.canvas\.width/);
  assert.match(qrCenterPrint, /canvas\.height = STARTER_KIT_LAYOUT\.canvas\.height/);
  assert.match(qrCenter, /previewBoxStyle\(STARTER_KIT_LAYOUT\.logo\)/);
  assert.match(qrCenter, /previewBoxStyle\(qrFrame\)/);
  assert.match(styles, /\.starter-kit-a6-sheet\s*\{[\s\S]*aspect-ratio:\s*105 \/ 148/);
});

test("preview and PDF preserve Smart Logo presentation", () => {
  assert.match(qrCenter, /const placement = logoCanvasPlacement\([\s\S]{0,260}presentation \?\? \{\}/);
  assert.match(qrCenterPrint, /drawLogo\(context, \{[\s\S]{0,360}presentation: branding\.presentation/);
  assert.match(qrCenter, /<RestaurantLogoStage[\s\S]{0,220}presentation=\{branding\}[\s\S]{0,160}size="print"/);
  assert.match(onboarding, /logoPresentation: tenantBranding \? \{/);
});

test("QR frame keeps canonical size, quiet space and crisp PDF modules", () => {
  assert.equal(STARTER_KIT_LAYOUT.qr.size, 680);
  assert.equal(STARTER_KIT_LAYOUT.qr.frameInset, 44);
  assert.match(qrCenterPrint, /context\.imageSmoothingEnabled = false/);
  assert.match(qrCenterPrint, /STARTER_KIT_LAYOUT\.qr\.frameInset/);
  assert.match(styles, /\.starter-kit-a6-qr-frame\s*\{[\s\S]*padding:\s*5\.73%/);
  assert.match(styles, /\.starter-kit-a6-qr-frame \.operational-qr-code\s*\{[\s\S]*height:\s*100%[\s\S]*width:\s*100%/);
});

test("paper and preview backgrounds are pure white", () => {
  for (const source of [qrCenterPrint, onboardingPrint]) {
    assert.match(source, /context\.fillStyle = "#ffffff";\s*context\.fillRect\(0, 0, canvas\.width, canvas\.height\);/);
    assert.doesNotMatch(source, /context\.fillStyle = "#fbf8f1";/);
  }
  assert.match(styles, /\.starter-kit-a6-sheet\s*\{[\s\S]*background:\s*#ffffff/);
});

test("referral content is shared, evergreen and absent from Staff", () => {
  assert.equal(STARTER_KIT_REFERRAL.title, "Freunde einladen lohnt sich");
  assert.deepEqual(STARTER_KIT_REFERRAL.benefits.map(({ label, value }) => ({ label, value })), [
    { label: "Du bekommst", value: "2× Punkte" },
    { label: "Dein Freund bekommt", value: "2× Punkte" },
  ]);
  assert.doesNotMatch(pageModel, /\b(?:7|14|15|28|30)\s*Tage\b/i);
  for (const source of [qrCenter, onboarding]) assert.match(source, /STARTER_KIT_REFERRAL/);
});

test("typography and footer hierarchy use canonical values", () => {
  assert.deepEqual(STARTER_KIT_LAYOUT.restaurantName, { fontSize: 44, lineHeight: 50, y: 326 });
  assert.deepEqual(STARTER_KIT_LAYOUT.headline, { fontSize: 70, lineHeight: 78, y: 428 });
  assert.deepEqual(STARTER_KIT_LAYOUT.description, { fontSize: 31, lineHeight: 38, y: 512 });
  assert.equal(STARTER_KIT_FOOTER, "Powered by WUXUAI Bonus");
  assert.match(qrCenter, /STARTER_KIT_FOOTER/);
  assert.match(onboarding, /STARTER_KIT_FOOTER/);
});

test("raw QR actions are explicitly distinguished from the A6 Starter Kit", () => {
  assert.equal((qrCenter.match(/QR-Code als PNG herunterladen/g) ?? []).length, 2);
  assert.match(qrCenter, /Nur der jeweilige QR-Code als PNG, ohne A6-Druckseite\./);
  assert.match(qrCenter, /Starter Kit herunterladen/);
});

test("guest and staff QR payload mappings remain unchanged", () => {
  assert.equal(corePages.filter((page) => page.qrKind === "restaurant").length, 2);
  assert.equal(corePages.filter((page) => page.qrKind === "staff").length, 1);
  assert.match(qrCenter, /restaurantQrId: "qr-restaurant"/);
  assert.match(qrCenter, /staffQrId: "qr-staff"/);
  assert.match(onboarding, /staffQrId: "staff-qr"/);
});
