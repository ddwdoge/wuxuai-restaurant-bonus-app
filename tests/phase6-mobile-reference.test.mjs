import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const css = read("src/modules/customer/customer-compact.css");
const mediaCss = read("src/shared/components/smart-media.css");
const portal = read("src/modules/customer/CustomerPortal.tsx");
const report = read("docs/reports/2026-09-12_PHASE_6_MOBILE_COMPACT_UI_REPORT.md");
function openingElements(path) {
  const source = ts.createSourceFile(path, read(path), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const result = [];
  function visit(node) {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) result.push(node.tagName.getText(source));
    ts.forEachChild(node, visit);
  }
  visit(source);
  return result;
}
function sourceFiles(dir) {
  return readdirSync(new URL(dir, root), { withFileTypes: true }).flatMap((entry) => (
    entry.isDirectory() ? sourceFiles(`${dir}/${entry.name}`) : [`${dir}/${entry.name}`]
  ));
}

test("Phase 6 preserves its historical inventory alongside capacity and verification routes", () => {
  assert.equal(openingElements("src/app/App.tsx").filter((name) => name === "Route").length, 53);
  const rows = [...report.matchAll(/^\| (\d+) \| .* \| ([VSG]) \|/gm)];
  assert.deepEqual(rows.map((row) => Number(row[1])), Array.from({ length: 50 }, (_, index) => index + 1));
  assert.equal(rows.filter((row) => row[2] === "V").length, 42);
  assert.equal(rows.filter((row) => row[2] === "S").length, 5);
  assert.equal(rows.filter((row) => row[2] === "G").length, 3);
  assert.match(read("src/modules/admin/pages/BrandingPage.tsx"), /<Navigate replace to="\/admin\/settings\/aussehen"/);
});

test("Drawer inventory includes capacity and verification drawers", () => {
  const names = new Set(["AppDrawer", "UiDialog", "PremiumDrawer", "ConfirmationDialog"]);
  const count = sourceFiles("src").filter((path) => path.endsWith(".tsx"))
    .flatMap(openingElements).filter((name) => names.has(name)).length;
  assert.equal(count, 46);
  const rows = [...report.matchAll(/^\| D(\d+) \|/gm)];
  assert.deepEqual(rows.map((row) => Number(row[1])), Array.from({ length: 40 }, (_, index) => index + 1));
});

test("Compact reference is scoped to authenticated restaurant Home and mobile media queries", () => {
  assert.match(portal, /className=\{customer && !isBonusCollection && activeView === "home" \? "customer-home-compact" : undefined\}/);
  assert.match(css, /@media \(max-width: 767px\)/);
  assert.match(css, /@media \(max-width: 359px\)/);
  assert.doesNotMatch(css, /\bzoom\s*:|visibility\s*:\s*hidden|!important/);
  assert.deepEqual([...css.matchAll(/transform\s*:\s*([^;]+);/g)].map((match) => match[1]), ["none"]);
  assert.doesNotMatch(css, /3\s*\/\s*2|object-fit\s*:\s*cover|--smart-media-crop-zoom/);
  assert.match(mediaCss, /aspect-ratio: var\(--smart-media-aspect-ratio, 1\.77778\)/);
  assert.match(mediaCss, /object-fit: contain/);
  assert.match(mediaCss, /transform: scale\(var\(--smart-media-render-scale, 1\)\)/);
});

test("Image-first reference preserves benefit actions while placing offers ahead of status tiles", () => {
  const benefits = portal.indexOf('aria-label="Deine Vorteile"');
  const offers = portal.indexOf('{restaurantOffers.length ? (');
  assert.ok(offers > 0 && benefits > offers);
  for (const label of ["Willkommensgeschenk", "Geburtstagsgeschenk", "Bonus Boost", "Freund einladen"]) {
    assert.ok(portal.slice(benefits).includes(`label="${label}"`));
  }
  assert.match(portal, /onClick=\{referralInviteEnabled \? handleCreateReferralLink : undefined\}/);
  assert.match(portal, /disabled=\{creatingReferral \|\| !referralInviteEnabled\}/);
  assert.match(portal, /restaurantOffers\.map\(\(offer\)/);
  assert.match(portal, /pointRedemptions\.map\(\(reward\)/);
  assert.match(portal, /activeGifts\.map\(\(gift\)/);
});

test("Compact CSS keeps minimum actions, readable titles and 320 single-column fallback", () => {
  assert.match(css, /\.premium-button \{ min-height: 48px;/);
  assert.match(css, /\.premium-text-button \{ min-height: 44px; min-width: 44px;/);
  assert.match(css, /\.premium-benefit-tile strong \{ font-size: 16px;/);
  assert.match(css, /\.premium-benefit-grid \{ grid-template-columns: minmax\(0, 1fr\);/);
  assert.match(css, /max\(12px, env\(safe-area-inset-left\)\)/);
  assert.match(css, /white-space: normal/);
  assert.doesNotMatch(css, /QRCode|qr-|daily.?pin|health-|country-/i);
});
