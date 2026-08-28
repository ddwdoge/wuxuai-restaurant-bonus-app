import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const settingsPage = read("../src/modules/admin/pages/SettingsPage.tsx");
const smartEditor = read("../src/shared/components/SmartMediaEditor.tsx");
const offersPage = read("../src/modules/admin/pages/RestaurantOffersPage.tsx");
const rewardsPage = read("../src/modules/admin/pages/RewardsPage.tsx");
const welcomePage = read("../src/modules/admin/pages/WelcomeGiftsPage.tsx");

function functionBody(source, start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex);
  assert.notEqual(startIndex, -1, `${start} fehlt`);
  assert.notEqual(endIndex, -1, `${end} fehlt`);
  return source.slice(startIndex, endIndex);
}

test("neues Restaurantbild schreibt beim Upload keine konkurrierenden Standardwerte", () => {
  const upload = functionBody(settingsPage, "async function uploadCoverImage", "function handleCoverInputChange");

  assert.match(upload, /storage\.from\("restaurant-media"\)\.upload/);
  assert.match(upload, /pendingCoverUploadPathRef\.current = path/);
  assert.match(upload, /setPartnerLocation/);
  assert.doesNotMatch(upload, /\.from\("branches"\)/);
  assert.doesNotMatch(upload, /public_cover_image_(zoom|position_x|position_y)/);
  assert.doesNotMatch(upload, /Restaurantbild gespeichert/);
});

test("erster Branding-Save persistiert URL und aktuelle Präsentation gemeinsam", () => {
  const save = functionBody(settingsPage, "async function saveBranding", "async function uploadCoverImage");
  const persistenceFields = functionBody(settingsPage, "function coverImagePersistenceFields", "type GeocodingStatus");

  assert.match(save, /\.from\("branches"\)[\s\S]*\.update\(coverImagePersistenceFields\(partnerLocation\)\)/);
  assert.match(persistenceFields, /public_cover_image_url: location\.coverImageUrl/);
  assert.match(persistenceFields, /public_cover_image_zoom: location\.coverImagePresentation\.zoom/);
  assert.match(persistenceFields, /public_cover_image_position_x: location\.coverImagePresentation\.positionX/);
  assert.match(persistenceFields, /public_cover_image_position_y: location\.coverImagePresentation\.positionY/);
  assert.ok(save.indexOf("if (coverError) throw coverError") < save.indexOf('setStatus("Branding gespeichert.")'));
});

test("Smart Media Änderungen besitzen im Branding-Formular eine einzige Parent-State-Quelle", () => {
  assert.match(settingsPage, /onPresentationChange=\{\(coverImagePresentation\) => setPartnerLocation/);
  assert.match(settingsPage, /presentation=\{partnerLocation\.coverImagePresentation\}/);
  assert.match(smartEditor, /onPresentationChange\(normalizedNext\)/);
});

test("andere Medienmodule speichern neue Datei und Ausschnitt weiterhin im selben Final-Save", () => {
  assert.match(offersPage, /if \(photoFile\)[\s\S]*uploadOwnerRewardImage[\s\S]*saveRestaurantOffer\([\s\S]*imageZoom: form\.imageCrop\.zoom/);
  assert.match(rewardsPage, /if \(photoFile\)[\s\S]*uploadOwnerRewardImage[\s\S]*saveRewardOffer\([\s\S]*image_zoom: photoCrop\.zoom/);
  assert.match(welcomePage, /photoFile \? await uploadOwnerRewardImage[\s\S]*saveRewardOffer\([\s\S]*image_zoom: editing\.imageCrop\.zoom/);
  assert.match(welcomePage, /birthday_pool_enabled: editing\.birthdayPoolEnabled/);
});
