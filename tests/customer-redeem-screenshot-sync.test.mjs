import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = async (path) => readFile(new URL(path, import.meta.url), "utf8");

const [portal, premiumCss] = await Promise.all([
  read("../src/modules/customer/CustomerPortal.tsx"),
  read("../src/modules/customer/customer-premium.css"),
]);

const redeemSection = portal.slice(
  portal.indexOf('{activeView === "redemptions"'),
  portal.indexOf('{activeView === "account"'),
);

test("beide Einloesen-Tabs verwenden eine gemeinsame unveraenderliche Seitenschale", () => {
  for (const sharedPart of [
    "premium-page-heading",
    "premium-segmented-control",
    "premium-redemption-summary",
    "premium-legal-notice",
  ]) {
    assert.equal((redeemSection.match(new RegExp(sharedPart, "g")) ?? []).length, 1);
  }

  assert.equal((redeemSection.match(/premium-reward-grid premium-redemption-grid/g) ?? []).length, 1);
  assert.ok(redeemSection.indexOf("premium-redemption-grid") < redeemSection.indexOf("filteredRedemptions.length"));
});

test("Reward-Karten und Empty State liegen im selben kanonischen Content-Grid", () => {
  const gridStart = redeemSection.indexOf('className="premium-reward-grid premium-redemption-grid"');
  const gridEnd = redeemSection.indexOf("</div>", gridStart);

  assert.ok(gridStart >= 0);
  assert.ok(redeemSection.indexOf("<RewardCard", gridStart) < gridEnd);
  assert.ok(redeemSection.indexOf("<EmptyState", gridStart) < gridEnd);
});

test("kurze Tab-Inhalte duerfen die gemeinsame Kopfgeometrie nicht strecken", () => {
  assert.match(premiumCss, /\.customer-page-container\s*\{[^}]*align-content: start;/);
  assert.match(premiumCss, /\.premium-redemption-content\s*\{[^}]*align-content: start;[^}]*gap: 16px;/);
  assert.match(premiumCss, /\.premium-redemption-content > \*[^}]*width: 100%;/);
  assert.doesNotMatch(premiumCss, /premium-redemption-(?:content|grid)[^{]*\.(?:all|mine)/);
});

test("Einloesen bleibt fuer Mobile und Desktop in derselben Grid-Geometrie", () => {
  assert.match(premiumCss, /\.premium-redemption-grid[^}]*grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(premiumCss, /@media \(min-width: 768px\)[\s\S]*\.premium-redemption-grid[^}]*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(premiumCss, /@media \(max-width: 380px\)/);
  assert.doesNotMatch(premiumCss, /width:\s*100vw/);
});
