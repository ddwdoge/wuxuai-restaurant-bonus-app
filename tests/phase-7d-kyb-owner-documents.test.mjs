import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const page = read("src/modules/verification/OwnerBusinessVerificationPage.tsx");
const service = read("src/modules/verification/businessVerificationService.ts");
const styles = read("src/modules/verification/owner-business-verification.css");
const migration = read("supabase/migrations/20260926002000_austrian_kyb_secure_documents.sql");

test("owner document client uses only the six server-approved document types", () => {
  for (const type of [
    "GISA_EXTRACT",
    "COMPANY_REGISTER_EXTRACT",
    "TRADE_LICENSE",
    "TAX_REGISTRATION",
    "REPRESENTATIVE_ID",
    "POWER_OF_ATTORNEY",
  ]) {
    assert.match(service, new RegExp(`"${type}"`));
    assert.match(migration, new RegExp(`'${type}'`));
  }
  assert.match(service, /application\/pdf.*image\/jpeg.*image\/png/);
  assert.match(service, /10 \* 1024 \* 1024/);
  assert.match(page, /accept="application\/pdf,image\/jpeg,image\/png"/);
});

test("upload follows reserve, immutable private upload, hash, and completion", () => {
  const reserve = service.indexOf('"reserve_business_verification_document_upload"');
  const upload = service.indexOf(".upload(", reserve);
  const digest = service.indexOf("await sha256(input.file)", upload);
  const complete = service.indexOf('"complete_business_verification_document_upload"', upload);
  assert.ok(reserve >= 0 && upload > reserve && digest > upload && complete > upload);
  assert.match(service, /reserved\.bucket !== KYB_BUCKET/);
  assert.match(service, /upsert: false/);
  assert.doesNotMatch(service, /createSignedUrl|getPublicUrl|console\.(?:log|debug|info|warn|error)/);
});

test("owner page lists proven status and never infers approval or activation", () => {
  assert.match(page, /listOwnerKybDocuments\(restaurantId\)/);
  assert.match(page, /document\.status/);
  assert.match(page, /ownerStatus\?\.submitted_at/);
  assert.match(page, /Ein Upload ist noch keine Freigabe/);
  assert.doesNotMatch(page, /confirm_real_business_verification|activation_status|trial_started_at|entitlement|stripe|grant/i);
  assert.match(service, /get_business_verification_document_object/);
  assert.match(service, /\.download\(descriptor\.object_name\)/);
  assert.doesNotMatch(page, /loadRestaurantLegalSetup|get_restaurant_legal_setup/);
});

test("replacement remains versioned and all seven locales explain the secure flow", () => {
  assert.match(page, /selectedTypeHasUploadedVersion/);
  assert.match(page, /documentsText\.replace/);
  assert.match(migration, /replaces_document_id/);
  assert.match(migration, /'SUPERSEDED'/);
  for (const locale of ["de", "en", "fr", "it", "es", "zh", "ko"]) {
    assert.match(page, new RegExp(`  ${locale}: \\{ heading:`));
  }
});

test("document controls are scoped, responsive, and preserve 44px targets", () => {
  assert.match(styles, /\.kyb-document-section/);
  assert.match(styles, /min-(?:block-size|height):\s*44px/);
  assert.match(styles, /max-width:\s*100%/);
  assert.doesNotMatch(styles, /(^|\n)\s*(?:input|select|button)\s*\{/);
});
