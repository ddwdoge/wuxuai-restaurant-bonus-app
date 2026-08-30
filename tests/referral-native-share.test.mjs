import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  referralSharePayload,
  supportsNativeReferralShare,
} from "../src/modules/customer/referralShare.mjs";

const read = async (path) => readFile(new URL(path, import.meta.url), "utf8");

test("Referral share payload contains only copy and the canonical public URL", () => {
  const url = "https://bonus.wuxuaisbi.com/r/test-lokal/public-token";
  assert.deepEqual(referralSharePayload("Test Lokal", url), {
    title: "Komm mit zu Test Lokal",
    text: "Ich lade dich zu Test Lokal ein. Melde dich über meinen Einladungslink an.",
    url,
  });
});

test("Native share is rendered only where Web Share exists", () => {
  assert.equal(supportsNativeReferralShare({ share() {} }), true);
  assert.equal(supportsNativeReferralShare({}), false);
  assert.equal(supportsNativeReferralShare(null), false);
});

test("Customer referral keeps QR and link while adding share and copy actions", async () => {
  const portal = await read("../src/modules/customer/CustomerPortal.tsx");
  assert.match(portal, /navigator\.share\(referralSharePayload\(restaurant\.name, referralLink\)\)/);
  assert.match(portal, /navigator\.clipboard\.writeText\(referralLink\)/);
  assert.match(portal, /Einladung teilen/);
  assert.match(portal, /Einladungslink kopiert/);
  assert.match(portal, /QRCodeSVG[^>]*value=\{referralLink\}/);
  assert.match(portal, /Einladungslink öffnen/);
});

test("Share controls remain touch friendly on mobile", async () => {
  const css = await read("../src/modules/customer/customer-premium.css");
  assert.match(css, /\.referral-share-actions button \{[^}]*min-height: 44px;[^}]*width: 100%;/);
});

