import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const migration = read("../supabase/migrations/20260828001000_global_restaurant_media_presentation.sql");
const smartEditor = read("../src/shared/components/SmartMediaEditor.tsx");
const smartFrame = read("../src/shared/components/SmartMediaFrame.tsx");
const styles = read("../src/shared/components/smart-media.css");
const offersPage = read("../src/modules/admin/pages/RestaurantOffersPage.tsx");
const offerService = read("../src/modules/offers/restaurantOfferService.ts");
const offerCard = read("../src/modules/customer/components/RestaurantOfferCard.tsx");
const welcomePage = read("../src/modules/admin/pages/WelcomeGiftsPage.tsx");
const rewardsPage = read("../src/modules/admin/pages/RewardsPage.tsx");
const settingsPage = read("../src/modules/admin/pages/SettingsPage.tsx");
const hero = read("../src/modules/customer/components/RestaurantHeroImage.tsx");

test("ein gemeinsamer direkter Editor bedient Drag, Pinch, Wheel und Tastatur", () => {
  assert.match(smartEditor, /new Map<number, PointerPosition>/);
  assert.match(smartEditor, /pointerDistance/);
  assert.match(smartEditor, /onPointerMove/);
  assert.match(smartEditor, /onWheel/);
  assert.match(smartEditor, /Math\.exp\(-event\.deltaY/);
  assert.match(smartEditor, /ArrowLeft/);
  assert.match(styles, /touch-action: none/);
  assert.doesNotMatch(smartEditor, /type="range"/);
});

test("Auto-Fit und Reset haben getrennte Semantik", () => {
  assert.match(smartEditor, /Automatisch einpassen/);
  assert.match(smartEditor, /positionX: 0\.5, positionY: 0\.5/);
  assert.match(smartEditor, /savedState\.presentation/);
  assert.match(smartEditor, />Zurücksetzen</);
});

test("kleine historische Bilder bleiben erlaubt und erhalten einen Qualitätshinweis", () => {
  assert.match(smartEditor, /imageDimensions\.width < 1280/);
  assert.match(smartEditor, /imageDimensions\.height < 720/);
  assert.match(smartEditor, /empfehlen wir mindestens 1280 × 720 Pixel/);
  assert.doesNotMatch(smartEditor, /throw new Error.*1280|disabled=.*qualityWarning/s);
});

test("Rewards, Welcome und Birthday Pool nutzen weiterhin denselben Medienkern", () => {
  assert.match(rewardsPage, /OwnerRewardImageEditor/);
  assert.match(welcomePage, /OwnerRewardImageEditor/);
  assert.match(welcomePage, /birthdayPoolEnabled/);
  assert.match(smartFrame, /calculateMediaCoverScale/);
});

test("Angebote speichern und rendern denselben 16:9-Ausschnitt", () => {
  assert.match(offersPage, /OwnerRewardImageEditor/);
  assert.match(offersPage, /imageZoom: form\.imageCrop\.zoom/);
  assert.match(offerService, /save_restaurant_offer_image_presentation/);
  assert.match(offerCard, /SmartMediaFrame/);
  assert.match(offerCard, /mediaPresentationFromRecord/);
  assert.match(migration, /source_record\.image_zoom/);
  assert.match(migration, /source_record\.image_position_x/);
  assert.match(migration, /source_record\.image_position_y/);
});

test("Angebote zeigen beim Bearbeiten nur eine direkte Bildfläche", () => {
  assert.match(offersPage, /photoPreview \|\| form\.imageUrl \? \([\s\S]*OwnerRewardImageEditor[\s\S]*\) : \([\s\S]*OwnerRewardImageUploader/);
  assert.match(offersPage, /Anderes Foto wählen|OwnerRewardImageEditor/);
  assert.match(offersPage, /Foto entfernen/);
  assert.doesNotMatch(offersPage, /<OwnerRewardImageUploader[\s\S]{0,1200}<OwnerRewardImageEditor/);
});

test("Restaurant-Titelbilder nutzen den gemeinsamen Editor und sicheren Fallback", () => {
  assert.match(settingsPage, /SmartMediaEditor/);
  assert.match(settingsPage, /public_cover_image_zoom/);
  assert.match(hero, /SmartMediaFrame/);
  assert.match(hero, /partner-detail-hero-fallback/);
});

test("Migration ist additiv, tenantgebunden und lockert keine RLS", () => {
  assert.match(migration, /alter table public\.restaurant_offers[\s\S]*add column if not exists image_zoom/);
  assert.match(migration, /alter table public\.branches[\s\S]*add column if not exists public_cover_image_zoom/);
  assert.match(migration, /public\.is_restaurant_admin\(input_restaurant_id\)/);
  assert.match(migration, /null, 'admin', auth\.uid\(\)/);
  assert.match(migration, /where id = input_offer_id[\s\S]*restaurant_id = input_restaurant_id/);
  assert.match(migration, /revoke all on function public\.save_restaurant_offer_image_presentation[\s\S]*grant execute[\s\S]*to authenticated/);
  assert.doesNotMatch(migration, /disable row level security|grant select on public\.(restaurant_offers|branches)/i);
});

test("öffentliche RPCs geben nur Darstellungsmetadaten zusätzlich aus", () => {
  assert.match(migration, /'image_zoom', o\.image_zoom/);
  assert.match(migration, /'cover_image_zoom', branch\.public_cover_image_zoom/);
  assert.match(migration, /grant execute on function public\.get_public_restaurant_offers[\s\S]*to anon, authenticated/);
  assert.match(migration, /grant execute on function public\.get_partner_local_finder[\s\S]*to anon, authenticated/);
  assert.doesNotMatch(migration, /service_role|customer_email|customer_phone/i);
});
