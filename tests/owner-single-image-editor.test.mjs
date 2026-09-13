import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { GENERATED_MESSAGES, GENERATED_SOURCE_TO_KEY } from "../src/shared/i18n/messages.generated.mjs";
import { translateStructural } from "../src/shared/i18n/catalog.mjs";

const read = p => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const require = createRequire(import.meta.url);
const page = read("src/modules/admin/pages/RewardsPage.tsx");
function compile(source, dependencies = {}) {
  const exports = {};
  const js = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function("require", "exports", js)(id => dependencies[id] ?? require(id), exports);
  return exports;
}
const service = compile(read("src/modules/admin/services/ownerRewardImageService.ts"), { "../../../shared/lib/supabase": { supabase: null } });
const editor = compile(read("src/modules/admin/components/OwnerRewardImageEditor.tsx"), {
  "../services/ownerRewardImageService": service,
  "../../../shared/components/SmartMediaEditor": { SmartMediaEditor: p => React.createElement("img", { src: p.imageUrl, alt: p.label, "data-crop": JSON.stringify(p.presentation) }) },
}).OwnerRewardImageEditor;
const uploader = compile(read("src/modules/admin/components/OwnerRewardImageUploader.tsx"), {
  "../services/ownerRewardImageService": service,
  "../../../shared/components/RewardImageFrame": { RewardImageFrame: p => React.createElement("img", { src: p.imageUrl, alt: p.alt }) },
}).OwnerRewardImageUploader;
const step = page.slice(page.indexOf('{step === 4 ? (') + '{step === 4 ? ('.length, page.indexOf('{step === 5 ? (')).replace(/\) : null\}\s*$/, "");
const PhotoStep = compile(`import { OwnerRewardImageEditor, OwnerRewardImageUploader } from "components";
export function PhotoStep({ photoPreview, photoCrop, saving=false, photoFile=null, photoError=null }) {
 const rewardTitle="Individueller Restauranttitel"; const SelectedIcon=()=>null;
 const setPhotoCrop=()=>{}; const handlePhoto=()=>{};
 const translateKey=()=>"Bild ändern";
 return (${step});
}`, { components: { OwnerRewardImageEditor: editor, OwnerRewardImageUploader: uploader } }).PhotoStep;

for (const [name, photoPreview] of [["leer", null], ["neues Bild", "blob:local-fixture"], ["gespeichertes Bild", "/fixture-only.jpg"]]) {
  test(`${name}: genau eine Bildfläche im tatsächlichen Schritt-4-JSX`, () => {
    const crop = { zoom: 1.35, positionX: 0.42, positionY: 0.58 };
    const html = renderToStaticMarkup(React.createElement(PhotoStep, { photoPreview, photoCrop: crop }));
    assert.equal((html.match(/type="file"/g) ?? []).length, 1);
    assert.equal((html.match(/<img\b/g) ?? []).length, photoPreview ? 1 : 0);
    if (photoPreview) {
      assert.doesNotMatch(html, /owner-reward-image-trigger/);
      assert.match(html, /Bild ändern/);
      assert.ok(html.includes("1.35") && html.includes("0.42") && html.includes("0.58"));
    } else {
      assert.equal((html.match(/class="owner-reward-image-trigger/g) ?? []).length, 1);
      assert.match(html, /aria-label="Produktfoto hinzufügen"/);
      assert.doesNotMatch(html, /owner-reward-image-editor/);
    }
  });
}
test("andere Aufrufer behalten die bisherigen Labels und Remove-Aktion", () => {
  const html = renderToStaticMarkup(React.createElement(editor, { crop: {}, imageUrl: "/fixture.jpg", label: "Test", onCropChange(){}, onFileSelected(){} }));
  assert.match(html, /Anderes Foto wählen/);
  const other = renderToStaticMarkup(React.createElement(uploader, { imageUrl: "/fixture.jpg", label: "Test", onFileSelected(){}, onRemove(){} }));
  assert.match(other, /Foto für Test entfernen/);
  assert.match(other, /Foto ändern/);
});
test("Wizard behält Auswahl, gespeicherten Crop, Upload und Abbruchgrenzen", () => {
  assert.doesNotMatch(page, /photoCropEditing|setPhotoCropEditing/);
  assert.match(page, /setPhotoPreview\(offer.image_url\)/);
  assert.match(page, /setPhotoCrop\(rewardImageCropFromRecord\(offer\)\)/);
  assert.match(page, /function closeRewardEditor\(\) \{\s+setEditorOpen\(false\);\s+resetWizard\(\)/);
  assert.match(page, /function handlePhoto\(file: File\) \{\s+setPhotoPreview\(URL.createObjectURL\(file\)\);\s+setPhotoFile\(file\);\s+setPhotoCrop\(DEFAULT_REWARD_IMAGE_CROP\)/);
  assert.match(page, /async function saveReward\(\)[\s\S]*if \(photoFile\) \{\s+const upload = await uploadOwnerRewardImage/);
  assert.match(page, /image_zoom: photoCrop.zoom,\s+image_position_x: photoCrop.positionX,\s+image_position_y: photoCrop.positionY/);
});
test("Dateitypen und 5-MB-Grenze bleiben unverändert", () => {
  for (const type of ["image/jpeg", "image/png", "image/webp"]) assert.equal(service.validateOwnerRewardImage({ type, size: 5 * 1024 * 1024 }), null);
  assert.ok(service.validateOwnerRewardImage({ type: "image/png", size: 5 * 1024 * 1024 + 1 }));
  assert.ok(service.validateOwnerRewardImage({ type: "image/svg+xml", size: 1 }));
});
for (const language of ["de", "en", "fr", "it", "es", "zh", "ko"]) test(`${language}: beide Bildaktionen vollständig übersetzt`, () => {
  assert.notEqual(translateStructural("owner.rewardImage.change", language), "owner.rewardImage.change");
  for (const source of ["Produktfoto hinzufügen"]) {
    const message = GENERATED_MESSAGES[language][GENERATED_SOURCE_TO_KEY[source]];
    assert.ok(message?.trim());
    if (language !== "de") assert.notEqual(message, source);
  }
});
