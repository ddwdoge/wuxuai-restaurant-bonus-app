import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(
  new URL("../src/modules/verification/OwnerBusinessVerificationPage.tsx", import.meta.url),
  "utf8",
);

test("KYB owner page distinguishes loading, successful empty data and query errors", () => {
  assert.match(page, /status: "loading" \| "ready" \| "error"/);
  assert.match(page, /data-testid="owner-business-verification-loading"/);
  assert.match(page, /aria-live="polite" role="status">\{t\.loading\}/);
  assert.match(page, /data-testid="owner-business-verification-error"/);
  assert.match(page, /role="alert">\{t\.failed\}/);
  assert.match(page, /data-testid="owner-business-verification"/);

  const loadingBranch = page.slice(
    page.indexOf('if (currentLoadStatus === "loading")'),
    page.indexOf('if (currentLoadStatus === "error")'),
  );
  assert.doesNotMatch(loadingBranch, /t\.none|documentsText\.empty|displayedVerificationStatus/);
});

test("all owner KYB reads settle before the ready state is rendered", () => {
  assert.match(
    page,
    /Promise\.all\(\[\s*readOwnerVerification\(restaurantId\),\s*listOwnerKybDocuments\(restaurantId\),\s*readOwnerKybIntakeSummary\(restaurantId\),\s*\]\)/,
  );
  assert.match(page, /setDocuments\(ownerDocuments\);\s*setLoadState\(\{ restaurantId, status: "ready" \}\)/);
  assert.match(page, /catch \{\s*if \(loadRequest\.current !== request\) return;\s*setLoadState\(\{ restaurantId, status: "error" \}\)/);
});

test("restaurant changes and unmounts invalidate stale KYB responses", () => {
  assert.match(page, /const request = loadRequest\.current \+ 1;/);
  assert.match(page, /if \(loadRequest\.current !== request\) return;/);
  assert.match(page, /return \(\) => \{ loadRequest\.current \+= 1; \};/);
  assert.match(page, /loadState\.restaurantId === restaurantId \? loadState\.status : "loading"/);
});

test("all seven supported locales provide a neutral loading message", () => {
  for (const locale of ["de", "en", "fr", "it", "es", "zh", "ko"]) {
    assert.match(page, new RegExp(`\\n  ${locale}: \\{[^\\n]+loading:`));
  }
});
