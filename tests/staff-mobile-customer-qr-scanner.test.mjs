import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  BinaryBitmap,
  DecodeHintType,
  HybridBinarizer,
  QRCodeReader,
  RGBLuminanceSource,
} from "@zxing/library";
import { QRCodeSVG } from "qrcode.react";
import {
  buildCustomerPointsQrPayload,
  extractCustomerPointsQrReference,
} from "../src/modules/loyalty/customerPointsQr.mjs";
import { OPERATIONAL_QR_CONFIG } from "../src/shared/lib/operationalQr.mjs";

const staffPortal = await readFile(new URL("../src/modules/staff/StaffTablet.tsx", import.meta.url), "utf8");
const customerPortal = await readFile(new URL("../src/modules/customer/CustomerPortal.tsx", import.meta.url), "utf8");
const loyaltyService = await readFile(new URL("../src/modules/loyalty/loyaltyService.ts", import.meta.url), "utf8");

function renderPointsQr(value) {
  return renderToStaticMarkup(React.createElement(QRCodeSVG, {
    bgColor: OPERATIONAL_QR_CONFIG.backgroundColor,
    fgColor: OPERATIONAL_QR_CONFIG.foregroundColor,
    level: OPERATIONAL_QR_CONFIG.errorCorrectionLevel,
    marginSize: OPERATIONAL_QR_CONFIG.marginModules,
    size: OPERATIONAL_QR_CONFIG.screenSize,
    value,
  }));
}

function decodeRenderedQr(svg) {
  const viewBox = svg.match(/viewBox="0 0 (\d+) (\d+)"/);
  const foregroundPath = svg.match(/<path fill="#000000" d="([^"]+)"/);
  assert.ok(viewBox && foregroundPath);

  const moduleCount = Number(viewBox[1]);
  const pixelsPerModule = 6;
  const pixelSize = moduleCount * pixelsPerModule;
  const luminances = new Uint8ClampedArray(pixelSize * pixelSize);
  luminances.fill(255);

  for (const segment of foregroundPath[1].matchAll(/M(\d+)[ ,](\d+)\s*h(\d+)v1H\d+z/g)) {
    const startX = Number(segment[1]);
    const moduleY = Number(segment[2]);
    const runWidth = Number(segment[3]);
    for (let y = moduleY * pixelsPerModule; y < (moduleY + 1) * pixelsPerModule; y += 1) {
      for (let x = startX * pixelsPerModule; x < (startX + runWidth) * pixelsPerModule; x += 1) {
        luminances[y * pixelSize + x] = 0;
      }
    }
  }

  const bitmap = new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(luminances, pixelSize, pixelSize)));
  return new QRCodeReader().decode(bitmap, new Map([[DecodeHintType.PURE_BARCODE, true]])).getText();
}

test("personal customer points QR keeps the short-lived payload contract and decodes", () => {
  const placeholderReference = "render-test";
  const payload = buildCustomerPointsQrPayload(placeholderReference);

  assert.equal(decodeRenderedQr(renderPointsQr(payload)), payload);
  assert.equal(extractCustomerPointsQrReference(payload), placeholderReference);
  assert.deepEqual(JSON.parse(payload), {
    type: "wuxuai_points_credit",
    token: placeholderReference,
  });
  assert.doesNotMatch(payload, /name|phone|email|customer_code/i);
});

test("staff scanner uses the established ZXing iPhone-compatible camera decoder", () => {
  assert.match(staffPortal, /import type \{ IScannerControls \} from "@zxing\/browser"/);
  assert.match(staffPortal, /new BrowserQRCodeReader\(undefined, \{ delayBetweenScanAttempts: 180 \}\)/);
  assert.match(staffPortal, /decodeFromConstraints/);
  assert.match(staffPortal, /facingMode: \{ ideal: "environment" \}/);
  assert.match(staffPortal, /scannerControls\.stop\(\)/);
  assert.match(staffPortal, /scannerHandlingResultRef\.current/);
  assert.doesNotMatch(staffPortal, /BarcodeDetector|requestAnimationFrame\(scanFrame\)/);
});

test("customer points QR uses the operational quiet-zone and contrast component", () => {
  assert.match(customerPortal, /<OperationalQrCode id="customer-points-credit-qr"/);
  assert.match(customerPortal, /buildCustomerPointsQrPayload\(pointsQr\.qr_token\)/);
  assert.doesNotMatch(customerPortal, /QRCodeSVG value=\{JSON\.stringify\(\{ type: "wuxuai_points_credit"/);
  assert.equal(OPERATIONAL_QR_CONFIG.marginModules, 4);
  assert.equal(OPERATIONAL_QR_CONFIG.screenSize, 270);
});

test("scanner contract accepts current payload and manual code but rejects unrelated QR values", () => {
  assert.equal(extractCustomerPointsQrReference("1234 5678"), "12345678");
  assert.equal(extractCustomerPointsQrReference('{"type":"wuxuai_points_credit","token":"current"}'), "current");
  assert.equal(extractCustomerPointsQrReference('{"type":"wuxuai_reward","token":"other"}'), null);
  assert.equal(extractCustomerPointsQrReference("123456"), null);
  assert.equal(extractCustomerPointsQrReference("https://example.invalid/customer"), null);
});

test("invalid QR feedback remains visible while manual fallback stays available", () => {
  assert.match(staffPortal, /Dieser QR-Code ist kein gültiger Kunden-QR\. Bitte versuche es erneut\./);
  assert.match(staffPortal, /Kunden-QR ruhig und vollständig in den Rahmen halten\./);
  assert.match(staffPortal, /QR nicht verfügbar\? Gast suchen/);
  assert.match(staffPortal, /Name, Telefon oder Gästecode/);
  assert.match(loyaltyService, /QR_NOT_FOUND/);
  assert.match(loyaltyService, /ungültig, abgelaufen oder gehört nicht zu diesem Restaurant/);
});
