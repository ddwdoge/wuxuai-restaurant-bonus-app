import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const staff = readFileSync(new URL("../src/modules/staff/StaffTablet.tsx", import.meta.url), "utf8");
const drawer = readFileSync(new URL("../src/shared/components/AppDrawer.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/modules/staff/staff-premium.css", import.meta.url), "utf8");
const block = (selector) => css.slice(css.lastIndexOf(`${selector} {`)).split("}")[0];

test("PIN mobile sheet overrides scanner fixed height without changing camera layout", () => {
  assert.match(staff, /className=\{pendingPinAction \? "staff-pin-sheet" : undefined\}/);
  assert.match(staff, /fitVisualViewport=\{Boolean\(pendingPinAction\)\}/);
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
  assert.match(staff, /disabled=\{!pinDraft \|\| saving\} form=\{inScannerDrawer \? "staff-scanner-pin-confirmation" : "staff-pin-confirmation"\}/);
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
function mountViewport({ open = true, fit = true, viewport } = {}) {
  const values = new Map();
  let cleanup;
  const style = { setProperty: (key, value) => values.set(key, value), removeProperty: (key) => values.delete(key) };
  new Function("useEffect", "open", "fitVisualViewport", "window", "overlayRef", viewportEffect)(
    (effect) => { cleanup = effect(); }, open, fit, { visualViewport: viewport }, { current: { style } },
  );
  return { values, cleanup };
}

test("visual viewport tracks keyboard resize and Safari pan, removes listeners on close", () => {
  const listeners = new Map();
  const viewport = { height: 800, offsetTop: 0,
    addEventListener: (name, fn) => listeners.set(name, fn),
    removeEventListener: (name, fn) => { assert.equal(listeners.get(name), fn); listeners.delete(name); },
  };
  const { values, cleanup } = mountViewport({ viewport });
  assert.equal(values.get("--drawer-viewport-height"), "800px");
  viewport.height = 320;
  listeners.get("resize")();
  assert.equal(values.get("--drawer-viewport-height"), "320px");
  viewport.offsetTop = 145;
  listeners.get("scroll")();
  assert.equal(values.get("--drawer-viewport-top"), "145px");
  cleanup();
  assert.equal(listeners.size, 0);
  assert.equal(values.size, 0);
});

test("viewport adaptation is opt-in and safely falls back when unsupported", () => {
  for (const options of [{ open: false }, { fit: false }, {}]) {
    const result = mountViewport(options);
    assert.equal(result.values.size, 0);
    assert.equal(result.cleanup, undefined);
  }
  assert.match(drawer, /fitVisualViewport = false/);
});
