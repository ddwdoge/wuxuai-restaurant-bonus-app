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
  assert.match(read("src/modules/admin/AdminLayout.tsx"), /topbar-actions[\s\S]*<LanguageSelector \/>/);
  for (const page of ["PlatformAdminPage", "PlatformAuditPage", "PlatformHealthCenterPage"]) {
    assert.match(read(`src/modules/platform/${page}.tsx`), /platform-admin-header-actions[\s\S]*<LanguageSelector \/>/);
  }
});
