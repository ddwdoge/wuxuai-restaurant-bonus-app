import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = async (path) => readFile(new URL(path, import.meta.url), "utf8");

const [portal, premiumCss, carouselCss] = await Promise.all([
  read("../src/modules/customer/CustomerPortal.tsx"),
  read("../src/modules/customer/customer-premium.css"),
  read("../src/modules/customer/components/premium-horizontal-carousel.css"),
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

  assert.equal((redeemSection.match(/premium-redemption-rewards/g) ?? []).length, 1);
  assert.ok(redeemSection.indexOf("premium-redemption-rewards") < redeemSection.indexOf("filteredRedemptions.length"));
});

test("Reward-Carousel und Empty State liegen im selben kanonischen Contentbereich", () => {
  const contentStart = redeemSection.indexOf('className="premium-redemption-rewards"');

  assert.ok(contentStart >= 0);
  assert.ok(redeemSection.indexOf("<PremiumHorizontalCarousel", contentStart) > contentStart);
  assert.ok(redeemSection.indexOf("<RewardCard", contentStart) > contentStart);
  assert.ok(redeemSection.indexOf("<EmptyState", contentStart) > contentStart);
});

test("kurze Tab-Inhalte duerfen die gemeinsame Kopfgeometrie nicht strecken", () => {
  assert.match(premiumCss, /\.customer-page-container\s*\{[^}]*align-content: start;/);
  assert.match(premiumCss, /\.premium-redemption-content\s*\{[^}]*align-content: start;[^}]*gap: 16px;/);
  assert.match(premiumCss, /\.premium-redemption-content > \*[^}]*width: 100%;/);
  assert.doesNotMatch(premiumCss, /premium-redemption-(?:content|grid)[^{]*\.(?:all|mine)/);
});

test("Einloesen bleibt fuer Mobile und Desktop in derselben Carousel-Geometrie", () => {
  assert.match(carouselCss, /\.premium-horizontal-carousel-item[^}]*flex: 0 0 var\(--customer-card-mobile-width, 83%\)/);
  assert.match(premiumCss, /--customer-card-mobile-width: 83%/);
  assert.match(carouselCss, /@media \(min-width: 768px\)[\s\S]*flex-basis: 58%/);
  assert.match(carouselCss, /@media \(min-width: 1024px\)[\s\S]*flex-basis: 46%/);
  assert.match(premiumCss, /@media \(max-width: 380px\)/);
  assert.doesNotMatch(`${premiumCss}\n${carouselCss}`, /width:\s*100vw/);
});
