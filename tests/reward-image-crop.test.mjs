import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const cropSource = readFileSync(new URL("../src/shared/mediaPresentation.ts", import.meta.url), "utf8");
const cropJavaScript = ts.transpileModule(cropSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const crop = await import(`data:text/javascript;base64,${Buffer.from(cropJavaScript).toString("base64")}`);

const frame = readFileSync(new URL("../src/shared/components/RewardImageFrame.tsx", import.meta.url), "utf8");
const frameStyles = readFileSync(new URL("../src/shared/components/smart-media.css", import.meta.url), "utf8");
const smartEditor = readFileSync(new URL("../src/shared/components/SmartMediaEditor.tsx", import.meta.url), "utf8");
const editor = readFileSync(new URL("../src/modules/admin/components/OwnerRewardImageEditor.tsx", import.meta.url), "utf8");
const rewardsPage = readFileSync(new URL("../src/modules/admin/pages/RewardsPage.tsx", import.meta.url), "utf8");
const welcomePage = readFileSync(new URL("../src/modules/admin/pages/WelcomeGiftsPage.tsx", import.meta.url), "utf8");
const customerUi = readFileSync(new URL("../src/modules/customer/components/PremiumCustomerUi.tsx", import.meta.url), "utf8");
const rewardService = readFileSync(new URL("../src/modules/rewards/rewardService.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/20260726002000_reward_image_crop_metadata.sql", import.meta.url), "utf8");

test("alte Bilder erhalten einen stabilen zentrierten Default-Ausschnitt", () => {
  assert.deepEqual(crop.mediaPresentationFromRecord(null), { zoom: 1, positionX: 0.5, positionY: 0.5 });
  assert.deepEqual(crop.normalizeMediaPresentation({ zoom: 99, positionX: -2, positionY: 3 }), { zoom: 4, positionX: 0, positionY: 1 });
  assert.equal(crop.normalizeMediaPresentation({ zoom: 0 }).zoom, 0.1);
});

test("Einpassen berechnet das Mindestzoom aus dem echten Bildformat", () => {
  assert.equal(crop.calculateMediaFitZoom(1600, 900), 1);
  assert.equal(crop.calculateMediaFitZoom(1000, 1000), 0.5625);
  assert.equal(crop.calculateMediaFitZoom(900, 1600), 0.31640625);
  assert.equal(crop.calculateMediaCoverScale(1000, 1000), 16 / 9);
});

test("responsive Crop-Werte bleiben normalisiert und pixelunabhängig", () => {
  const saved = crop.normalizeMediaPresentation({ zoom: 1.35, positionX: 0.42, positionY: 0.58 });
  assert.deepEqual(saved, { zoom: 1.35, positionX: 0.42, positionY: 0.58 });
  assert.match(frameStyles, /aspect-ratio: var\(--smart-media-aspect-ratio/);
  assert.match(frameStyles, /object-position: var\(--smart-media-position-x/);
  assert.match(frameStyles, /object-fit: contain/);
  assert.match(frameStyles, /transform: scale\(var\(--smart-media-render-scale/);
});

test("Owner und Kundenportal verwenden dieselbe RewardImageFrame-Darstellung", () => {
  assert.match(rewardsPage, /RewardImageFrame/);
  assert.match(welcomePage, /RewardImageFrame/);
  assert.match(customerUi, /RewardImageFrame/);
  assert.match(frame, /SmartMediaFrame/);
});

test("Editor unterstützt Zoom, Drag, Pinch, Trackpad, Tastatur und getrennten Reset", () => {
  assert.match(editor, /SmartMediaEditor/);
  assert.match(smartEditor, /onPointerDown/);
  assert.match(smartEditor, /pointersRef/);
  assert.match(smartEditor, /pointerDistance/);
  assert.match(smartEditor, /onWheel/);
  assert.match(smartEditor, /ArrowLeft/);
  assert.match(smartEditor, /ArrowRight/);
  assert.match(smartEditor, /ArrowUp/);
  assert.match(smartEditor, /ArrowDown/);
  assert.match(smartEditor, /Zurücksetzen/);
  assert.match(editor, /Anderes Foto wählen/);
  assert.match(smartEditor, /Automatisch einpassen/);
  assert.match(smartEditor, /calculateMediaFitZoom/);
  assert.match(smartEditor, /savedState/);
  assert.match(smartEditor, /autoFitImageRef/);
  assert.match(frameStyles, /touch-action: none/);
});

test("Crop und Bild-URL werden gemeinsam tenantgebunden gespeichert", () => {
  const imageUpdate = rewardService.match(/export async function setRewardOfferImage[\s\S]*?return toRewardOffer/)[0];
  for (const field of ["image_url", "image_zoom", "image_position_x", "image_position_y", "image_aspect_ratio", "image_crop_version"]) {
    assert.match(imageUpdate, new RegExp(field));
  }
  assert.match(imageUpdate, /\.eq\("restaurant_id", offer\.restaurant_id\)/);
  assert.match(imageUpdate, /\.eq\("is_starter_reward", offer\.is_starter_reward\)/);
});

test("Migration ist additiv, validiert Werte und lockert RLS nicht", () => {
  assert.match(migration, /alter table public\.rewards[\s\S]*add column if not exists image_zoom/);
  assert.match(migration, /image_zoom between 0\.1 and 4/);
  assert.match(migration, /image_position_x between 0 and 1/);
  assert.match(migration, /image_position_y between 0 and 1/);
  assert.match(migration, /'image_zoom', offers\.image_zoom/);
  assert.doesNotMatch(migration, /disable row level security|drop policy|grant select on public\.rewards/i);
});

test("Abbrechen behält den gespeicherten Stand und Uploadfehler räumt neue Datei auf", () => {
  for (const page of [rewardsPage, welcomePage]) {
    assert.match(page, /if \(uploadedObjectPath\) await removeOwnerRewardImageUpload/);
    assert.match(page, /Das bisherige Bild bleibt erhalten/);
  }
  assert.match(rewardsPage, /onClick=\{closeQuickPhoto\}[\s\S]{0,80}>Abbrechen/);
  assert.match(welcomePage, /onClick=\{closeQuickPhoto\}[\s\S]{0,80}>Abbrechen/);
});

test("fehlende Crop-Migration wird im Drawer sicher und ohne Wiederholungsrequest behandelt", () => {
  assert.match(rewardService, /RewardImageCropMigrationRequiredError/);
  for (const page of [rewardsPage, welcomePage]) {
    assert.match(page, /Der Bildausschnitt konnte noch nicht gespeichert werden\. Bitte versuche es später erneut\./);
    assert.match(page, /quickPhotoSaving \|\| quickPhotoUnavailable/);
    assert.match(page, /role="alert"/);
  }
});
