import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createImageCardPointerGuard } from "../src/modules/customer/components/imageCardPointerGuard.mjs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
function setup({ home = true, card = true } = {}) {
  const guard = createImageCardPointerGuard();
  const target = { closest: () => card ? target : null };
  const viewport = { closest: () => home ? viewport : null, scrollLeft: 0 };
  let opens = 0;
  const event = (extra = {}) => ({ target, currentTarget: viewport, pointerId: 1,
    isPrimary: true, button: 0, clientX: 200, clientY: 100, ...extra });
  function click(detail = 1) {
    let prevented = false;
    let stopped = false;
    guard.onClickCapture(event({ detail,
      preventDefault() { prevented = true; }, stopPropagation() { stopped = true; } }));
    assert.equal(prevented, stopped);
    if (!stopped) opens += 1; // The unchanged descendant button handler.
    return opens;
  }
  return { guard, event, viewport, click };
}

test("a short image-card tap reaches the existing click handler exactly once", () => {
  const s = setup();
  s.guard.onPointerDownCapture(s.event());
  s.guard.onPointerMoveCapture(s.event({ clientX: 203, clientY: 102 }));
  s.guard.onPointerUpCapture(s.event({ clientX: 203, clientY: 102 }));
  assert.equal(s.click(), 1);
});

for (const [name, x, y] of [["left", 120, 100], ["right", 280, 100], ["vertical", 200, 180]]) {
  test(`${name} pan cannot open a card, even after returning to the origin`, () => {
    const s = setup();
    s.guard.onPointerDownCapture(s.event());
    s.guard.onPointerMoveCapture(s.event({ clientX: x, clientY: y }));
    s.guard.onPointerUpCapture(s.event());
    assert.equal(s.click(), 0);
    s.guard.onPointerDownCapture(s.event());
    assert.equal(s.click(), 1); // The next deliberate tap is not poisoned.
  });
}

test("movement first observed on release also suppresses the pointer click", () => {
  const s = setup();
  s.guard.onPointerDownCapture(s.event());
  s.guard.onPointerUpCapture(s.event({ clientX: 240 }));
  assert.equal(s.click(), 0);
});

test("native cancellation, multitouch and scroll displacement cannot open a card", () => {
  for (const cancel of [
    (s) => s.guard.onPointerCancelCapture(s.event()),
    (s) => s.guard.onPointerDownCapture(s.event({ pointerId: 2, isPrimary: false })),
    (s) => { s.viewport.scrollLeft = 100; },
  ]) {
    const s = setup();
    s.guard.onPointerDownCapture(s.event());
    cancel(s);
    assert.equal(s.click(), 0);
  }
});

test("native keyboard and assistive clicks remain available after a cancelled pan", () => {
  const s = setup();
  s.guard.onPointerDownCapture(s.event());
  s.guard.onPointerCancelCapture(s.event());
  assert.equal(s.click(0), 1);
  assert.equal(s.click(0), 2);
});

test("non-Home cards and separate controls are not intercepted", () => {
  for (const options of [{ home: false }, { card: false }]) {
    const s = setup(options);
    s.guard.onPointerDownCapture(s.event());
    s.guard.onPointerMoveCapture(s.event({ clientX: 50 }));
    assert.equal(s.click(), 1);
  }
  const source = read("src/modules/customer/components/PremiumHorizontalCarousel.tsx");
  assert.equal((source.match(/\.\.\.imageCardPointerGuard/g) || []).length, 1);
  assert.match(source, /className="premium-horizontal-carousel-viewport"\s+\{\.\.\.imageCardPointerGuard\}/);
  assert.match(source, /<div className="premium-horizontal-carousel-controls">/);
});

test("full-card sizing and visible focus are scoped to existing Home image buttons", () => {
  const css = read("src/modules/customer/customer-compact.css");
  assert.match(css, /\.customer-home-compact :is\(\.premium-reward-card, \.customer-offer-card\) \.customer-image-first-action \{[^}]*align-self: stretch;[^}]*height: 100%;[^}]*inset: 0;/);
  assert.match(css, /:focus-within::after \{\s+box-shadow: inset 0 0 0 3px/);
  assert.match(css, /border-radius: inherit;[\s\S]*inset: 0;[\s\S]*pointer-events: none;/);
  const ui = read("src/modules/customer/components/PremiumCustomerUi.tsx");
  assert.match(ui, /aria-label=\{`\$\{title\}: \$\{actionLabel\}`\}/);
  assert.match(ui, /onClick=\{onOpen\}/);
  const guard = read("src/modules/customer/components/imageCardPointerGuard.mjs");
  assert.doesNotMatch(guard, /\.click\(|setPointerCapture|touch-action|fetch\(|\.rpc\(/);
});
