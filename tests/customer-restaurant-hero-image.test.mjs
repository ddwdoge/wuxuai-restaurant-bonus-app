import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const componentUrl = new URL("../src/modules/customer/components/RestaurantHeroImage.tsx", import.meta.url);
const pageUrl = new URL("../src/modules/customer/PartnerRestaurantFinderPage.tsx", import.meta.url);
const cssUrl = new URL("../src/modules/customer/partner-restaurant-finder.css", import.meta.url);

test("Restaurantdetails verwenden einen gemeinsamen sicheren Hero statt eines nackten Cover-Bilds", async () => {
  const [component, page] = await Promise.all([readFile(componentUrl, "utf8"), readFile(pageUrl, "utf8")]);
  assert.match(page, /<RestaurantHeroImage[\s\S]*coverImageUrl=\{location\.cover_image_url\}[\s\S]*presentation=\{\{/);
  assert.doesNotMatch(page, /<img alt=\{`\$\{location\.name\} Titelbild`\}/);
  assert.match(component, /type ImageState = "loading" \| "valid" \| "error" \| "missing"/);
});

test("Hero entfernt fehlerhafte Bilder, zeigt einen Logo-Fallback und setzt sich nur bei neuer Quelle zurück", async () => {
  const [component, logoStage] = await Promise.all([
    readFile(componentUrl, "utf8"),
    readFile(new URL("../src/shared/components/RestaurantLogoStage.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(component, /imageUrl=\{state === "error" \? null : source\}/);
  assert.match(component, /onImageError=\{\(\) => setState\("error"\)\}/);
  assert.match(component, /onImageLoad=\{\(\) => setState\("valid"\)\}/);
  assert.match(component, /useEffect\(\(\) => \{\s*setState\(source \? "loading" : "missing"\);\s*\}, \[source\]\)/);
  assert.match(component, /<RestaurantLogoImage[^>]+logoUrl=\{logoUrl\}/);
  assert.match(component, /<RestaurantLogoStage/);
  assert.match(logoStage, /onError=\{\(\) => setFailedUrl\(normalizedUrl\)\}/);
  assert.match(logoStage, /className="restaurant-logo-fallback"/);
  assert.doesNotMatch(component, /setInterval|setTimeout|retry/i);
});

test("Valides Cover behält semantischen Alt-Text, während Lade- und Fehlerzustände unsichtbar bleiben", async () => {
  const component = await readFile(componentUrl, "utf8");
  assert.match(component, /alt=\{`\$\{name\} Titelbild`\}/);
  assert.match(component, /className="partner-detail-cover"/);
  assert.match(component, /presentation=\{presentation\}/);
  assert.match(component, /role=\{state === "valid" \? undefined : "img"\}/);
});

test("Hero und Fallback besitzen identische feste Abmessungen ohne horizontalen Überlauf", async () => {
  const css = await readFile(cssUrl, "utf8");
  assert.match(css, /\.partner-detail-hero \{[^}]*aspect-ratio: 16 \/ 9[^}]*overflow: hidden[^}]*position: relative[^}]*width: calc\(100% \+ 32px\)/s);
  assert.match(css, /\.partner-detail-cover \{[^}]*height: 100%[^}]*inset: 0[^}]*position: absolute[^}]*width: 100%/s);
  assert.match(css, /\.partner-detail-hero-fallback \{[^}]*inset: 0[^}]*position: absolute/s);
  assert.match(css, /\.partner-detail-drawer-content \.partner-detail-hero \{ margin: 0; width: 100%; \}/);
  assert.match(css, /\.partner-finder-shell \{[^}]*overflow-x: hidden/s);
  assert.doesNotMatch(css, /\.partner-detail-hero[^}]*100vw/s);
});

test("gespeicherter Cover-Ausschnitt wird über den kanonischen Smart-Media-Renderer gefüllt", async () => {
  const [component, frame, css] = await Promise.all([
    readFile(componentUrl, "utf8"),
    readFile(new URL("../src/shared/components/SmartMediaFrame.tsx", import.meta.url), "utf8"),
    readFile(cssUrl, "utf8"),
  ]);
  assert.match(component, /presentation=\{presentation\}/);
  assert.match(frame, /coverScale \* normalized\.zoom/);
  assert.match(css, /\.partner-detail-hero \{[^}]*aspect-ratio: 16 \/ 9/);
});

test("Auch Listen- und Detail-Logos haben einen neutralen Fehlerzustand", async () => {
  const [component, page, logoStage] = await Promise.all([
    readFile(componentUrl, "utf8"),
    readFile(pageUrl, "utf8"),
    readFile(new URL("../src/shared/components/RestaurantLogoStage.tsx", import.meta.url), "utf8"),
  ]);
  assert.equal((page.match(/<RestaurantLogoImage/g) ?? []).length, 2);
  assert.match(component, /<RestaurantLogoStage/);
  assert.match(logoStage, /className="restaurant-logo-fallback"/);
  assert.match(logoStage, /failedUrl !== normalizedUrl/);
});
