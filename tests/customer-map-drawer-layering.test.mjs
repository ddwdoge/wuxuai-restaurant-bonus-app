import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = async (path) => readFile(new URL(path, import.meta.url), "utf8");

const [finderPage, finderCss, mapCss, drawer, globalCss, centralCss] = await Promise.all([
  read("../src/modules/customer/PartnerRestaurantFinderPage.tsx"),
  read("../src/modules/customer/partner-restaurant-finder.css"),
  read("../src/modules/customer/partner-restaurant-map.css"),
  read("../src/shared/components/AppDrawer.tsx"),
  read("../src/styles.css"),
  read("../src/modules/customer/central-customer.css"),
]);

test("Restaurantdetails verwenden mobil und am Desktop denselben Body-Portal-Drawer", () => {
  assert.match(finderPage, /import \{ AppDrawer \} from "\.\.\/\.\.\/shared\/components\/AppDrawer"/);
  assert.match(finderPage, /const detailOpenInDrawer = Boolean\(selected\)/);
  assert.match(finderPage, /<AppDrawer[\s\S]*open=\{detailOpenInDrawer\}[\s\S]*title="Restaurantdetails"/);
  assert.doesNotMatch(finderPage, /selected && !detailOpenInDrawer/);
  assert.match(drawer, /createPortal\([\s\S]*document\.body/);
});

test("Leaflet-Tiles, Marker, Popups und Controls bleiben im isolierten Kartenkontext", () => {
  assert.match(finderCss, /partner-map-panel[^}]*isolation: isolate[^}]*z-index: 0/);
  assert.match(mapCss, /partner-map-runtime[\s\S]{0,220}isolation: isolate[\s\S]{0,220}z-index: 0/);
  assert.match(mapCss, /partner-map-tile-error[\s\S]{0,700}z-index: 1000/);
  assert.match(globalCss, /app-drawer-overlay[\s\S]{0,240}position: fixed[\s\S]{0,120}z-index: 90/);
});

test("offener Drawer blockiert Karten-Pointer, während der geschlossene Zustand kein Overlay rendert", () => {
  assert.match(globalCss, /app-drawer-overlay[\s\S]{0,220}inset: 0/);
  assert.match(drawer, /if \(!open\) return null/);
  assert.match(finderPage, /onClose=\{\(\) => setSelectedId\(null\)\}/);
});

test("Drawer besitzt iOS-tauglichen internen Scroll und sichere dynamische Höhe", () => {
  assert.match(globalCss, /app-drawer-body[\s\S]{0,180}overflow-y: auto[\s\S]{0,100}overscroll-behavior: contain/);
  assert.match(finderCss, /partner-detail-drawer-content\) \.app-drawer-body[\s\S]{0,180}-webkit-overflow-scrolling: touch[\s\S]{0,140}touch-action: pan-y/);
  assert.match(finderCss, /max-height: calc\(100dvh - env\(safe-area-inset-top\)\)/);
  assert.match(finderCss, /padding-bottom: calc\(18px \+ env\(safe-area-inset-bottom\)\)/);
});

test("Desktop-Details besitzen eine begrenzte Seitenbreite und eigenen internen Scroll", () => {
  assert.match(finderCss, /partner-detail-responsive-drawer[^}]*max-width: 560px[^}]*width: min\(560px, calc\(100vw - 48px\)\)/);
  assert.match(globalCss, /app-drawer-panel[^}]*height: 100dvh/);
  assert.match(globalCss, /app-drawer-body[^}]*overflow-y: auto/);
});

test("langer Detailinhalt und CTAs bleiben im scrollbaren Drawer zugänglich", () => {
  for (const content of ["partner-detail-heading", "partner-detail-stats", "partner-recommendation", "partner-available-rewards", "partner-current-offer", "partner-detail-actions"]) {
    assert.ok(finderPage.includes(content));
  }
  assert.match(finderCss, /partner-detail-actions \.premium-button[^}]*min-height: 48px/);
  assert.match(finderPage, />Bonus öffnen</);
  assert.match(finderPage, /> Route starten/);
});

test("Fokus, Escape und Scroll-Lock werden beim Schließen vollständig bereinigt", () => {
  assert.match(drawer, /document\.body\.style\.overflow = "hidden"/);
  assert.match(drawer, /event\.key === "Escape"/);
  assert.match(drawer, /document\.body\.style\.overflow = previousOverflow/);
  assert.match(drawer, /previousFocus\?\.focus/);
});

test("Bottom-Navigation bleibt unter dem Overlay und reserviert weiterhin ihre Safe Area", () => {
  assert.match(centralCss, /central-customer-navigation[^}]*z-index: 40/);
  assert.match(globalCss, /app-drawer-overlay[\s\S]{0,240}z-index: 90/);
  assert.match(centralCss, /calc\(108px \+ env\(safe-area-inset-bottom\)\)/);
});

test("Restaurant-, Karten- und Bonuslogik bleiben unverändert verdrahtet", () => {
  assert.match(finderPage, /loadPartnerRestaurants\(\)/);
  assert.match(finderPage, /<LazyPartnerRestaurantMap/);
  assert.match(finderPage, /googleMapsUrl\(location, "directions"\)/);
});
