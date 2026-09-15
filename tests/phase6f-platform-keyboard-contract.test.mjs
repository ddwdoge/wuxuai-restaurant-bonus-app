import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("the shared drawer owns the platform-wide visual viewport lifecycle", () => {
  const drawer = read("src/shared/components/AppDrawer.tsx");
  assert.match(drawer, /fitVisualViewport = true/);
  assert.match(drawer, /viewport\.addEventListener\("resize", updateViewport\)/);
  assert.match(drawer, /viewport\.addEventListener\("scroll", updateViewport\)/);
  assert.match(drawer, /window\.addEventListener\("resize", updateViewport\)/);
  assert.match(drawer, /window\.addEventListener\("orientationchange", updateViewport\)/);
  assert.match(drawer, /removeEventListener\("resize", updateViewport\)/);
  assert.match(drawer, /removeEventListener\("orientationchange", updateViewport\)/);
  assert.doesNotMatch(drawer, /visualViewport\.(?:width|scale)/);
  assert.doesNotMatch(drawer, /style\.setProperty\([^\n]*(?:width|transform|scale)/);
  assert.doesNotMatch(drawer, /classList\.contains\("owner-mobile-drawer"\)/);
});

test("mobile keyboard adaptation keeps one DOM structure and a scroll-reachable footer", () => {
  const drawer = read("src/shared/components/AppDrawer.tsx");
  const styles = read("src/styles.css");
  assert.match(drawer, /<div className="app-drawer-body">\{children\}<\/div>/);
  assert.match(drawer, /\{footer \? <footer className="app-drawer-footer">\{footer\}<\/footer> : null\}/);
  assert.doesNotMatch(drawer, /keyboard[^\n]*(?:footer|hidden)|footer[^\n]*keyboard/i);
  assert.match(styles, /\.app-drawer-overlay\.app-drawer-visual-viewport \.app-drawer-panel \{[\s\S]*height: auto;[\s\S]*overflow-y: auto;/);
  assert.match(styles, /\.app-drawer-overlay\.app-drawer-visual-viewport \.app-drawer-panel > \.app-drawer-body \{[\s\S]*overflow-y: visible;/);
  assert.match(styles, /\.app-drawer-footer \{[\s\S]*env\(safe-area-inset-bottom\)/);
  assert.doesNotMatch(styles, /app-drawer[^}]*zoom\s*:/);
});

test("focus trapping, focus return and background scroll lock remain centralized", () => {
  const drawer = read("src/shared/components/AppDrawer.tsx");
  assert.match(drawer, /document\.body\.style\.overflow = "hidden"/);
  assert.match(drawer, /document\.body\.style\.overflow = previousOverflow/);
  assert.match(drawer, /previousFocus\?\.focus\(\{ preventScroll: true \}\)/);
  assert.match(drawer, /if \(event\.key !== "Tab"/);
  assert.match(drawer, /aria-modal="true"/);
  assert.match(drawer, /role="dialog"/);
});
