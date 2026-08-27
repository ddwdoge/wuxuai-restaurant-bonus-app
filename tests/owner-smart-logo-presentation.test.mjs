import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  clampLogoPresentation,
  logoAspectKind,
  logoCanvasPlacement,
  logoImageStyle,
  logoPresentationAfterEditorDrag,
  logoPresentationAtRelativeScale,
  relativeLogoScale,
  transparentContentAdjustment,
} from "../src/shared/logoPresentation.mjs";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Smart Logo erkennt quadratische, breite, sehr breite und hohe Formate", () => {
  assert.equal(logoAspectKind(1000, 1000), "square");
  assert.equal(logoAspectKind(1600, 700), "wide");
  assert.equal(logoAspectKind(3200, 500), "wide");
  assert.equal(logoAspectKind(600, 1200), "tall");
});

test("Editor-Skalierung ist relativ zur berechneten Auto-Fit-Basis", () => {
  const baseline = { fitMode: "manual", positionX: 0.55, positionY: 0.45, scale: 1.25 };
  assert.equal(relativeLogoScale(baseline, baseline), 1);
  assert.equal(relativeLogoScale({ ...baseline, scale: 1.5 }, baseline), 1.2);
  assert.equal(relativeLogoScale({ ...baseline, fitMode: "auto", scale: 2 }, baseline), 1);
  assert.deepEqual(logoPresentationAtRelativeScale(baseline, baseline, 0.8), {
    fitMode: "manual", positionX: 0.55, positionY: 0.45, scale: 1,
  });
});

test("Auto-Fit bewahrt das Seitenverhältnis und nutzt formatabhängigen Sicherheitsabstand", () => {
  const square = logoCanvasPlacement(1000, 1000, { x: 0, y: 0, width: 400, height: 200 });
  const wide = logoCanvasPlacement(3000, 500, { x: 0, y: 0, width: 400, height: 200 });
  const tall = logoCanvasPlacement(500, 2000, { x: 0, y: 0, width: 400, height: 200 });
  assert.equal(square.width / square.height, 1);
  assert.equal(wide.width / wide.height, 6);
  assert.equal(tall.width / tall.height, 0.25);
  assert.ok(square.width <= 400 && square.height <= 200);
  assert.ok(wide.width <= 400 && wide.height <= 200);
  assert.ok(tall.width <= 400 && tall.height <= 200);
});

test("Owner-Anpassungen werden begrenzt und bleiben reine Präsentationsdaten", () => {
  assert.deepEqual(clampLogoPresentation({ fitMode: "manual", positionX: -4, positionY: 8, scale: 99 }), {
    fitMode: "manual", positionX: 0, positionY: 1, scale: 3,
  });
  assert.match(logoImageStyle({ fitMode: "manual", positionX: 0.75, positionY: 0.25, scale: 1.4 }).transform, /scale\(1\.4\)/);
});

test("Direktes Ziehen schreibt nur begrenzte bestehende Positionswerte", () => {
  const start = { fitMode: "manual", positionX: 0.5, positionY: 0.5, scale: 1.2 };
  assert.deepEqual(logoPresentationAfterEditorDrag(start, 34, -17, 200, 100), {
    fitMode: "manual", positionX: 1, positionY: 0, scale: 1.2,
  });
  assert.deepEqual(logoPresentationAfterEditorDrag(start, 9999, 9999, 200, 100), {
    fitMode: "manual", positionX: 1, positionY: 1, scale: 1.2,
  });
});

test("Transparenter Innenabstand kann sicher vorgeschlagen, aber nicht destruktiv entfernt werden", () => {
  const adjustment = transparentContentAdjustment({ left: 200, right: 799, top: 200, bottom: 799 }, 1000, 1000);
  assert.equal(adjustment?.fitMode, "manual");
  assert.ok((adjustment?.scale ?? 0) > 1);
  const leftWeighted = transparentContentAdjustment({ left: 50, right: 449, top: 300, bottom: 699 }, 1000, 1000);
  assert.ok((leftWeighted?.positionX ?? 0) > 0.5);
  assert.equal(transparentContentAdjustment({ left: 10, right: 989, top: 10, bottom: 989 }, 1000, 1000), null);
});

test("Gemeinsame LogoStage behandelt defekte Quellen ohne sichtbaren Browser-Fallback", async () => {
  const [component, css] = await Promise.all([
    read("src/shared/components/RestaurantLogoStage.tsx"),
    read("src/shared/components/restaurant-logo-stage.css"),
  ]);
  assert.match(component, /onError=\{\(\) => setFailedUrl\(normalizedUrl\)\}/);
  assert.match(component, /showImage \? \(/);
  assert.match(component, /className="restaurant-logo-fallback"/);
  assert.match(component, /naturalWidth/);
  assert.match(css, /object-fit: contain/);
  assert.match(css, /aspect-wide img \{ padding: 13% 5%; \}/);
  assert.match(css, /restaurant-logo-stage\.has-image \{[\s\S]*background: transparent;[\s\S]*border-color: transparent;/);
  assert.match(css, /has-image\.size-header\.aspect-square \{ width: 48px; \}/);
  assert.match(css, /has-image\.size-header\.aspect-tall \{ width: 40px; \}/);
  assert.match(css, /has-image\.size-print\.aspect-square \{ width: 82px; \}/);
  assert.doesNotMatch(component, /dangerouslySetInnerHTML/);
});

test("Owner-Editor unterstützt direkte Manipulation und fünf reale Vorschaukontexte", async () => {
  const [settings, styles, drawer] = await Promise.all([
    read("src/modules/admin/pages/SettingsPage.tsx"),
    read("src/styles.css"),
    read("src/shared/components/AppDrawer.tsx"),
  ]);
  assert.match(settings, /title="Logo anpassen"/);
  assert.match(settings, /size="workspace"/);
  assert.match(settings, /className="branding-logo-drawer"/);
  assert.match(settings, /1\. Live-Vorschau/);
  assert.match(settings, /branding-logo-safe-area/);
  assert.match(settings, /Sicherheitsbereich/);
  assert.match(settings, /Automatisch einpassen/);
  assert.match(settings, /relativeLogoScale/);
  assert.match(settings, /logoPresentationAtRelativeScale/);
  assert.match(settings, /logoPresentationAfterEditorDrag/);
  assert.match(settings, /Zurücksetzen/);
  assert.match(settings, /Logo verkleinern/);
  assert.match(settings, /onPointerDown=\{beginPointerGesture\}/);
  assert.match(settings, /onPointerMove=\{movePointerGesture\}/);
  assert.match(settings, /onWheel=\{zoomWithWheel\}/);
  assert.match(settings, /onKeyDown=\{handleEditorKeys\}/);
  assert.match(settings, /Mit zwei Fingern kannst du zoomen/);
  assert.match(settings, /Gäste-Header/);
  assert.match(settings, /Restaurant-Portal/);
  assert.match(settings, /Restaurantdetails/);
  assert.match(settings, /QR Starter Kit/);
  assert.match(settings, /Mitarbeiter-Header/);
  assert.equal((settings.match(/<article>/g) ?? []).length, 5);
  assert.match(settings, /footer=\{\(/);
  assert.match(settings, /openingPresentationRef/);
  assert.match(styles, /app-drawer-workspace[\s\S]*height: min\(90dvh, 820px\)/);
  assert.match(styles, /app-drawer-workspace\.branding-logo-drawer \{ height: min\(90dvh, 680px\); \}/);
  assert.doesNotMatch(settings, /2\. Anpassungen/);
  assert.doesNotMatch(settings, /branding-logo-control-grid/);
  assert.match(styles, /branding-logo-safe-area[\s\S]*touch-action: none/);
  assert.match(styles, /branding-logo-context-grid[\s\S]*overflow-x: auto/);
  assert.match(styles, /scroll-snap-type: x mandatory/);
  assert.match(styles, /--branding-logo-source-ratio/);
  assert.match(styles, /min-height: 116px/);
  assert.match(drawer, /app-drawer-overlay-\$\{size\}/);
  assert.match(settings, /image\/webp/);
  assert.match(settings, /5 \* 1024 \* 1024/);
  assert.match(settings, /initialPresentation = inspection\.adjustment \?\? defaultLogoPresentation/);
  assert.match(settings, /logo_fit_mode: initialPresentation\.fitMode/);
  assert.match(settings, /logo_scale: initialPresentation\.scale/);
});

test("Aktive Restaurant-Brandingflächen verwenden die gemeinsame LogoStage", async () => {
  const paths = [
    "src/modules/admin/AdminLayout.tsx",
    "src/modules/staff/StaffTablet.tsx",
    "src/modules/customer/components/PremiumCustomerUi.tsx",
    "src/modules/customer/CustomerPortal.tsx",
    "src/modules/admin/pages/QrCenterPage.tsx",
    "src/modules/admin/pages/RestaurantOnboarding.tsx",
  ];
  const sources = await Promise.all(paths.map(read));
  sources.forEach((source, index) => assert.match(source, /RestaurantLogoStage/, paths[index]));
  assert.match(sources[0], /presentation=\{branding\}/);
  assert.doesNotMatch(sources[5], /<img alt=\{`\$\{form\.restaurantName/);
  assert.match(sources[4], /logoCanvasPlacement/);
  assert.match(sources[5], /logoCanvasPlacement/);
});

test("Owner-Header lässt die kanonische Smart-Logo-Geometrie unverändert", async () => {
  const [layout, premiumStyles] = await Promise.all([
    read("src/modules/admin/AdminLayout.tsx"),
    read("src/modules/admin/admin-premium.css"),
  ]);
  assert.match(layout, /<RestaurantLogoStage[\s\S]*presentation=\{branding\}/);
  assert.match(premiumStyles, /admin-restaurant-brand \.restaurant-logo-frame \{[\s\S]*border-color: transparent;[\s\S]*box-shadow: none;[\s\S]*padding: 0;/);
  assert.doesNotMatch(layout, /<img[^>]+logo/i);
});

test("Additive Migration persistiert nur sichere Darstellungsmetadaten und hält den Portal-Guard", async () => {
  const migration = await read("supabase/migrations/20260827001000_restaurant_logo_presentation.sql");
  assert.match(migration, /add column if not exists logo_fit_mode/);
  assert.match(migration, /check \(logo_scale between 0\.75 and 3\)/);
  assert.match(migration, /security definer\s+set search_path = public/s);
  assert.match(migration, /CUSTOMER_ACCESS_TOKEN_INVALID/);
  assert.match(migration, /CUSTOMER_MEMBERSHIP_INACTIVE/);
  assert.match(migration, /revoke execute .* from public/);
  assert.doesNotMatch(migration, /disable row level security|grant all|service_role/i);
});
