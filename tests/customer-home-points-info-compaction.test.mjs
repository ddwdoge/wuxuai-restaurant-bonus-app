import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const portal = readFileSync(new URL("../src/modules/customer/CustomerPortal.tsx", import.meta.url), "utf8");
const components = readFileSync(new URL("../src/modules/customer/components/PremiumCustomerUi.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/modules/customer/customer-premium.css", import.meta.url), "utf8");

const homeStart = portal.indexOf('activeView === "home"');
const offersStart = portal.indexOf('aria-label="Aktuelles und Angebote"', homeStart);
const homeBeforeOffers = portal.slice(homeStart, offersStart);

test("Punktehinweis ist im fokussierten Drawer statt im Home-Seitenfluss", () => {
  assert.doesNotMatch(homeBeforeOffers, /premium-legal-notice/);
  assert.match(portal, /title="Informationen zu deinen Punkten"/);
  assert.match(portal, /Punkte haben keinen Geldwert, sind nicht auszahlbar und gelten nur im Bonusprogramm dieses Restaurants\. \{pointsValidityText\}/);
  assert.match(portal, /open=\{pointsInfoOpen\}/);
});

test("Punktekarte öffnet den Drawer über einen zugänglichen Infobutton", () => {
  assert.match(portal, /onInfo=\{\(\) => setPointsInfoOpen\(true\)\}/);
  assert.match(components, /aria-label="Informationen zu Punkten"/);
  assert.match(components, /className="premium-points-info"/);
  assert.match(styles, /\.premium-points-info \{[^}]*flex: 0 0 44px;[^}]*height: 44px;/s);
  assert.match(styles, /\.premium-points-info:focus-visible/);
});

test("Angebote folgen der Punktekarte ohne künstliche Positionierung", () => {
  assert.ok(offersStart > homeStart);
  assert.doesNotMatch(styles, /\.premium-points-card[^}]*position:\s*absolute/s);
  assert.doesNotMatch(styles, /\.premium-content-section[^}]*margin-top:\s*-/s);
});
