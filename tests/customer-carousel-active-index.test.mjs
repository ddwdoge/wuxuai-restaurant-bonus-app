import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  carouselScrollEndTolerance,
  resolveCarouselActiveIndex,
} from "../src/modules/customer/components/carouselActiveIndex.mjs";

const component = readFileSync(
  new URL("../src/modules/customer/components/PremiumHorizontalCarousel.tsx", import.meta.url),
  "utf8",
);
const css = readFileSync(
  new URL("../src/modules/customer/components/premium-horizontal-carousel.css", import.meta.url),
  "utf8",
);
const blockCss = readFileSync(
  new URL("../src/modules/customer/customer-block-a.css", import.meta.url),
  "utf8",
);

function resolve(overrides = {}) {
  return resolveCarouselActiveIndex({
    clientWidth: 672,
    devicePixelRatio: 1,
    itemStartDistances: [-475, -72.40625, 330.1875],
    scrollLeft: 524,
    scrollWidth: 1196,
    ...overrides,
  });
}

test("768 px scroll end selects the last card on the first arrival", () => {
  assert.equal(resolve(), 2);
  assert.equal(resolve({ scrollLeft: 523.25 }), 2);
});

test("scroll-end tolerance is small, positive and DPR-aware", () => {
  assert.equal(carouselScrollEndTolerance(1), 2);
  assert.equal(carouselScrollEndTolerance(2), 1);
  assert.equal(carouselScrollEndTolerance(3), 1);
  assert.equal(resolve({ devicePixelRatio: 3, scrollLeft: 523.25 }), 2);
  assert.equal(resolve({ devicePixelRatio: 3, scrollLeft: 522.75 }), 1);
});

test("first and intermediate positions still use the nearest card", () => {
  assert.equal(resolve({ itemStartDistances: [0, 402.59375, 805.1875], scrollLeft: 0 }), 0);
  assert.equal(resolve({ itemStartDistances: [-402.5, 0.09375, 402.6875], scrollLeft: 402.5 }), 1);
  assert.equal(resolve({ itemStartDistances: [-300, -20, 260], scrollLeft: 300 }), 1);
});

test("empty and non-scrollable carousels resolve deterministically", () => {
  assert.equal(resolve({ itemStartDistances: [] }), -1);
  assert.equal(resolve({ clientWidth: 400, itemStartDistances: [0], scrollLeft: 0, scrollWidth: 400 }), 0);
  assert.equal(resolve({ clientWidth: 400, itemStartDistances: [0, 210], scrollLeft: 0, scrollWidth: 400 }), 0);
});

test("430 to 768 and 768 to 430 layout metrics are recalculated", () => {
  const at430End = resolve({
    clientWidth: 398,
    itemStartDistances: [-698, -328.6015625, 40.796875],
    scrollLeft: 698,
    scrollWidth: 1096,
  });
  const at768End = resolve();
  const at430Intermediate = resolve({
    clientWidth: 398,
    itemStartDistances: [-524, -154.6015625, 214.796875],
    scrollLeft: 524,
    scrollWidth: 1096,
  });
  assert.equal(at430End, 2);
  assert.equal(at768End, 2);
  assert.equal(at430Intermediate, 1);
  assert.match(component, /new ResizeObserver\(\(\) => updateActiveIndex\(viewport\)\)/);
  assert.match(component, /observer\.observe\(viewport\)/);
  assert.match(component, /querySelectorAll<HTMLElement>\("\[data-carousel-item\]"\)\.forEach\(\(item\) => observer\.observe\(item\)\)/);
  assert.match(component, /observer\.disconnect\(\)/);
});

test("geometry, snap, peek and existing interaction handlers stay unchanged", () => {
  assert.match(css, /flex: 0 0 var\(--customer-card-mobile-width, 83%\)/);
  assert.match(css, /@media \(min-width: 768px\)[\s\S]*flex-basis: 58%/);
  assert.match(css, /@media \(min-width: 1024px\)[\s\S]*flex-basis: 46%/);
  assert.match(css, /scroll-snap-type: x mandatory/);
  assert.match(component, /\.\.\.imageCardPointerGuard/);
  assert.match(component, /onKeyDown=\{handleKeyDown\}/);
  assert.match(component, /onScroll=\{handleScroll\}/);
  assert.match(component, /onClick=\{\(\) => scrollToIndex\(activeIndex \+ 1\)\}/);
  assert.match(blockCss, /box-shadow: inset 0 0 0 2px/);
  assert.match(blockCss, /focus-within::after/);
  assert.doesNotMatch(component, /fetch\(|\.rpc\(|supabase/);
});
