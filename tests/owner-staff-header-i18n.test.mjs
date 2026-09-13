import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { translateStructural } from "../src/shared/i18n/catalog.mjs";
import { localeTag } from "../src/shared/i18n/formatters.mjs";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const owner = read("src/modules/admin/AdminLayout.tsx");
const ownerCss = read("src/modules/admin/admin-premium.css");
const staff = read("src/modules/staff/StaffTablet.tsx");
const staffCss = read("src/modules/staff/staff-premium.css");
const appDrawer = read("src/shared/components/AppDrawer.tsx");

const languages = ["de", "en", "fr", "it", "es", "zh", "ko"];
const ownerKeys = [
  "owner.header.area", "owner.header.loading", "owner.header.menuOpen", "owner.header.menuDescription",
  "owner.status.active", "owner.status.draft", "owner.status.blocked", "owner.profile.account",
  "owner.profile.owner", "owner.profile.admin", "owner.profile.manager", "owner.profile.staff",
  "owner.profile.customer", "owner.profile.customerPortal", "owner.profile.staffPortal",
  "owner.profile.platformPortal", "owner.logout", "owner.logoutPending", "owner.logoutError",
  "owner.setup.required", "owner.dashboardTitle", "owner.navigation", "owner.menu", "owner.workspace",
  "owner.dashboard", "owner.rewards", "owner.welcomeGifts", "owner.offers", "owner.customers",
  "owner.qrCenter", "owner.staff", "owner.reports", "owner.settings",
];
const staffKeys = [
  "staff.header.menu", "staff.header.menuOpen", "staff.header.area", "staff.header.operatorArea",
  "staff.drawer.scannerDescription", "staff.drawer.scannerTitle", "staff.drawer.pointsTitle",
  "staff.drawer.searchTitle", "staff.drawer.cameraLabel", "staff.drawer.cameraStarting",
  "staff.drawer.captureQr", "staff.drawer.frameQr", "staff.drawer.qrUnavailableSearch",
  "staff.drawer.backScanner", "staff.drawer.quickSearch", "staff.drawer.searchPlaceholder",
  "staff.drawer.foundCustomers", "staff.drawer.noCustomer", "staff.drawer.selectedCustomer",
  "staff.drawer.recognized", "staff.drawer.currentPoints", "staff.drawer.continueCustomer",
  "staff.drawer.chooseOther", "staff.drawer.qrRecognized", "staff.drawer.verifiedCustomer",
  "staff.drawer.boostActive", "staff.drawer.until", "staff.drawer.checkFailed",
  "staff.drawer.checkPending", "staff.drawer.customerUnavailable", "staff.drawer.customerChecking",
  "staff.drawer.previewServer", "staff.drawer.creditKicker", "staff.drawer.amountTitle",
  "staff.drawer.previewLoading", "staff.drawer.calculatePoints", "staff.drawer.guest",
  "staff.drawer.basePoints", "staff.drawer.multiplier", "staff.drawer.credit",
  "staff.drawer.highAmount", "staff.drawer.confirmDailyPin", "staff.drawer.close", "staff.drawer.done",
  "staff.drawer.nextCustomer", "staff.drawer.checking", "staff.drawer.confirm",
  "staff.drawer.plannedPoints", "staff.drawer.base", "staff.drawer.active", "staff.drawer.credited",
  "staff.drawer.pinPlaceholder", "staff.pin.label", "staff.pin.help", "staff.pin.amountHelp",
  "staff.pin.description", "staff.pin.title", "staff.pin.loading", "staff.pin.unavailable",
  "staff.pin.onlyBookings", "staff.pin.shareHelp", "staff.pin.validToday", "staff.pin.automaticUntil",
  "staff.more.description", "staff.more.title", "staff.more.tasks", "staff.more.scan",
  "staff.more.scanDescription", "staff.more.search", "staff.more.searchDescription",
  "staff.more.points", "staff.more.pointsDescription", "staff.more.help", "staff.more.helpContact",
  "staff.more.sessionFallback", "staff.more.logout", "staff.more.logoutPending", "staff.error.logout",
  "staff.error.cameraDenied", "staff.error.cameraMissing", "staff.error.cameraBusy",
  "staff.error.scannerOpen", "staff.error.cameraUnsupported", "staff.error.qrInvalid",
];

const expectedCloseLabels = {
  de: "Ansicht schließen",
  en: "Close view",
  fr: "Fermer la vue",
  it: "Chiudi vista",
  es: "Cerrar vista",
  zh: "关闭视图",
  ko: "화면 닫기",
};

test("Shared drawer close accessible name follows all seven active languages", () => {
  assert.match(appDrawer, /aria-label=\{closeLabel \?\? t\("common\.close"\)\}/);
  for (const language of languages) {
    assert.equal(translateStructural("common.close", language), expectedCloseLabels[language]);
  }
});

test("Owner and Staff header/drawer catalogs are complete in all seven languages", () => {
  for (const language of languages) {
    for (const key of [...ownerKeys, ...staffKeys]) {
      assert.notEqual(translateStructural(key, language), key, `${language}: ${key}`);
    }
  }
});

test("Owner mobile header keeps brand, language and menu in one primary row", () => {
  assert.match(owner, /admin-restaurant-brand[\s\S]*owner-header-primary-actions[\s\S]*<LanguageSelector \/>[\s\S]*mobile-menu-button/);
  assert.match(owner, /owner-restaurant-context-actions[\s\S]*mobile-restaurant-status[\s\S]*<TenantSwitcher \/>/);
  assert.match(ownerCss, /owner-header-primary-actions[\s\S]*display: flex[\s\S]*gap: 8px/);
  assert.match(ownerCss, /@media \(max-width: 1023px\)[\s\S]*owner-header-primary-actions[\s\S]*grid-row: 1/);
  assert.match(ownerCss, /topbar-actions[\s\S]*grid-template-columns: auto minmax\(0, 1fr\)/);
  assert.doesNotMatch(owner, /topbar-actions">\s*<LanguageSelector/);
});

test("Owner 320px compact menu and synthetic long-name contract cannot overlap actions", () => {
  const syntheticLongRestaurantName = "WUXUAI TEST ONLY – Ein außergewöhnlich langer Restaurantname für die Komponentenprüfung";
  assert.ok(syntheticLongRestaurantName.length > 70);
  assert.match(owner, /activeRestaurant\?\.name/);
  assert.match(ownerCss, /restaurant-brand-title[\s\S]*text-overflow: ellipsis[\s\S]*white-space: nowrap/);
  assert.match(ownerCss, /@media \(max-width: 359px\)[\s\S]*owner-mobile-menu-label[\s\S]*display: none/);
  assert.match(ownerCss, /@media \(max-width: 359px\)[\s\S]*mobile-menu-button[\s\S]*width: 44px/);
  assert.doesNotMatch(ownerCss, /zoom\s*:/);
});

test("Owner menu uses active-language keys while tenant switching and routes stay unchanged", () => {
  assert.match(owner, /const \{ translateKey: t \} = useI18n\(\)/);
  assert.doesNotMatch(owner, /translateStructural\(key, "de"\)/);
  assert.match(owner, /onClick=\{\(\) => setMobileMenuOpen\(true\)\}/);
  assert.match(owner, /window\.addEventListener\("keydown", handleKeyDown\)/);
  assert.match(owner, /<TenantSwitcher \/>/);
  assert.match(owner, /to: "\/admin\/rewards"/);
  assert.match(owner, /activeRestaurant\?\.name/);
});

test("Staff date follows the active locale and updates with language", () => {
  assert.match(staff, /Intl\.DateTimeFormat\(localeTag\(language\)/);
  assert.match(staff, /\[language\]/);
  const sample = new Date("2026-09-13T12:00:00Z");
  const labels = Object.fromEntries(languages.map(language => [language,
    new Intl.DateTimeFormat(localeTag(language), { day: "2-digit", month: "long", year: "numeric", timeZone: "Europe/Vienna" }).format(sample),
  ]));
  assert.match(labels.de, /September/);
  assert.notEqual(labels.fr, labels.de);
  assert.notEqual(labels.it, labels.de);
  assert.notEqual(labels.es, labels.de);
  assert.notEqual(labels.zh, labels.de);
  assert.notEqual(labels.ko, labels.de);
});

test("Staff language selector gives the actual interactive select a 44px touch target", () => {
  assert.match(staffCss, /\.staff-premium-header > \.wux-language-selector select\s*\{[^}]*inset: -1px;[^}]*min-height: 44px;[^}]*min-width: 44px;[^}]*width: auto;/s);
  assert.match(staffCss, /\.staff-premium-header\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\) auto auto;/s);
  assert.doesNotMatch(staffCss, /\.staff-premium-header > \.wux-language-selector select\s*\{[^}]*position:\s*fixed/s);
});

test("Staff portal drawers use explicit active-language keys and preserve individual data", () => {
  assert.match(staff, /title=\{tr\("staff\.more\.title"\)\}/);
  assert.match(staff, /description=\{tr\("staff\.pin\.description"\)\}/);
  assert.match(staff, /aria-label=\{tr\("staff\.drawer\.cameraLabel"\)\}/);
  assert.match(staff, /placeholder=\{tr\("staff\.drawer\.searchPlaceholder"\)\}/);
  assert.match(staff, /customer\.name/);
  assert.match(staff, /pointsPreview\.customer_label/);
  assert.match(staff, /user\?\.email/);
  assert.doesNotMatch(staff.slice(staff.indexOf("<AppDrawer")), /title="Mehr"|aria-label="Service-Aufgaben"|placeholder="Tages-PIN eingeben"/);
});
