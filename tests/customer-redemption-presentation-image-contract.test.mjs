import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const customerPortal = read("src/modules/customer/CustomerPortal.tsx");
const customerCss = read("src/modules/customer/customer-premium.css");
const premiumUi = read("src/modules/customer/components/PremiumCustomerUi.tsx");
const smartMedia = read("src/shared/components/SmartMediaFrame.tsx");
const smartMediaCss = read("src/shared/components/smart-media.css");

const presentationStart = customerPortal.indexOf('{activePointsPresentation ? (');
const presentationEnd = customerPortal.indexOf('{activeRedemptionCode ? (', presentationStart);
const presentation = customerPortal.slice(presentationStart, presentationEnd);

test("Geburtstags-, Willkommens- und Punkteeinlösungen verwenden denselben Gift-Bildvertrag", () => {
  assert.ok(presentationStart >= 0 && presentationEnd > presentationStart);
  assert.match(presentation, /activePointsPresentation\.gift_type/);
  assert.match(presentation, /<RewardImage/);
  assert.doesNotMatch(presentation, /<RewardImageFrame/);
  assert.match(presentation, /imageUrl=\{activePointsPresentation\.reward_image_url\}/);
  assert.match(presentation, /image_zoom: activePointsPresentation\.image_zoom/);
  assert.match(presentation, /image_position_x: activePointsPresentation\.image_position_x/);
  assert.match(presentation, /image_position_y: activePointsPresentation\.image_position_y/);
  assert.match(presentation, /renderScaleMode="contain"/);
  assert.match(premiumUi, /<RewardImageFrame alt=\{title\} crop=\{crop\} imageUrl=\{imageUrl\}/);
});

test("die Präsentationsmedienfläche ist alleinige stabile 16:9-Geometrieautorität", () => {
  const frameRule = customerCss.match(/\.premium-presentation-image \{[^}]+\}/)?.[0] ?? "";
  const childRule = customerCss.match(/\.premium-presentation-image > \.premium-reward-image,[\s\S]*?\}/)?.[0] ?? "";

  assert.match(frameRule, /aspect-ratio: 16 \/ 9/);
  assert.match(frameRule, /min-height: 0/);
  assert.match(frameRule, /overflow: hidden/);
  assert.match(frameRule, /position: relative/);
  assert.match(childRule, /height: auto/);
  assert.match(childRule, /inset: 0/);
  assert.match(childRule, /position: absolute/);
  assert.doesNotMatch(childRule, /height:\s*100%/);
});

test("Bildquelle, Fokus, Zoom und vollständige Render-Skalierung bleiben unverändert", () => {
  assert.match(smartMedia, /--smart-media-position-x/);
  assert.match(smartMedia, /--smart-media-position-y/);
  assert.match(smartMedia, /--smart-media-render-scale": coverScale \* normalized\.zoom/);
  assert.match(smartMediaCss, /object-fit: contain/);
  assert.match(smartMediaCss, /transform: scale\(var\(--smart-media-render-scale, 1\)\)/);
});

test("nur die Einlösepräsentation entfernt den Cover-Basismaßstab", () => {
  assert.match(smartMedia, /renderScaleMode = "cover"/);
  assert.match(smartMedia, /if \(renderScaleMode === "contain"\)/);
  assert.match(smartMedia, /style\["--smart-media-render-scale"\] = normalized\.zoom/);
  assert.equal((customerPortal.match(/renderScaleMode="contain"/g) ?? []).length, 1);
});

test("Bestätigung, Countdown und Einlösungslogik bleiben Teil des unveränderten Fensters", () => {
  assert.match(presentation, /Bestätigung ausstehend/);
  assert.match(presentation, /Verbleibende Zeit/);
  assert.match(presentation, /<SwipeToRedeem/);
  assert.match(presentation, /handleConfirmRedemptionSwipe/);
  assert.match(presentation, /presentationSecondsRemaining/);
});

test("Erfolgs- und Fehlerausgänge erhalten keine erfundene Bildbindung", () => {
  const outcomeStart = customerPortal.indexOf('{redemptionOutcome ? (');
  const outcome = customerPortal.slice(outcomeStart, presentationStart);
  assert.ok(outcomeStart >= 0 && presentationStart > outcomeStart);
  assert.doesNotMatch(outcome, /<RewardImage(?:Frame)?/);
});
