import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const rewardsPage = read("src/modules/admin/pages/RewardsPage.tsx");
const adminCss = read("src/modules/admin/admin-premium.css");
const customerUi = read("src/modules/customer/components/PremiumCustomerUi.tsx");
const smartMedia = read("src/shared/components/SmartMediaFrame.tsx");
const smartMediaCss = read("src/shared/components/smart-media.css");

test("Owner-Drawer verwendet denselben praesentationalen RewardCard-Renderer wie Customer", () => {
  assert.match(rewardsPage, /import \{ RewardCard \} from "\.\.\/\.\.\/customer\/components\/PremiumCustomerUi"/);
  assert.match(rewardsPage, /<RewardCard[^>]*imageCrop=\{rewardImageCropFromRecord\(previewOffer\)\}[^>]*imageFirst[^>]*imageUrl=\{previewOffer\.image_url\}/);
  assert.match(customerUi, /export function RewardCard/);
  assert.match(customerUi, /<RewardImage crop=\{imageCrop\}[^>]*imageUrl=\{imageUrl\}/);
});

test("Owner-Vorschau bleibt rein praesentational und ohne Customer-Aktion", () => {
  const preview = rewardsPage.match(/description="So sehen Gäste dieses Angebot im Kundenportal\."([\s\S]*?)<\/AppDrawer>/)?.[1] ?? "";
  assert.match(preview, /<RewardCard/);
  assert.doesNotMatch(preview, /onOpen=|openRewardRedemption|track|redeem/i);
  assert.match(preview, /Diese Vorschau löst keine Punkteeinlösung aus\./);
});

test("Bilddaten und vollstaendiger gemeinsamer Medienvertrag bleiben identisch", () => {
  assert.match(rewardsPage, /imageUrl=\{previewOffer\.image_url\}/);
  assert.match(rewardsPage, /imageCrop=\{rewardImageCropFromRecord\(previewOffer\)\}/);
  assert.match(smartMedia, /--smart-media-position-x/);
  assert.match(smartMedia, /--smart-media-position-y/);
  assert.match(smartMedia, /--smart-media-render-scale": coverScale \* normalized\.zoom/);
  assert.match(smartMediaCss, /object-fit: contain/);
  assert.match(smartMediaCss, /transform: scale\(var\(--smart-media-render-scale, 1\)\)/);
});

test("Preview-Shell veraendert keine Mediengeometrie und Safari-Fix bleibt erhalten", () => {
  const shell = adminCss.match(/\.premium-owner-customer-reward-preview\.customer-premium-shell \{([\s\S]*?)\}/)?.[1] ?? "";
  assert.doesNotMatch(shell, /aspect-ratio|object-fit|transform|\n\s*height\s*:/);
  assert.match(adminCss, /\.premium-owner-editor \.premium-customer-reward-preview\.large > div > \.reward-image-frame \{[\s\S]*?inset: 0;[\s\S]*?position: absolute;/);
});
