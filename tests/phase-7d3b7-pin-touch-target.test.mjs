import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../src/modules/customer/customer-premium.css", import.meta.url), "utf8");
const portal = readFileSync(new URL("../src/modules/customer/CustomerPortal.tsx", import.meta.url), "utf8");

test("secure redemption PIN has a scoped 44px border-box touch target", () => {
  assert.match(portal, /className="premium-redemption-pin-entry"/);
  assert.match(portal, /id="secure-redemption-pin"[\s\S]*?className="input"|className="input"[\s\S]*?id="secure-redemption-pin"/);
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]+)\}/g)]
    .filter(([, selector]) => selector.trim() === ".premium-redemption-pin-entry .input");
  assert.equal(rules.length, 1);
  assert.match(rules[0][2], /\bbox-sizing:\s*border-box\s*;/);
  assert.match(rules[0][2], /\bmin-height:\s*44px\s*;/);
  assert.doesNotMatch(rules[0][2], /!important/);
});
