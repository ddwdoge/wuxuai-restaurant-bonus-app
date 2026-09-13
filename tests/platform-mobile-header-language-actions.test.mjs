import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const ui = read("src/modules/customer/components/PremiumCustomerUi.tsx");
const selector = read("src/shared/i18n/LanguageSelector.tsx");
const central = read("src/modules/customer/CentralCustomerPage.tsx");
const finder = read("src/modules/customer/PartnerRestaurantFinderPage.tsx");
const offers = read("src/modules/customer/CustomerOffersPage.tsx");
const customerCss = read("src/modules/customer/customer-header-language.css");
const centralCss = read("src/modules/customer/central-customer.css");
const finderCss = read("src/modules/customer/partner-restaurant-finder.css");
const offersCss = read("src/modules/customer/customer-offers-page.css");
const platformCss = read("src/styles.css");
const sharedUiCss = read("src/shared/ui/ui-system.css");

test("Customer AppShell cannot create the former empty language row", () => {
  assert.doesNotMatch(ui, /customer-language-row/);
  assert.doesNotMatch(read("src/modules/customer/customer-premium.css"), /\.customer-language-row/);
  assert.match(ui, /export function CustomerLanguageAction/);
});

test("Meine Lokale, Lokale entdecken and offers place language in their header action group", () => {
  assert.match(central, /central-customer-header-actions[\s\S]*<CustomerLanguageAction \/>[\s\S]*central-discover-action/);
  assert.match(finder, /partner-finder-header-actions"><CustomerLanguageAction \/><MapPin/);
  assert.match(offers, /customer-offers-header-actions"><CustomerLanguageAction \/>/);
  assert.match(centralCss, /grid-template-columns: minmax\(0, 1fr\) auto/);
  assert.match(finderCss, /grid-template-columns: 44px minmax\(0, 1fr\) auto/);
  assert.match(offersCss, /grid-template-columns: 44px minmax\(0, 1fr\) auto/);
});

test("mobile header actions preserve 44px targets, safe areas, compact 320px codes and focus", () => {
  assert.match(customerCss, /\.customer-standalone-language[\s\S]*min-height: 44px/);
  assert.match(customerCss, /\.customer-standalone-language:focus-within/);
  assert.match(customerCss, /@media \(max-width: 380px\)[\s\S]*min-width: 44px/);
  assert.match(offersCss, /env\(safe-area-inset-top\)/);
  assert.doesNotMatch([customerCss, centralCss, finderCss, offersCss].join("\n"), /zoom\s*:|transform:\s*scale\(/);
});

test("language selection and persistence keep the one existing provider path", () => {
  assert.match(selector, /onChange=\{\(event\) => setLanguage\(event.target.value as UiLanguage\)\}/);
  assert.doesNotMatch(selector, /localStorage|sessionStorage|fetch\(|\.rpc\(|flag/i);
});

test("other role headers retain their existing shared selector inside action groups", () => {
  assert.match(read("src/modules/public/PublicPageComponents.tsx"), /public-premium-hero-row[\s\S]*<LanguageSelector \/>/);
  assert.match(read("src/modules/staff/StaffTablet.tsx"), /staff-premium-header[\s\S]*<LanguageSelector \/>/);
  assert.match(read("src/modules/admin/AdminLayout.tsx"), /owner-header-primary-actions[\s\S]*<LanguageSelector \/>/);
  const platformLayout = read("src/modules/platform/PlatformAdminLayout.tsx");
  assert.match(platformLayout, /platform-admin-header-primary[\s\S]*platform-admin-header-primary-actions[\s\S]*<LanguageSelector \/>/);
  assert.match(platformLayout, /platform-admin-header-toolbar/);
  for (const page of ["PlatformAdminPage", "PlatformAuditPage", "PlatformHealthCenterPage"])
    assert.match(read(`src/modules/platform/${page}.tsx`), /<PlatformAdminLayout/);
});

test("Platform Admin keeps identity and language in one compact primary row", () => {
  assert.match(platformCss, /\.platform-admin-header-primary\s*\{[\s\S]*grid-template-columns: minmax\(0, 1fr\) auto/);
  assert.match(platformCss, /\.platform-admin-header-primary-actions\s*>\s*\.wux-language-selector\s*\{[\s\S]*flex: 0 0 auto/);
  assert.match(platformCss, /@media \(max-width: 820px\)[\s\S]*\.platform-admin-header-primary\s*\{[\s\S]*min-height: 44px/);
  assert.doesNotMatch(platformCss, /\.platform-admin-header-actions/);
  assert.doesNotMatch(sharedUiCss, /\.platform-admin-header-actions/);
});

test("Platform Admin mobile toolbar shrinks without creating page overflow", () => {
  const platformRules = [...platformCss.matchAll(/\.platform-[^{}]*\{[^}]*\}/g)].map(match => match[0]).join("\n");
  assert.match(platformCss, /\.platform-admin-shell\s*\{[\s\S]*box-sizing: border-box[\s\S]*width: 100%/);
  assert.match(platformCss, /\.platform-admin-header-toolbar\s*\{[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(platformCss, /\.platform-admin-grid > \*[\s\S]*\.platform-section-title > \*[\s\S]*min-width: 0/);
  assert.match(platformCss, /\.platform-operations-tabs\s*\{[\s\S]*max-width: 100%[\s\S]*overflow-x: auto/);
  assert.match(platformCss, /\.platform-test-cleanup\s*\{[\s\S]*overflow-wrap: anywhere[\s\S]*word-break: break-word/);
  assert.match(platformCss, /\.platform-contract-note\s*\{[\s\S]*min-width: 0[\s\S]*overflow-wrap: anywhere[\s\S]*word-break: break-word/);
  assert.doesNotMatch(platformRules, /zoom\s*:|transform:\s*scale\(/);
});
