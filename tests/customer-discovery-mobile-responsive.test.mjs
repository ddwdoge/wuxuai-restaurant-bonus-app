import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const [page, finderCss, map] = await Promise.all([
  read("../src/modules/customer/PartnerRestaurantFinderPage.tsx"),
  read("../src/modules/customer/partner-restaurant-finder.css"),
  read("../src/modules/customer/PartnerRestaurantMap.tsx"),
]);

test("mobile Karte und Liste sind semantisch gekoppelt und behalten denselben Datenzustand", () => {
  assert.match(page, /role="group"/);
  assert.match(page, /aria-controls="partner-map-panel" aria-pressed=\{view === "map"\}/);
  assert.match(page, /aria-controls="partner-list-panel" aria-pressed=\{view === "list"\}/);
  assert.match(page, /active=\{view === "map"\}/);
  assert.equal((page.match(/loadPartnerRestaurants\(\)/g) ?? []).length, 1);
});

test("mobile Layout entfernt das inaktive Panel vollständig und lässt den Grid-Vertrag bestehen", () => {
  const mobile = finderCss.slice(finderCss.indexOf("@media (max-width: 767px)"), finderCss.indexOf("@media (min-width: 768px)"));
  assert.match(mobile, /partner-finder-content\.view-map \.partner-list-panel \{ display: none; \}/);
  assert.match(mobile, /partner-finder-content\.view-list \.partner-map-panel \{ display: none; \}/);
  assert.match(mobile, /partner-finder-content\.view-list \{ grid-template-rows: auto; \}/);
  assert.doesNotMatch(mobile, /partner-finder-content\.view-list \{ display: block/);
  assert.match(mobile, /partner-finder-content\.view-list \.partner-list-panel[^}]*width: 100%/);
});

test("mobile Suche, Standortaktion, Toggle und Filter bleiben innerhalb der Viewportbreite", () => {
  assert.match(finderCss, /partner-filter-scroll[^}]*max-width: 100%[^}]*overflow-x: auto[^}]*overflow-y: hidden/);
  assert.match(finderCss, /partner-filter-scroll button[^}]*min-height: 44px/);
  const mobile = finderCss.slice(finderCss.indexOf("@media (max-width: 767px)"), finderCss.indexOf("@media (min-width: 768px)"));
  assert.match(mobile, /partner-finder-controls \{ grid-template-columns: minmax\(0, 1fr\); \}/);
  assert.match(mobile, /partner-location-button,[\s\S]*partner-view-toggle \{ width: 100%; \}/);
});

test("Restaurantliste besitzt eine zugängliche Listenstruktur", () => {
  assert.match(page, /className="partner-results-list" role="list"/);
  assert.match(page, /className="partner-result-list-item"[^>]*role="listitem"/);
});

test("Loading-, Fehler- und Leerzustand bleiben unabhängig vom gewählten Panel erreichbar", () => {
  assert.match(page, /loading \? <LoadingState/);
  assert.match(page, /!loading && error \? <ErrorState/);
  assert.match(page, /!loading && !error && filteredLocations\.length === 0 \? \(/);
  assert.match(page, /!loading && !error && filteredLocations\.length \? \(/);
});

test("Leaflet wird beim erneuten Aktivieren der mobilen Karte explizit neu vermessen", () => {
  assert.match(map, /function MapSizeSync\(\{ active = true \}/);
  assert.match(map, /if \(!active\) return;[\s\S]*map\.invalidateSize\(\{ animate: false \}\)/);
  assert.match(map, /<MapSizeSync active=\{active\} \/>/);
});

test("Desktop-Split bleibt ab 768 Pixeln unverändert erhalten", () => {
  const desktop = finderCss.slice(finderCss.indexOf("@media (min-width: 768px)"), finderCss.indexOf("@media (max-width: 420px)"));
  assert.match(desktop, /grid-template-columns: minmax\(0, 1\.35fr\) minmax\(320px, 0\.65fr\)/);
  assert.match(desktop, /partner-view-toggle \{ display: none; \}/);
});

test("breite niedrige Landscape-Viewports erhalten Dokument-Scroll und gleich hohe aktive Panels", () => {
  const shortLandscape = finderCss.slice(
    finderCss.indexOf("@media (min-width: 600px) and (max-height: 500px) and (orientation: landscape)"),
    finderCss.indexOf(".partner-offer-badge"),
  );

  assert.match(shortLandscape, /partner-finder-shell[\s\S]*height: auto;[\s\S]*min-height: 100dvh;[\s\S]*overflow: visible;/);
  assert.match(shortLandscape, /padding-bottom: calc\(96px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(shortLandscape, /padding-top: max\(12px, env\(safe-area-inset-top\)\)/);
  assert.match(shortLandscape, /partner-view-toggle \{ display: grid; \}/);
  assert.match(shortLandscape, /partner-finder-content,[\s\S]*grid-template-columns: minmax\(0, 1fr\);[\s\S]*grid-template-rows: minmax\(280px, auto\);[\s\S]*min-height: 280px;[\s\S]*overflow: visible;/);
  assert.match(shortLandscape, /partner-map-panel,[\s\S]*partner-list-panel \{ min-height: 280px; \}/);
  assert.match(shortLandscape, /partner-list-panel \{ overflow: visible; padding-right: 0; \}/);
  assert.match(shortLandscape, /view-map \.partner-list-panel \{ display: none; \}/);
  assert.match(shortLandscape, /view-list \.partner-map-panel \{ display: none; \}/);
  assert.doesNotMatch(shortLandscape, /!important/);
});


test("nur die Discovery-Karte deaktiviert die Zoomanimation ohne globale Leaflet-Konfiguration", async () => {
  const openingTag = map.match(/<MapContainer\b[\s\S]*?>/)?.[0];
  assert.ok(openingTag);
  assert.match(openingTag, /zoomAnimation=\{false\}/);
  const sources = [];
  async function collect(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = new URL(entry.name + (entry.isDirectory() ? "/" : ""), directory);
      if (entry.isDirectory()) await collect(path);
      else if (/\.[cm]?[jt]sx?$/.test(entry.name)) sources.push([path, await readFile(path, "utf8")]);
    }
  }
  await collect(new URL("../src/", import.meta.url));
  const animationSettings = sources.filter(([, source]) => /zoomAnimation/.test(source));
  assert.equal(animationSettings.length, 1);
  assert.equal(animationSettings[0][0].pathname, new URL("../src/modules/customer/PartnerRestaurantMap.tsx", import.meta.url).pathname);
  assert.equal((map.match(/zoomAnimation/g) ?? []).length, 1);
  for (const [, source] of sources) {
    assert.doesNotMatch(source, /(?:L|Leaflet)\.Map\.(?:mergeOptions|include)\s*\(/);
    assert.doesNotMatch(source, /(?:L|Leaflet)\.Map\.prototype\.options/);
  }
});
