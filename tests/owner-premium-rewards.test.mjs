import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const rewardsPage = readFileSync(new URL("../src/modules/admin/pages/RewardsPage.tsx", import.meta.url), "utf8");
const welcomeGiftsPage = readFileSync(new URL("../src/modules/admin/pages/WelcomeGiftsPage.tsx", import.meta.url), "utf8");
const rewardCard = readFileSync(new URL("../src/modules/admin/components/PremiumOwnerRewardCard.tsx", import.meta.url), "utf8");
const imageUploader = readFileSync(new URL("../src/modules/admin/components/OwnerRewardImageUploader.tsx", import.meta.url), "utf8");
const imageServiceSource = readFileSync(new URL("../src/modules/admin/services/ownerRewardImageService.ts", import.meta.url), "utf8");
const imageServiceJavaScript = ts.transpileModule(imageServiceSource.replace(/^import .*supabase.*;$/m, "const supabase = null;"), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const imageService = await import(`data:text/javascript;base64,${Buffer.from(imageServiceJavaScript).toString("base64")}`);
const styles = readFileSync(new URL("../src/modules/admin/admin-premium.css", import.meta.url), "utf8");
const webpMigration = readFileSync(new URL("../supabase/migrations/20260726001000_owner_reward_image_webp.sql", import.meta.url), "utf8");
const customerPortal = readFileSync(new URL("../src/modules/customer/CustomerPortal.tsx", import.meta.url), "utf8");
const staffPortal = readFileSync(new URL("../src/modules/staff/StaffTablet.tsx", import.meta.url), "utf8");
const platformPortal = readFileSync(new URL("../src/modules/platform/PlatformAdminPage.tsx", import.meta.url), "utf8");

test("Premium-Verwaltung bleibt im Restaurant-Portal gekapselt", () => {
  assert.match(rewardsPage, /premium-owner-management-page/);
  assert.match(welcomeGiftsPage, /premium-owner-management-page/);
  assert.match(styles, /\.premium-owner-shell \.premium-owner-management-header/);
  assert.doesNotMatch(styles, /customer-premium-app|platform-admin-shell/);
});

test("Punkteeinlösungen verwenden echte Datenwege und automatische Punkte", () => {
  assert.match(rewardsPage, /loadRewardOffers\(restaurantId\)/);
  assert.match(rewardsPage, /loadLoyaltySettings\(restaurantId\)/);
  assert.match(rewardsPage, /saveRewardOffer\(/);
  assert.match(rewardsPage, /setRewardOfferActive\(/);
  assert.match(rewardsPage, /required_points: calculation\.requiredPoints/);
  assert.doesNotMatch(rewardsPage, /Manuelle Punkte|Punkte eingeben/);
});

test("Willkommensgeschenke bleiben eigener kostenloser Geschenkpool", () => {
  assert.match(welcomeGiftsPage, /offer\.is_starter_reward/);
  assert.match(welcomeGiftsPage, /required_points: 0/);
  assert.match(welcomeGiftsPage, /Aktive Geschenke gehören zum Pool/);
  assert.doesNotMatch(welcomeGiftsPage, /nur ein aktives|zweite aktive/i);
});

test("Karten, Vorschau und Statusbestätigung sind echte UI-Zustände", () => {
  assert.match(rewardCard, /premium-owner-status-badge/);
  assert.match(rewardsPage, /Vorschau im Kundenportal/);
  assert.match(welcomeGiftsPage, /Vorschau im Kundenportal/);
  assert.match(rewardsPage, /Belohnung deaktivieren\?/);
  assert.match(rewardsPage, /Belohnung aktivieren\?/);
  assert.match(welcomeGiftsPage, /Bereits zugeteilte und eingelöste Geschenke bleiben unverändert/);
});

test("Lade-, Leer- und Fehlerzustände bleiben ohne Demo-Daten", () => {
  for (const page of [rewardsPage, welcomeGiftsPage]) {
    assert.match(page, /premium-owner-reward-skeleton/);
    assert.match(page, /Erneut versuchen/);
    assert.doesNotMatch(page, /demo|fake/i);
  }
  assert.match(rewardsPage, /Noch keine Punkteeinlösungen/);
  assert.match(welcomeGiftsPage, /Noch kein Willkommensgeschenk/);
});

test("Premium-Karten sind mobil einspaltig und ohne horizontales Überlaufen", () => {
  assert.match(styles, /@media \(max-width: 699px\)[\s\S]*premium-owner-reward-grid[\s\S]*grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(styles, /premium-owner-management-page[\s\S]*max-width: 1280px[\s\S]*min-width: 0[\s\S]*width: 100%/);
  assert.match(styles, /premium-owner-reward-card[\s\S]*max-width: 100%[\s\S]*min-width: 0[\s\S]*width: 100%/);
  assert.match(styles, /@media \(min-width: 700px\) and \(max-width: 1179px\)[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(styles, /premium-owner-reward-actions[\s\S]*min-height: 44px/);
  assert.match(styles, /premium-owner-reward-actions \.button[\s\S]*white-space: normal[\s\S]*width: 100%/);
});

test("Owner-Bildupload akzeptiert JPG, PNG und WebP bis fünf MB", () => {
  for (const type of ["image/jpeg", "image/png", "image/webp"]) {
    assert.equal(imageService.validateOwnerRewardImage({ type, size: 5 * 1024 * 1024 }), null);
  }
  assert.equal(imageService.validateOwnerRewardImage({ type: "image/svg+xml", size: 512 }), "Bitte wähle eine JPG-, PNG- oder WebP-Datei.");
  assert.equal(imageService.validateOwnerRewardImage({ type: "image/jpeg", size: 5 * 1024 * 1024 + 1 }), "Das Bild darf maximal 5 MB groß sein.");
  assert.match(webpMigration, /allowed_mime_types[\s\S]*image\/webp/);
  assert.doesNotMatch(webpMigration, /storage\.objects|create policy|drop policy|disable row level security/i);
});

test("großer Owner-Bildbereich öffnet den nativen Picker per Klick und Tastatur", () => {
  assert.match(imageUploader, /type="file"/);
  assert.match(imageUploader, /accept="image\/jpeg,image\/png,image\/webp"/);
  assert.match(imageUploader, /fileInputRef\.current\?\.click\(\)/);
  assert.match(imageUploader, /event\.key === "Enter" \|\| event\.key === " "/);
  assert.match(imageUploader, /role="button"/);
  assert.match(imageUploader, /tabIndex=/);
  assert.match(imageUploader, /aria-live="polite"/);
  assert.match(styles, /owner-reward-image-trigger:focus-visible/);
});

test("beide Owner-Formulare zeigen lokale Vorschau und laden erst beim Speichern hoch", () => {
  for (const page of [rewardsPage, welcomeGiftsPage]) {
    assert.match(page, /<OwnerRewardImageUploader/);
    assert.match(page, /URL\.createObjectURL\(file\)/);
    assert.match(page, /URL\.revokeObjectURL/);
    assert.match(page, /uploadOwnerRewardImage\(/);
  }
  assert.ok(rewardsPage.indexOf("uploadOwnerRewardImage(") > rewardsPage.indexOf("async function saveReward"));
  assert.ok(welcomeGiftsPage.indexOf("uploadOwnerRewardImage(") > welcomeGiftsPage.indexOf("async function saveGift"));
  assert.match(rewardsPage, /image_url: imageUrl \?\? editingOffer\?\.image_url \?\? null/);
  assert.match(welcomeGiftsPage, /original\?\.image_url \?\? null/);
  assert.match(rewardsPage, /if \(uploadedObjectPath\) await removeOwnerRewardImageUpload/);
  assert.match(welcomeGiftsPage, /if \(uploadedObjectPath\) await removeOwnerRewardImageUpload/);
});

test("Uploadpfade sind tenantgebunden und verwenden keine Original-Dateinamen", () => {
  assert.match(imageServiceSource, /input\.restaurantId/);
  assert.match(imageServiceSource, /input\.folder/);
  assert.match(imageServiceSource, /entityScope/);
  assert.match(imageServiceSource, /crypto\.randomUUID\(\)/);
  assert.doesNotMatch(imageServiceSource, /file\.name/);
  assert.match(imageServiceSource, /upsert: false/);
});

test("Uploader bleibt ausschließlich im Restaurant-Owner-Portal", () => {
  assert.doesNotMatch(customerPortal, /OwnerRewardImageUploader|Foto ändern|Foto hinzufügen/);
  assert.doesNotMatch(staffPortal, /OwnerRewardImageUploader|Foto ändern|Foto hinzufügen/);
  assert.doesNotMatch(platformPortal, /OwnerRewardImageUploader|Foto ändern|Foto hinzufügen/);
  assert.match(styles, /owner-reward-image-trigger[\s\S]*min-height: 176px/);
  assert.match(styles, /owner-reward-image-remove[\s\S]*height: 44px[\s\S]*width: 44px/);
});
