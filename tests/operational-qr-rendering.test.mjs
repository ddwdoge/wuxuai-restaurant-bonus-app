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
import { OPERATIONAL_QR_CONFIG, OPERATIONAL_QR_EXPORT } from "../src/shared/lib/operationalQr.mjs";
import { buildStaffLoginPath } from "../src/modules/auth/staffLoginFlow.mjs";

const qrCenter = await readFile(new URL("../src/modules/admin/pages/QrCenterPage.tsx", import.meta.url), "utf8");
const onboarding = await readFile(new URL("../src/modules/admin/pages/RestaurantOnboarding.tsx", import.meta.url), "utf8");
const qrComponent = await readFile(new URL("../src/shared/components/OperationalQrCode.tsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

function renderOperationalQr(value) {
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
  assert.ok(viewBox && foregroundPath, "QR SVG must expose a square module grid and black foreground path");

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
  const hints = new Map([[DecodeHintType.PURE_BARCODE, true]]);
  return {
    moduleCount,
    text: new QRCodeReader().decode(bitmap, hints).getText(),
  };
}

test("Staff QR renders with the approved short route and decodes exactly", () => {
  const publicBaseUrl = "https://bonus.wuxuaisbi.com";
  const expected = `${publicBaseUrl}${buildStaffLoginPath("wu-und-xu-group-gmbh")}`;
  const decoded = decodeRenderedQr(renderOperationalQr(expected));

  assert.equal(expected, "https://bonus.wuxuaisbi.com/staff/login?restaurant=wu-und-xu-group-gmbh");
  assert.equal(decoded.text, expected);
  assert.equal(decoded.moduleCount, 45);
});

test("new guest QR uses the same reliable rendering contract and remains decodable", () => {
  const expected = "https://bonus.wuxuaisbi.com/customer/wu-und-xu-group-gmbh";
  assert.equal(decodeRenderedQr(renderOperationalQr(expected)).text, expected);
});

test("operational QR contract has a specification-size quiet zone and maximum contrast", () => {
  assert.deepEqual(OPERATIONAL_QR_CONFIG, {
    backgroundColor: "#ffffff",
    errorCorrectionLevel: "M",
    foregroundColor: "#000000",
    marginModules: 4,
    screenSize: 270,
  });
  assert.match(qrComponent, /marginSize=\{OPERATIONAL_QR_CONFIG\.marginModules\}/);
  assert.match(qrComponent, /bgColor=\{OPERATIONAL_QR_CONFIG\.backgroundColor\}/);
  assert.match(qrComponent, /fgColor=\{OPERATIONAL_QR_CONFIG\.foregroundColor\}/);
  assert.doesNotMatch(qrComponent, /imageSettings|logo|gradient/i);
});

test("screen, PNG and Starter Kit paths preserve native resolution without smoothing", () => {
  assert.deepEqual(OPERATIONAL_QR_EXPORT, { canvasSize: 1260, inset: 90, qrSize: 1080 });
  assert.match(styles, /\.operational-qr-code\s*\{[\s\S]*height:\s*270px[\s\S]*shape-rendering:\s*crispEdges[\s\S]*width:\s*270px/);
  assert.match(qrCenter, /context\.imageSmoothingEnabled = false/g);
  assert.match(onboarding, /context\.imageSmoothingEnabled = false/g);
  assert.match(qrCenter, /<OperationalQrCode id="qr-staff"/);
  assert.match(qrCenter, /<OperationalQrCode id="qr-restaurant"/);
  assert.match(onboarding, /<OperationalQrCode id=\{id\}/);
  assert.match(qrCenter, /staffQrId: "qr-staff"/);
  assert.match(onboarding, /staffQrId: "staff-qr"/);
});
