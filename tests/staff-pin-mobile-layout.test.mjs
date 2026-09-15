import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const staff = readFileSync(new URL("../src/modules/staff/StaffTablet.tsx", import.meta.url), "utf8");
const drawer = readFileSync(new URL("../src/shared/components/AppDrawer.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/modules/staff/staff-premium.css", import.meta.url), "utf8");
const block = (selector) => css.slice(css.lastIndexOf(`${selector} {`)).split("}")[0];

test("PIN mobile sheet overrides scanner fixed height without changing camera layout", () => {
  assert.match(staff, /className=\{pendingPinAction \? "staff-pin-sheet" : pointsQrReference \? "staff-points-sheet" : undefined\}/);
  assert.match(staff, /fitVisualViewport=\{Boolean\(pendingPinAction \|\| pointsQrReference\)\}/);
  assert.match(block(".app-drawer-panel.staff-pin-sheet"), /height: auto/);
  assert.match(block(".app-drawer-panel.staff-pin-sheet"), /min-height: 0/);
  assert.match(block(".app-drawer-panel.staff-pin-sheet"), /--drawer-viewport-height, 100dvh/);
});

test("body shrinks only on overflow; footer follows form by 20px", () => {
  assert.match(block(".app-drawer-panel.staff-pin-sheet > .app-drawer-body"), /flex: 0 1 auto/);
  assert.match(block(".app-drawer-panel.staff-pin-sheet > .app-drawer-body"), /overflow-y: auto/);
  assert.match(block(".app-drawer-panel.staff-pin-sheet > .app-drawer-footer"), /padding: 20px 14px calc\(16px \+ env\(safe-area-inset-bottom\)\)/);
  assert.doesNotMatch(css.slice(css.indexOf(".app-drawer-visual-viewport:has(.staff-pin-sheet)")), /position: sticky|justify-content: space-between|margin-top: auto|flex: 1;/);
});

test("confirm is first in DOM and spans both mobile columns", () => {
  const footer = staff.slice(staff.indexOf('className="button staff-pin-confirm-primary"'), staff.indexOf("function renderPinActionContent"));
  assert.ok(footer.indexOf('type="submit"') < footer.indexOf('staff.activePoints.cancel'));
  assert.ok(footer.indexOf('staff.activePoints.cancel') < footer.indexOf('staff.activePoints.minimize'));
  assert.match(block(".staff-pin-sheet .staff-pin-confirm-primary"), /grid-column: 1 \/ -1/);
  assert.match(block(".staff-pin-sheet .app-drawer-footer .button"), /min-height: 46px/);
  assert.match(block(".staff-pin-sheet .app-drawer-footer .button"), /min-width: 44px/);
});

test("PIN validation, submit target, cancellation and minimization remain canonical", () => {
  assert.match(staff, /disabled=\{!\/\^\\d\{4\}\$\/\.test\(pinDraft\) \|\| saving\} form=\{inScannerDrawer \? "staff-scanner-pin-confirmation" : "staff-pin-confirmation"\}/);
  assert.match(staff, /minLength=\{4\}/);
  assert.match(staff, /pattern="\[0-9\]\{4\}"/);
  assert.match(staff, /onClick=\{inScannerDrawer \? requestActivePointsTaskCancel : closePinAction\}/);
  assert.match(staff, /onClick=\{\(\) => minimizeActivePointsTask\(\)\}/);
  assert.match(staff, /void executePinAction\(pendingPinAction, pinDraft\)/);
  assert.match(staff, /setPinDraft\(event.target.value.replace\(\/\\D\/g, ""\).slice\(0, 4\)\)/);
});

test("PIN errors, focus trap and focus restoration stay accessible", () => {
  assert.match(staff, /aria-invalid=\{pinActionFeedback\?\.pinError \|\| undefined\}/);
  assert.match(staff, /id=\{errorId\} ref=\{pinActionFeedbackRef\} role="alert" tabIndex=\{-1\}/);
  assert.match(drawer, /aria-modal="true"/);
  assert.match(drawer, /event.key !== "Tab"/);
  assert.match(drawer, /previousFocus\?\.focus\(\{ preventScroll: true \}\)/);
  assert.match(block(".staff-pin-sheet .staff-points-drawer-form .input"), /font-size: 16px/);
  assert.match(block(".staff-pin-sheet .staff-points-drawer-form .input"), /min-height: 46px/);
});

const viewportEffect = drawer.match(/useEffect\(\(\) => \{\n    if \(!open \|\| !fitVisualViewport[\s\S]*?\n  \}, \[open, fitVisualViewport\]\);/)[0];
const executableViewportEffect = ts.transpileModule(viewportEffect, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
function mountViewport({ open = true, fit = true, ownerDrawer = true, viewport } = {}) {
  const values = new Map();
  let cleanup;
  const windowListeners = new Map();
  const documentListeners = new Map();
  const frames = new Map();
  const timers = new Map();
  let sequence = 0;
  const windowMock = {
    innerWidth: 390,
    visualViewport: viewport,
    addEventListener: (name, fn) => windowListeners.set(name, fn),
    removeEventListener: (name, fn) => { assert.equal(windowListeners.get(name), fn); windowListeners.delete(name); },
    requestAnimationFrame: fn => { const id = ++sequence; frames.set(id, fn); return id; },
    cancelAnimationFrame: id => frames.delete(id),
    setTimeout: (fn, delay) => { const id = ++sequence; timers.set(id, { delay, fn }); return id; },
    clearTimeout: id => timers.delete(id),
  };
  const panel = {
    classList: { contains: name => ownerDrawer && name === "owner-mobile-drawer" },
    contains: element => element?.withinPanel === true,
  };
  const documentMock = {
    activeElement: null,
    addEventListener: (name, fn) => documentListeners.set(name, fn),
    removeEventListener: (name, fn) => { assert.equal(documentListeners.get(name), fn); documentListeners.delete(name); },
    documentElement: { clientHeight: 844, clientWidth: 390 },
  };
  const style = { setProperty: (key, value) => values.set(key, value), removeProperty: (key) => values.delete(key) };
  class HTMLElementMock {}
  class HTMLInputElementMock extends HTMLElementMock { constructor(type = "text") { super(); this.type = type; this.withinPanel = true; } }
  class HTMLTextAreaElementMock extends HTMLElementMock { constructor() { super(); this.withinPanel = true; } }
  new Function("useEffect", "open", "fitVisualViewport", "window", "document", "overlayRef", "panelRef", "HTMLElement", "HTMLInputElement", "HTMLTextAreaElement", executableViewportEffect)(
    (effect) => { cleanup = effect(); }, open, fit, windowMock, documentMock, { current: { style } }, { current: panel }, HTMLElementMock, HTMLInputElementMock, HTMLTextAreaElementMock,
  );
  const flushFrames = () => {
    while (frames.size) {
      const pending = [...frames.values()];
      frames.clear();
      pending.forEach(fn => fn());
    }
  };
  const flushTimers = () => {
    const pending = [...timers.values()].sort((a, b) => a.delay - b.delay);
    timers.clear();
    pending.forEach(({ fn }) => fn());
  };
  const flushTimerAt = delay => {
    const pending = [...timers.entries()].filter(([, timer]) => timer.delay === delay);
    pending.forEach(([id]) => timers.delete(id));
    pending.forEach(([, timer]) => timer.fn());
  };
  return {
    HTMLInputElementMock,
    values,
    cleanup,
    documentListeners,
    documentMock,
    flushFrames,
    flushTimerAt,
    flushTimers,
    timers,
    viewport,
    windowListeners,
    windowMock,
  };
}

test("visual viewport tracks only vertical keyboard geometry and removes every listener", () => {
  const listeners = new Map();
  const viewport = { height: 800, offsetLeft: 0, offsetTop: 0, scale: 1, width: 390,
    addEventListener: (name, fn) => listeners.set(name, fn),
    removeEventListener: (name, fn) => { assert.equal(listeners.get(name), fn); listeners.delete(name); },
  };
  const result = mountViewport({ viewport });
  const { values, cleanup } = result;
  assert.equal(values.get("--drawer-viewport-height"), "800px");
  assert.equal(values.has("--drawer-viewport-width"), false);
  assert.equal(values.has("--drawer-viewport-left"), false);
  viewport.height = 320;
  listeners.get("resize")();
  assert.equal(values.get("--drawer-viewport-height"), "320px");
  viewport.offsetTop = 145;
  listeners.get("scroll")();
  assert.equal(values.get("--drawer-viewport-top"), "145px");
  assert.deepEqual([...result.windowListeners.keys()].sort(), ["orientationchange", "resize"]);
  assert.deepEqual([...result.documentListeners.keys()].sort(), ["focusin", "focusout"]);
  cleanup();
  assert.equal(listeners.size, 0);
  assert.equal(result.windowListeners.size, 0);
  assert.equal(result.documentListeners.size, 0);
  assert.equal(values.size, 0);
});

test("keyboard close and orientation changes settle stale Safari geometry without user movement", () => {
  const listeners = new Map();
  const viewport = { height: 360, offsetLeft: 0, offsetTop: 246, scale: 1, width: 320,
    addEventListener: (name, fn) => listeners.set(name, fn),
    removeEventListener: (name) => listeners.delete(name),
  };
  const result = mountViewport({ viewport });
  assert.equal(result.values.get("--drawer-viewport-height"), "360px");

  // Safari may emit the first close event before visualViewport has its final
  // values. The scheduled stable render must pick up the restored geometry.
  listeners.get("resize")();
  viewport.height = 844;
  viewport.width = 390;
  viewport.offsetTop = 0;
  result.windowMock.innerWidth = 390;
  result.documentMock.documentElement.clientWidth = 390;
  result.flushFrames();
  result.flushTimers();
  assert.equal(result.values.get("--drawer-viewport-height"), "844px");
  assert.equal(result.values.get("--drawer-viewport-top"), "0px");
  assert.equal(result.values.has("--drawer-viewport-width"), false);
  assert.equal(result.values.has("--drawer-viewport-left"), false);

  result.windowMock.innerWidth = 844;
  result.documentMock.documentElement.clientWidth = 844;
  result.documentMock.documentElement.clientHeight = 390;
  viewport.height = 390;
  viewport.width = 844;
  result.windowListeners.get("orientationchange")();
  result.flushFrames();
  assert.equal(result.values.get("--drawer-viewport-height"), "390px");
  result.cleanup();
});

test("keyboard close recovers delayed or missing Safari geometry without pointer or scroll", () => {
  const listeners = new Map();
  const viewport = { height: 360, offsetLeft: 0, offsetTop: 246, scale: 1, width: 390,
    addEventListener: (name, fn) => listeners.set(name, fn),
    removeEventListener: (name) => listeners.delete(name),
  };
  const result = mountViewport({ viewport });
  const input = new result.HTMLInputElementMock();
  input.isContentEditable = false;
  result.documentMock.activeElement = input;
  result.documentListeners.get("focusin")({ target: input });
  listeners.get("resize")();
  assert.equal(result.values.get("--drawer-viewport-height"), "360px");
  assert.equal(result.values.get("--drawer-viewport-top"), "246px");

  result.documentMock.activeElement = null;
  result.documentListeners.get("focusout")({ target: input });
  result.flushFrames();
  result.flushTimerAt(100);
  result.flushTimerAt(250);
  assert.equal(result.values.get("--drawer-viewport-height"), "360px");

  // Safari supplied no terminal resize/scroll event. The bounded final sample
  // recovers the layout viewport only after focus has left the text field.
  result.flushTimerAt(500);
  assert.equal(result.values.get("--drawer-viewport-height"), "844px");
  assert.equal(result.values.get("--drawer-viewport-top"), "0px");
  assert.equal(result.timers.size, 0);
  result.cleanup();
});

test("focus transfer between text fields never treats an open keyboard as closed", () => {
  const viewport = { height: 360, offsetLeft: 0, offsetTop: 246, scale: 1, width: 390,
    addEventListener() {}, removeEventListener() {},
  };
  const result = mountViewport({ viewport });
  const first = new result.HTMLInputElementMock();
  const second = new result.HTMLInputElementMock();
  first.isContentEditable = false;
  second.isContentEditable = false;
  result.documentMock.activeElement = null;
  result.documentListeners.get("focusout")({ target: first });
  result.documentMock.activeElement = second;
  result.documentListeners.get("focusin")({ target: second });
  result.flushFrames();
  result.flushTimers();
  assert.equal(result.values.get("--drawer-viewport-height"), "360px");
  assert.equal(result.values.get("--drawer-viewport-top"), "246px");
  result.cleanup();
});

test("stale-layout fallback follows the Phase 6F platform-wide drawer contract", () => {
  const viewport = { height: 360, offsetLeft: 0, offsetTop: 246, scale: 1, width: 390,
    addEventListener() {}, removeEventListener() {},
  };
  const result = mountViewport({ ownerDrawer: false, viewport });
  const input = new result.HTMLInputElementMock();
  input.isContentEditable = false;
  result.documentMock.activeElement = null;
  result.documentListeners.get("focusout")({ target: input });
  result.flushFrames();
  result.flushTimers();
  assert.equal(result.values.get("--drawer-viewport-height"), "844px");
  assert.equal(result.values.get("--drawer-viewport-top"), "0px");
  result.cleanup();
});

test("cleanup cancels every bounded keyboard recovery sample", () => {
  const viewport = { height: 360, offsetLeft: 0, offsetTop: 0, scale: 1, width: 390,
    addEventListener() {}, removeEventListener() {},
  };
  const result = mountViewport({ viewport });
  assert.equal(result.timers.size, 3);
  result.cleanup();
  assert.equal(result.timers.size, 0);
  assert.equal(result.documentListeners.size, 0);
  assert.equal(result.windowListeners.size, 0);
});

test("keyboard viewport changes never control drawer width, structure or footer visibility", () => {
  assert.doesNotMatch(drawer, /drawer-viewport-(?:width|left)|data-mobile-keyboard-open/);
  assert.match(drawer, /\{footer \? <footer className="app-drawer-footer">\{footer\}<\/footer> : null\}/);
});

test("viewport adaptation is platform-wide and safely falls back when unsupported", () => {
  for (const options of [{ open: false }, { fit: false }, {}]) {
    const result = mountViewport(options);
    assert.equal(result.values.size, 0);
    assert.equal(result.cleanup, undefined);
  }
  assert.match(drawer, /fitVisualViewport = true/);
});

test("shared visual-viewport overlay consumes only vertical geometry without scaling", () => {
  const globalCss = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  const rule = globalCss.match(/\.app-drawer-overlay\.app-drawer-visual-viewport\s*\{[^}]+\}/)?.[0] ?? "";
  assert.match(rule, /height:\s*var\(--drawer-viewport-height/);
  assert.match(rule, /left:\s*0/);
  assert.match(rule, /right:\s*0/);
  assert.match(rule, /width:\s*auto/);
  assert.match(rule, /top:\s*var\(--drawer-viewport-top/);
  assert.doesNotMatch(rule, /drawer-viewport-(?:width|left)|zoom\s*:|scale\(/);
  assert.doesNotMatch(globalCss, /data-mobile-keyboard-open/);
});

test("mobile Owner close action remains above 44 CSS pixels after DPR rounding", () => {
  const globalCss = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  const rule = globalCss.match(/\.app-drawer-panel\.owner-mobile-drawer\s*>\s*\.app-drawer-header\s+\.app-drawer-close\s*\{[^}]+\}/)?.[0] ?? "";
  assert.match(rule, /height:\s*46px/);
  assert.match(rule, /min-height:\s*46px/);
  assert.match(rule, /min-width:\s*46px/);
  assert.match(rule, /width:\s*46px/);
});
