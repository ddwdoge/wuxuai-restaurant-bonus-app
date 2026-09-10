import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const app = read("src/app/App.tsx");
const globalStyles = read("src/styles.css");
const selector = read("src/shared/i18n/LanguageSelector.tsx");
const infoTrigger = read("src/shared/components/InfoTrigger.tsx");
const structuralCatalog = read("src/shared/i18n/catalog.mjs");
const roleSurfaces = [
  "src/modules/admin/AdminLayout.tsx",
  "src/modules/admin/pages/QrCenterPage.tsx",
  "src/modules/auth/ConfirmEmailPage.tsx",
  "src/modules/auth/RegisterPage.tsx",
  "src/modules/auth/portalAccessUx.mjs",
  "src/modules/auth/portalRecoveryUx.mjs",
  "src/modules/customer/CentralCustomerPage.tsx",
  "src/modules/customer/CustomerAuthPage.tsx",
  "src/modules/customer/CustomerPortal.tsx",
  "src/modules/customer/CustomerRestaurantAccess.tsx",
  "src/modules/customer/ReferralLanding.tsx",
  "src/modules/legal/ProgramTerminationPage.tsx",
  "src/modules/platform/PlatformRestaurantControlCenter.tsx",
  "src/modules/platform/PlatformKassaCompliancePanel.tsx",
  "src/modules/admin/pages/CustomersPage.tsx",
  "src/modules/admin/pages/StaffPage.tsx",
  "src/modules/legal/OwnerLegalSettingsPage.tsx",
  "src/modules/reports/BonusActivityReportsPage.tsx",
].map(read).join("\n");

test("language selection is compact, flow-integrated, and never a global floating layer", () => {
  assert.doesNotMatch(app, /<LanguageSelector\s*\/>/);
  assert.doesNotMatch(globalStyles.match(/\.wux-language-selector\s*\{[\s\S]*?\}/)?.[0] ?? "", /position:\s*fixed/);
  assert.match(selector, /wux-language-selector-code/);
  assert.match(selector, /language\.toUpperCase\(\)/);
  assert.match(globalStyles, /\.wux-language-selector[\s\S]*min-height:\s*44px/);
  assert.match(globalStyles, /\.wux-language-selector[\s\S]*position:\s*relative/);
});

test("language selection is present in every major role shell", () => {
  for (const path of [
    "src/modules/public/PublicPageComponents.tsx",
    "src/modules/admin/AdminLayout.tsx",
    "src/modules/customer/components/PremiumCustomerUi.tsx",
    "src/modules/staff/StaffTablet.tsx",
    "src/modules/platform/PlatformAdminPage.tsx",
    "src/modules/platform/PlatformAuditPage.tsx",
  ]) assert.match(read(path), /<LanguageSelector/);
});

test("canonical info trigger is accessible and cannot submit a form", () => {
  assert.match(infoTrigger, /aria-label=\{label\}/);
  assert.match(infoTrigger, /type="button"/);
  assert.match(infoTrigger, /<Info aria-hidden="true"/);
  assert.match(globalStyles, /\.wux-info-trigger[\s\S]*height:\s*44px/);
  assert.match(globalStyles, /\.wux-info-trigger[\s\S]*width:\s*44px/);
});

test("Platform Audit filters and toggle labels meet the touch-target contract", () => {
  assert.match(globalStyles, /\.platform-audit-shell \.input\s*\{[\s\S]*?min-height:\s*44px/);
  assert.match(globalStyles, /\.platform-audit-toggle-row label\s*\{[\s\S]*?min-height:\s*44px/);
});

test("visible German role terminology follows the V1 master contract", () => {
  for (const forbidden of [
    "Staff-Bereich",
    "Staff-Seite",
    "Owner-Bereich",
    "Owner Dashboard",
    "Customer Portal",
    "Customer Account",
    "Chefbereich",
    "Restaurant Portal",
    "Restaurant-Portal",
    "Restaurant Portal Navigation",
    "Restaurant-Owner",
    "Nur für Owner",
    "Nur Owner",
    "Vom Owner geprüft",
    "Dokument-Hash, Owner",
    "Kundenbereich",
    "Kundenkonto",
  ]) assert.doesNotMatch(roleSurfaces, new RegExp(forbidden), forbidden);

  assert.doesNotMatch(structuralCatalog, /"owner\.portalLoading": "Restaurant Portal wird geladen/);
  assert.match(structuralCatalog, /"owner\.portalLoading": "Inhaberbereich wird geladen/);

  for (const required of ["Mitarbeiterbereich", "Inhaberbereich", "Restaurant-Dashboard", "Gästeportal", "Gästekonto"])
    assert.match(roleSurfaces, new RegExp(required), required);
});

test("customer setup and password visibility remain wired after the consistency pass", () => {
  assert.match(read("src/modules/customer/CentralCustomerPage.tsx"), /openActivation\(false\)/);
  assert.match(read("src/modules/customer/CentralCustomerPage.tsx"), /customer\.activation\.settings/);
  assert.match(read("src/modules/customer/CustomerAuthPage.tsx"), /<PasswordInput/);
  assert.match(read("src/modules/public/PublicPageComponents.tsx"), /type === "password"[\s\S]*<PasswordInput/);
});
