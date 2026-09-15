import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const component = fs.readFileSync("src/modules/platform/PlatformProControlCenter.tsx", "utf8");
const service = fs.readFileSync("src/modules/platform/platformAdminService.ts", "utf8");
const page = fs.readFileSync("src/modules/platform/PlatformAdminPage.tsx", "utf8");
const layout = fs.readFileSync("src/modules/platform/PlatformAdminLayout.tsx", "utf8");
const css = fs.readFileSync("src/styles.css", "utf8");
const i18n = fs.readFileSync("src/modules/platform/proControlCenterI18n.ts", "utf8");

test("Platform Admin exposes the Pro control-center route and menu", () => {
  assert.match(page, /pathname\.includes\("\/pro"\)/);
  assert.match(page, /<PlatformProControlCenter \/>/);
  assert.match(layout, /path:\s*"\/admin\/platform\/pro"/);
});

test("control center uses authorized RPC services and no direct table access", () => {
  for (const fn of ["loadProCountryStatus", "loadProEntitlements", "searchProRealBusinesses", "loadProTestOnlyBusinesses", "loadProCommercialAudit"])
    assert.match(component, new RegExp(fn));
  assert.doesNotMatch(component, /supabase\s*\.\s*from\s*\(/);
  assert.doesNotMatch(service.slice(service.indexOf("export type ProCountryStatus")), /\.from\s*\(/);
  assert.match(service, /set_platform_commercial_pro_country_release/);
  assert.match(service, /set_platform_commercial_pro_access/);
});

test("high-risk forms are confirmation-bound, recent-auth aware, idempotent and cancellable", () => {
  assert.match(component, /requestId\.current\s*=\s*crypto\.randomUUID\(\)/);
  assert.match(component, /confirmation === exactConfirmation/);
  assert.match(component, /reason\.trim\(\)\.length >= 10/);
  assert.match(component, /if \(saving\) return/);
  assert.match(component, /RECENT\|JWT\|AUTH/);
  assert.match(component, /onClick=\{closeDrawer\}/);
  assert.match(component, /\[30,60,90\]/);
});

test("seven-language catalogs and responsive touch contracts are present", () => {
  for (const language of ["en", "fr", "it", "es", "zh", "ko"])
    assert.match(i18n, new RegExp(`\\b${language}:\\s*\\{`));
  assert.match(i18n, /Pro gesperrt/);
  assert.match(i18n, /TEST_ONLY/);
  for (const width of [1080, 700, 390]) assert.match(css, new RegExp(`max-width:\\s*${width}px`));
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /min-width:\s*44px/);
});

test("AT lock, exact TEST_ONLY empty state and read-only audit are rendered", () => {
  assert.match(component, /country_code === "AT"/);
  assert.match(component, /noTestOnly/);
  assert.match(component, /loadProCommercialAudit/);
  assert.match(component, /CommercialAudit/);
});
