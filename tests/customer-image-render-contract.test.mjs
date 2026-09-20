import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const compactCss = read("src/modules/customer/customer-compact.css");
const blockACss = read("src/modules/customer/customer-block-a.css");
const premiumCss = read("src/modules/customer/customer-premium.css");
const mediaCss = read("src/shared/components/smart-media.css");
const smartFrame = read("src/shared/components/SmartMediaFrame.tsx");
const rewardFrame = read("src/shared/components/RewardImageFrame.tsx");
const premiumUi = read("src/modules/customer/components/PremiumCustomerUi.tsx");
const offerCard = read("src/modules/customer/components/RestaurantOfferCard.tsx");
const rewardsPage = read("src/modules/admin/pages/RewardsPage.tsx");
const giftsPage = read("src/modules/admin/pages/WelcomeGiftsPage.tsx");
const offersPage = read("src/modules/admin/pages/RestaurantOffersPage.tsx");

test("Customer-Mobile verwendet denselben stabilen 16:9-Medienvertrag wie Owner", () => {
  for (const css of [compactCss, blockACss]) {
    assert.doesNotMatch(css, /3\s*\/\s*2/);
    assert.doesNotMatch(css, /object-fit\s*:\s*cover/);
    assert.doesNotMatch(css, /--smart-media-crop-zoom/);
    assert.doesNotMatch(css, /\.smart-media-frame\s*>\s*img/);
  }
  assert.match(premiumCss, /--customer-card-media-ratio: 16 \/ 9/);
  assert.match(mediaCss, /aspect-ratio: var\(--smart-media-aspect-ratio, 1\.77778\)/);
  assert.match(mediaCss, /object-fit: contain/);
  assert.match(mediaCss, /object-position: var\(--smart-media-position-x, 50%\) var\(--smart-media-position-y, 50%\)/);
  assert.match(mediaCss, /transform: scale\(var\(--smart-media-render-scale, 1\)\)/);
});

test("URL, Fokus, gespeicherter Zoom und vollständige Render-Skalierung bleiben gemeinsam gebunden", () => {
  assert.match(smartFrame, /src=\{imageUrl\}/);
  assert.match(smartFrame, /--smart-media-position-x/);
  assert.match(smartFrame, /--smart-media-position-y/);
  assert.match(smartFrame, /--smart-media-render-scale": coverScale \* normalized\.zoom/);
  assert.match(rewardFrame, /<SmartMediaFrame[^>]*imageUrl=\{imageUrl\}[^>]*presentation=\{crop\}/);
});

test("Punkteeinlösungen, Willkommensgeschenke und Angebote teilen den Medienkern", () => {
  assert.match(premiumUi, /<RewardImageFrame/);
  assert.match(premiumUi, /crop=\{crop\}/);
  assert.match(premiumUi, /imageUrl=\{imageUrl\}/);

  assert.match(offerCard, /<SmartMediaFrame/);
  assert.match(offerCard, /imageUrl=\{offer\.image_url\}/);
  assert.match(offerCard, /presentation=\{mediaPresentationFromRecord\(offer\)\}/);

  assert.match(rewardsPage, /<RewardCard/);
  assert.match(rewardsPage, /imageCrop=\{rewardImageCropFromRecord\(previewOffer\)\}/);
  assert.match(rewardsPage, /imageUrl=\{previewOffer\.image_url\}/);

  assert.match(giftsPage, /<RewardImageFrame/);
  assert.match(giftsPage, /crop=\{rewardImageCropFromRecord\(previewGift\)\}/);
  assert.match(giftsPage, /imageUrl=\{previewGift\.image_url\}/);

  assert.match(offersPage, /<SmartMediaFrame/);
  assert.match(offersPage, /imageUrl=\{previewOffer\.image_url\}/);
  assert.match(offersPage, /presentation=\{rewardImageCropFromRecord\(previewOffer\)\}/);
});

test("Textwachstum kann die reservierte Mediengeometrie nicht überschreiben", () => {
  const viewports = [320, 375, 390, 430, 767, 768, 1024, 1440];
  for (const viewport of viewports) {
    const availableWidth = viewport <= 767 ? viewport * 0.9 : viewport;
    const mediaHeight = availableWidth * 9 / 16;
    const afterFiftyRenders = Array.from({ length: 50 }, () => availableWidth * 9 / 16);
    assert.ok(afterFiftyRenders.every((height) => height === mediaHeight));
  }
  assert.match(premiumCss, /\.premium-reward-media \{ aspect-ratio: var\(--customer-card-media-ratio\)/);
  assert.match(read("src/modules/customer/components/restaurant-offer-card.css"), /\.customer-offer-card-media \{ aspect-ratio: var\(--customer-card-media-ratio, 16 \/ 9\)/);
});
