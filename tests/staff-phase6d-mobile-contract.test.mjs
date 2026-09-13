import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { translateStructural } from "../src/shared/i18n/catalog.mjs";

const staff = readFileSync(new URL("../src/modules/staff/StaffTablet.tsx", import.meta.url), "utf8");
const drawer = readFileSync(new URL("../src/shared/components/AppDrawer.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/modules/staff/staff-premium.css", import.meta.url), "utf8");

test("five secure process stages stay visible without merging QR, amount, or PIN", () => {
  for (const key of ["scan", "customer", "amount", "pin", "confirm"]) {
    assert.match(staff, new RegExp(`staff\\.process\\.${key}`));
  }
  assert.match(staff, /aria-current=\{index === currentStep \? "step" : undefined\}/);
  assert.match(css, /grid-template-columns: repeat\(5, minmax\(0, 1fr\)\)/);
});

test("camera failures expose an explicit retry without changing the QR decoder", () => {
  assert.match(staff, /staff-operational-scanner-recovery/);
  assert.match(staff, /onClick=\{\(\) => void retryQrScannerCamera\(\)\}/);
  assert.match(staff, /function retryQrScannerCamera\(\)[\s\S]*setScannerStarting\(true\)[\s\S]*setScannerError\(null\)[\s\S]*activateQrScannerCamera/);
  assert.match(staff, /translateKey\("staff\.camera\.retry"\)/);
  assert.match(staff, /decodeFromConstraints/);
});

test("critical Staff sheets opt out of accidental Escape and overlay dismissal", () => {
  assert.match(drawer, /dismissOnEscape = true/);
  assert.match(drawer, /event\.key === "Escape" && dismissOnEscape/);
  assert.match(staff, /dismissOnEscape=\{false\}[\s\S]*dismissOnOverlay=\{false\}[\s\S]*open=\{Boolean\(pendingPinAction\)/);
  assert.match(staff, /dismissOnEscape=\{!hasActivePointsTask\}/);
});

test("PIN confirmation requires exactly four numeric digits before the existing server call", () => {
  assert.match(staff, /if \(!\/\^\\d\{4\}\$\/\.test\(pin\.trim\(\)\)\)/);
  assert.match(staff, /pattern="\[0-9\]\{4\}"/);
  assert.match(staff, /maxLength=\{4\}/);
  assert.match(staff, /minLength=\{4\}/);
  assert.match(staff, /confirmRestaurantControlledPoints/);
});

test("amount preview rejects empty and out-of-range values before the existing server preview", () => {
  assert.match(staff, /pointsAmountCents >= 1[\s\S]*pointsAmountCents <= pointsAmountMaxCents/);
  assert.match(staff, /if \(!restaurantId \|\| !pointsQrReference \|\| !pointsAmountIsValid\) return/);
  assert.match(staff, /disabled=\{saving \|\| !pointsAmountIsValid\}/);
  assert.match(staff, /aria-invalid=\{billAmount !== 0 && !pointsAmountIsValid \|\| undefined\}/);
});

test("pre-confirmation summary keeps paid amount, points and customer visible", () => {
  assert.match(staff, /amountCents: pointsPreview\.amount_cents/);
  assert.match(staff, /staff\.drawer\.paidAmount/);
  assert.match(staff, /staff\.drawer\.plannedPoints/);
  assert.match(staff, /pendingPinAction\.customerName/);
});

test("amount and PIN steps both follow the visual viewport when the keyboard opens", () => {
  assert.match(staff, /fitVisualViewport=\{Boolean\(pendingPinAction \|\| pointsQrReference\)\}/);
});

test("phase 6D additions are translated through the existing seven-language catalog", () => {
  const keys = [
    "staff.process.title", "staff.process.scan", "staff.process.customer", "staff.process.amount",
    "staff.process.pin", "staff.process.confirm", "staff.camera.retry",
    "staff.pin.fourDigitsTitle", "staff.pin.fourDigitsError",
    "staff.kassa.invalidAmount", "staff.drawer.paidAmount",
  ];
  for (const language of ["de", "en", "fr", "it", "es", "zh", "ko"]) {
    for (const key of keys) assert.notEqual(translateStructural(key, language), key, `${language}: ${key}`);
  }
});

test("mobile density, content-driven forms, safe area and touch targets remain bounded", () => {
  assert.match(css, /@media \(max-width: 699px\)[\s\S]*padding: calc\(8px \+ env\(safe-area-inset-top\)\) 12px 8px/);
  assert.match(css, /\.app-drawer-panel\.staff-points-sheet[\s\S]*height: auto/);
  assert.match(css, /max-height: min\(85dvh, calc\(100dvh - env\(safe-area-inset-top\) - 8px\)\)/);
  assert.match(css, /\.staff-operational-scanner-recovery \.button[\s\S]*min-height: 48px/);
  assert.doesNotMatch(css, /zoom\s*:|transform:\s*scale\(/);
});
