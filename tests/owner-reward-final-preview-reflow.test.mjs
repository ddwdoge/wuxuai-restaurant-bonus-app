import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const css = read("src/modules/admin/admin-premium.css");
const rewardsPage = read("src/modules/admin/pages/RewardsPage.tsx");

test("Owner-Schritt-5-Rahmen bleibt alleinige 16:9-Geometrieautorität", () => {
  assert.match(
    css,
    /\.premium-owner-editor \.premium-customer-reward-preview\.large > div \{[\s\S]*?aspect-ratio: 16 \/ 9;[\s\S]*?min-height: 0;[\s\S]*?overflow: hidden;[\s\S]*?position: relative;[\s\S]*?width: 100%;[\s\S]*?\}/,
  );
});

test("RewardImageFrame füllt Schritt 5 absolut und ohne prozentuale Kindhöhe", () => {
  const rule = css.match(/\.premium-owner-editor \.premium-customer-reward-preview\.large > div > \.reward-image-frame \{([\s\S]*?)\}/)?.[1] ?? "";
  assert.match(rule, /aspect-ratio: auto;/);
  assert.match(rule, /height: auto;/);
  assert.match(rule, /inset: 0;/);
  assert.match(rule, /position: absolute;/);
  assert.match(rule, /width: auto;/);
  assert.doesNotMatch(rule, /height:\s*100%/);
});

test("URL, Fokus, Zoom und Render-Scale bleiben im bestehenden Renderer gebunden", () => {
  assert.match(rewardsPage, /<RewardImageFrame alt=\{rewardTitle\} crop=\{photoCrop\} imageUrl=\{photoPreview\} \/>/);
  assert.doesNotMatch(rewardsPage, /ResizeObserver|getBoundingClientRect|offsetHeight|clientHeight/);
});
