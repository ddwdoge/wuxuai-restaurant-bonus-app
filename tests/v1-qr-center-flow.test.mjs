import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { getQrCenterPurposes, requiresCustomerInitiatedQr } from "../src/modules/admin/qrCenterFlow.mjs";

const qrCenter = await readFile(new URL("../src/modules/admin/pages/QrCenterPage.tsx", import.meta.url), "utf8");
const onboarding = await readFile(new URL("../src/modules/admin/pages/RestaurantOnboarding.tsx", import.meta.url), "utf8");
const app = await readFile(new URL("../src/app/App.tsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

test("restaurant-controlled QR Center exposes only guest and staff purposes", () => {
  assert.deepEqual(getQrCenterPurposes("restaurant_controlled_only"), ["new_guest", "staff"]);
});

test("customer-initiated modes retain one compatibility purpose", () => {
  assert.equal(requiresCustomerInitiatedQr("customer_initiated_only"), true);
  assert.equal(requiresCustomerInitiatedQr("both"), true);
  assert.deepEqual(getQrCenterPurposes("both"), ["new_guest", "staff", "customer_collect_compatibility"]);
});

test("Kassa-Aufsteller duplicate is removed while the legacy route remains compatible", () => {
  assert.doesNotMatch(qrCenter, /Kassa-Aufsteller|qr-counter|kassa-aufsteller-qr/);
  assert.match(qrCenter, /showCustomerCollectCompatibility/);
  assert.match(app, /path="\/w\/:slug"/);
});

test("onboarding starter kit uses guest and protected staff QR only", () => {
  assert.match(onboarding, /id="restaurant-qr"/);
  assert.match(onboarding, /id="staff-qr"/);
  assert.doesNotMatch(onboarding, /id="bonus-qr"/);
  assert.match(onboarding, /staffTabletUrl = `\$\{publicBaseUrl\}\$\{buildStaffLoginPath\(restaurantSlug\)\}`/);
});

test("alternate guest print reuses the same technical guest QR", () => {
  const pageSpecsStart = onboarding.indexOf("const pageSpecs: StarterKitPageSpec[]");
  const pageSpecsEnd = onboarding.indexOf("const pdf = buildStarterKitPdf", pageSpecsStart);
  const pageSpecs = onboarding.slice(pageSpecsStart, pageSpecsEnd);
  assert.equal((pageSpecs.match(/qrCanvas: restaurantQr/g) ?? []).length, 2);
  assert.equal((pageSpecs.match(/qrCanvas: staffQr/g) ?? []).length, 1);
});

test("QR Center actions remain touch friendly and starter kit stacks on mobile", () => {
  assert.match(styles, /\.qr-card-actions \.button\s*\{[\s\S]*?min-height:\s*44px/);
  assert.match(styles, /\.qr-center-starter-card\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(styles, /@media \(min-width: 640px\)[\s\S]*?\.qr-center-starter-card\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) auto/);
});
