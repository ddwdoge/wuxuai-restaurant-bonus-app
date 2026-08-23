import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const customerPortal = readFileSync("src/modules/customer/CustomerPortal.tsx", "utf8");
const customerCss = readFileSync("src/modules/customer/customer-premium.css", "utf8");

const applyStart = customerPortal.indexOf("const applyPointsPresentation = useCallback");
const applyEnd = customerPortal.indexOf("useEffect(() => {", applyStart);
const applyBlock = customerPortal.slice(applyStart, applyEnd);
const closeStart = customerPortal.indexOf("function closeRedemptionDrawer");
const closeEnd = customerPortal.indexOf("async function handleRedeemCustomerReward", closeStart);
const closeBlock = customerPortal.slice(closeStart, closeEnd);
const navigationStart = customerPortal.indexOf("function handleCustomerViewChange");
const navigationEnd = customerPortal.indexOf("function openRestaurantScanner", navigationStart);
const navigationBlock = customerPortal.slice(navigationStart, navigationEnd);
const indicatorStart = customerPortal.indexOf("className=\"premium-active-code\"");
const indicatorEnd = customerPortal.indexOf("<AppDrawer", indicatorStart);
const indicatorBlock = customerPortal.slice(indicatorStart, indicatorEnd);
const cssStart = customerCss.indexOf(".premium-active-code {");
const cssEnd = customerCss.indexOf(".premium-redemption-code", cssStart);
const indicatorCss = customerCss.slice(cssStart, cssEnd);

test("explicit presentation starts open the drawer once", () => {
  assert.equal(customerPortal.match(/applyPointsPresentation\(presentation, \{ openDrawer: true \}\)/g)?.length, 2);
});

test("hydration and polling update the presentation without reopening the drawer", () => {
  assert.ok(customerPortal.match(/applyPointsPresentation\(presentation\);/g)?.length >= 2);
  assert.match(applyBlock, /if \(options\.openDrawer\) setRedemptionDrawerOpen\(true\)/);
  const openingLines = applyBlock.split("\n").filter((line) => line.includes("setRedemptionDrawerOpen(true)"));
  assert.equal(openingLines.length, 2);
  assert.ok(openingLines.every((line) => line.includes("options.openDrawer")));
});

test("closing keeps the active server presentation and only closes its UI", () => {
  assert.match(closeBlock, /setRedemptionDrawerOpen\(false\)/);
  assert.match(closeBlock, /if \(!activeRedemptionCode && !activePointsPresentation\)/);
  assert.doesNotMatch(closeBlock, /setActivePointsPresentation\(null\)/);
});

test("server completion cannot force a consciously closed drawer open", () => {
  assert.match(applyBlock, /presentation\.status === "REDEEMED_COMPLETED"/);
  assert.match(applyBlock, /if \(options\.openDrawer\) setRedemptionDrawerOpen\(true\)/);
});

test("customer navigation does not reopen or discard a live presentation", () => {
  assert.match(navigationBlock, /setActiveView\(view\)/);
  assert.doesNotMatch(navigationBlock, /setRedemptionDrawerOpen|setActivePointsPresentation/);
});

test("closed active presentation remains visible as a compact manual reopen action", () => {
  assert.match(customerPortal, /\(activeRedemptionCode \|\| activePointsPresentation\) && !redemptionDrawerOpen/);
  assert.match(indicatorBlock, /setRedemptionDrawerOpen\(true\)/);
  assert.match(indicatorBlock, /Live-Einlösung aktiv/);
  assert.match(indicatorBlock, /premium-active-code-action">Anzeigen/);
});

test("indicator retains the live countdown", () => {
  assert.match(indicatorBlock, /presentationSecondsRemaining : redemptionSecondsRemaining/);
  assert.match(indicatorBlock, /padStart\(2, "0"\)/);
});

test("active indicator is in normal layout flow and remains keyboard visible", () => {
  assert.match(indicatorCss, /width: 100%/);
  assert.match(indicatorCss, /min-height: 64px/);
  assert.match(indicatorCss, /:focus-visible/);
  assert.doesNotMatch(indicatorCss, /position:\s*(fixed|sticky)/);
});

test("screen wake lock is released while the presentation drawer is closed", () => {
  assert.match(customerPortal, /!activePointsPresentation\?\.active \|\| !redemptionDrawerOpen \|\| !\("wakeLock" in navigator\)/);
});

test("legacy expiry and server finalization clear the active state without reopening UI", () => {
  const expiryStart = customerPortal.indexOf("if (!activeRedemptionCode || redemptionSecondsRemaining > 0");
  const expiryEnd = customerPortal.indexOf("const applyPointsPresentation", expiryStart);
  const expiryBlock = customerPortal.slice(expiryStart, expiryEnd);
  assert.match(expiryBlock, /setActiveRedemptionCode\(null\)/);
  assert.doesNotMatch(expiryBlock, /setRedemptionDrawerOpen\(true\)/);
});
