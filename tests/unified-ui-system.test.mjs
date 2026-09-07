import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../src/shared/ui/ui-system.css", import.meta.url), "utf8");
const catalog = readFileSync(new URL("../src/shared/i18n/catalog.mjs", import.meta.url), "utf8");
const components = ["UiButton", "UiCard", "UiDialog", "UiField", "UiState", "UiStatus"];

test("shared UI component families exist", () => {
  for (const component of components) {
    const source = readFileSync(new URL(`../src/shared/ui/${component}.tsx`, import.meta.url), "utf8");
    assert.match(source, new RegExp(`export function ${component}`));
  }
});

test("design tokens cover visual and semantic contracts", () => {
  for (const token of ["--wux-space-", "--wux-radius-", "--wux-shadow-", "--wux-bg", "--wux-surface", "--wux-border", "--wux-gold", "--wux-text", "--wux-success", "--wux-warning", "--wux-error", "--wux-info", "--wux-disabled", "--wux-focus"]) {
    assert.match(css, new RegExp(token));
  }
});

test("buttons expose all canonical variants and 44px controls", () => {
  for (const variant of ["primary", "secondary", "ghost", "danger", "link"]) assert.match(css, new RegExp(`wux-button-${variant}`));
  assert.match(css, /--wux-control-height:\s*44px/);
  assert.match(css, /min-width:\s*44px/);
});

test("status and dialog severity contracts are represented", () => {
  for (const tone of ["neutral", "success", "warning", "error", "info"]) assert.match(css, new RegExp(`wux-status-${tone}`));
  for (const severity of ["sensitive", "critical"]) assert.match(css, new RegExp(`wux-dialog-${severity}`));
});

test("responsive tables and platform telemetry cannot widen the viewport", () => {
  assert.match(css, /\.platform-audit-table-wrap[\s\S]*overflow-x:\s*auto/);
  assert.match(css, /@media \(max-width:\s*340px\)[\s\S]*\.platform-operational-grid dl div[\s\S]*flex-direction:\s*column/);
});

test("CJK-safe system font stack is available without bundled fonts", () => {
  assert.match(css, /Noto Sans CJK SC/);
  assert.match(css, /Noto Sans KR/);
  assert.doesNotMatch(css, /@font-face/);
});

test("structural navigation and shared states use translation keys", () => {
  for (const key of ["owner.navigation", "owner.dashboard", "customer.navigation", "common.loading", "common.retry", "platform.operationalStatus"]) {
    assert.match(catalog, new RegExp(`"${key.replace(".", "\\.")}"`));
  }
});

test("reduced motion and focus-visible accessibility contracts exist", () => {
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /focus-visible/);
});
