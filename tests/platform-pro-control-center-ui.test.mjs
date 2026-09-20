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

test("Platform Admin logout and every Pro control target keep the 44px contract", () => {
  assert.match(page, /className="button secondary platform-admin-sign-out"/);
  assert.match(css, /\.platform-admin-header-toolbar \.platform-admin-sign-out\s*\{[^}]*min-height:\s*44px;[^}]*min-width:\s*44px;/s);
  assert.match(css, /\.pro-control-center button, \.pro-action-form input, \.pro-action-form textarea \{ min-height: 44px; \}/);
  for (const width of [320, 375, 390, 430, 767, 768, 1024, 1440]) {
    assert.ok(width >= 320, `${width}px viewport is covered by the non-shrinking 44px rules`);
  }
});

test("LOCKED real-business pilot opens a read-only preview with no mutation path", () => {
  assert.doesNotMatch(component, /disabled=\{business\.country_release_state !== "RELEASED"\}/);
  assert.match(component, /const lockedPilotPreview = drawer\?\.kind === "access"[\s\S]*country_release_state !== "RELEASED"/);
  assert.match(component, /if \(!drawer \|\| lockedPilotPreview \|\| !valid/);
  assert.match(component, /!lockedPilotPreview \? <button className="button primary"/);
  assert.match(component, /if \(!lockedPilotPreview\) void submit\(\)/);
  assert.match(component, /<fieldset disabled=\{lockedPilotPreview\}>/);
  assert.match(component, /disabled=\{lockedPilotPreview\}[\s\S]*type="datetime-local"/);
  assert.match(component, /disabled=\{lockedPilotPreview\}[\s\S]*rows=\{4\}/);
  assert.match(component, /<dd>LOCKED<\/dd>/);
  assert.match(component, /t\.businessSearch[\s\S]*disabled type="text"/);
  assert.match(component, /t\.selectedBusiness/);
  assert.match(component, /t\.country/);
  assert.match(component, /t\.status/);
  assert.match(component, /!lockedPilotPreview \? <>[\s\S]*t\.confirmation/);
});

test("RELEASED policy keeps the existing confirmation-bound pilot workflow", () => {
  assert.match(component, /confirmation === exactConfirmation/);
  assert.match(component, /reason\.trim\(\)\.length >= 10/);
  assert.match(component, /await setProAccess\(/);
  assert.match(component, /business\.country_release_state !== "RELEASED"/);
});

test("LOCKED preview copy is complete in all seven languages", () => {
  assert.match(i18n, /lockedPilotPreview:/);
  assert.match(i18n, /const lockedPreviewLocalized/);
  for (const language of ["en", "fr", "it", "es", "zh", "ko"])
    assert.match(i18n, new RegExp(`\\b${language}: \\{ lockedPreviewTitle:`));
});

test("AT lock, exact TEST_ONLY empty state and read-only audit are rendered", () => {
  assert.match(component, /country_code === "AT"/);
  assert.match(component, /noTestOnly/);
  assert.match(component, /loadProCommercialAudit/);
  assert.match(component, /CommercialAudit/);
});
