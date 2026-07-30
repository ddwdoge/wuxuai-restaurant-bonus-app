import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { restaurantTargetFromQrValue } from "../src/modules/customer/customerRestaurantQr.mjs";

const portalSource = await readFile(new URL("../src/modules/customer/CustomerPortal.tsx", import.meta.url), "utf8");
const scannerSource = await readFile(new URL("../src/modules/customer/components/CustomerRestaurantScanner.tsx", import.meta.url), "utf8");
const premiumCss = await readFile(new URL("../src/modules/customer/customer-premium.css", import.meta.url), "utf8");
const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

test("Restaurant-QR A und B erzeugen getrennte neue Sammelpfade", () => {
  const allowedOrigins = ["https://bonus.wuxuaisbi.com"];
  const restaurantA = restaurantTargetFromQrValue("https://bonus.wuxuaisbi.com/w/restaurant-a", allowedOrigins);
  const restaurantB = restaurantTargetFromQrValue("https://bonus.wuxuaisbi.com/customer/restaurant-b", allowedOrigins);

  assert.deepEqual(restaurantA, { restaurantSlug: "restaurant-a", targetPath: "/w/restaurant-a" });
  assert.deepEqual(restaurantB, { restaurantSlug: "restaurant-b", targetPath: "/w/restaurant-b" });
  assert.notEqual(restaurantA.targetPath, restaurantB.targetPath);
});

test("gescannter Token und alter URL-Kontext werden beim Restaurantwechsel nicht übernommen", () => {
  const target = restaurantTargetFromQrValue(
    "https://bonus.wuxuaisbi.com/customer/restaurant-b?token=fremder-kundenzugang&reward=alt",
    ["https://bonus.wuxuaisbi.com"],
  );

  assert.deepEqual(target, { restaurantSlug: "restaurant-b", targetPath: "/w/restaurant-b" });
  assert.doesNotMatch(target.targetPath, /token|reward|restaurant-a/);
  assert.match(portalSource, /setSelectedTierKey\(""\)/);
  assert.match(portalSource, /setDailyPin\(""\)/);
  assert.match(portalSource, /window\.location\.assign\(targetPath\)/);
});

test("ungültige oder fremde QR-Codes aktivieren kein altes Restaurant", () => {
  const allowedOrigins = ["https://bonus.wuxuaisbi.com"];
  assert.equal(restaurantTargetFromQrValue("kein-qr-link", allowedOrigins), null);
  assert.equal(restaurantTargetFromQrValue("https://example.com/w/restaurant-b", allowedOrigins), null);
  assert.equal(restaurantTargetFromQrValue("https://bonus.wuxuaisbi.com/customer", allowedOrigins), null);
  assert.equal(restaurantTargetFromQrValue("https://bonus.wuxuaisbi.com/customer/restaurants", allowedOrigins), null);
  assert.match(scannerSource, /Dieser QR-Code konnte keinem Restaurant zugeordnet werden\./);
  assert.match(portalSource, /window\.location\.assign\("\/customer"\)/);
});

test("Customer-Scanner nutzt echte Kamera, ZXing und zugängliche Aktionen", () => {
  assert.equal(packageJson.dependencies["@zxing/browser"], "^0.1.5");
  assert.equal(packageJson.dependencies["@zxing/library"], "^0.21.3");
  assert.match(scannerSource, /navigator\.mediaDevices\?\.getUserMedia/);
  assert.match(scannerSource, /await import\("@zxing\/browser"\)/);
  assert.match(scannerSource, /decodeFromConstraints/);
  assert.match(scannerSource, /facingMode:\s*\{ ideal: "environment" \}/);
  assert.match(scannerSource, /aria-label="Anderes Restaurant erneut scannen"/);
  assert.match(portalSource, /aria-label="Anderes Restaurant scannen"/);
  assert.match(scannerSource, /playsInline/);
});

test("Scannerfehler sind verständlich und Touchziele mindestens 44 Pixel groß", () => {
  assert.match(scannerSource, /Der Kamerazugriff wurde nicht erlaubt/);
  assert.match(scannerSource, /Erneut scannen/);
  assert.match(scannerSource, />\s*Abbrechen\s*</);
  assert.match(premiumCss, /\.customer-restaurant-scanner-error button\s*\{[\s\S]*?min-height:\s*44px/);
  assert.match(premiumCss, /\.customer-restaurant-scanner-cancel\s*\{[^}]*min-height:\s*44px/);
  assert.match(premiumCss, /\.premium-collect-text-button\s*\{[^}]*min-height:\s*44px/);
});
