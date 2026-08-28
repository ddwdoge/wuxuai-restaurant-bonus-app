import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildStarterKitFilename,
  normalizeStarterKitRestaurantName,
} from "../src/shared/lib/starterKitFilename.mjs";

const qrCenter = await readFile(new URL("../src/modules/admin/pages/QrCenterPage.tsx", import.meta.url), "utf8");
const onboarding = await readFile(new URL("../src/modules/admin/pages/RestaurantOnboarding.tsx", import.meta.url), "utf8");

test("canonical filename transliterates and identifies the current Restaurant", () => {
  const date = new Date("2026-08-28T12:00:00Z");
  assert.equal(
    buildStarterKitFilename("Kaffee Konditorei bäckerei", date),
    "WUXUAI-Starter-Kit_Kaffee-Konditorei-Baeckerei_2026-08-28.pdf",
  );
  assert.equal(
    buildStarterKitFilename("Akakiko Hietzing", date),
    "WUXUAI-Starter-Kit_Akakiko-Hietzing_2026-08-28.pdf",
  );
});

test("canonical filename uses the Vienna calendar day instead of UTC", () => {
  assert.equal(
    buildStarterKitFilename("Testlokal", new Date("2026-08-28T22:30:00Z")),
    "WUXUAI-Starter-Kit_Testlokal_2026-08-29.pdf",
  );
});

test("unsafe and extreme Restaurant names cannot create path-like filenames", () => {
  const normalized = normalizeStarterKitRestaurantName(`../../Küche\\Test:*?\"<>| ${"lang ".repeat(40)}`);
  assert.ok(normalized.length <= 80);
  assert.doesNotMatch(normalized, /[\\/:*?"<>|]/);
  assert.doesNotMatch(normalized, /--|^-|-$|\.\./);
});

test("missing Restaurant name falls back without a UUID", () => {
  const filename = buildStarterKitFilename("", new Date("2026-08-28T12:00:00Z"));
  assert.equal(filename, "WUXUAI-Starter-Kit_2026-08-28.pdf");
  assert.doesNotMatch(filename, /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
  assert.equal((filename.match(/\.pdf/g) ?? []).length, 1);
});

test("both Starter Kit flows download a named PDF File", () => {
  for (const source of [qrCenter, onboarding]) {
    assert.match(source, /buildStarterKitFilename\(/);
    assert.match(source, /new File\(\[pdf\], filename, \{ type: "application\/pdf" \}\)/);
    assert.match(source, /triggerDownload\([^;]+filename\)/);
  }
  assert.match(qrCenter, /Starter Kit herunterladen/);
  assert.doesNotMatch(qrCenter, /openPdfBlob|restaurant-starter-kit-a6\.pdf/);
  assert.doesNotMatch(onboarding, /restaurant-starter-kit\.pdf/);
});
