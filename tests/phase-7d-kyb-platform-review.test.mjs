import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20260926004000_platform_admin_kyb_document_review.sql");
const page = read("src/modules/verification/PlatformBusinessVerificationPage.tsx");
const service = read("src/modules/verification/businessVerificationService.ts");

test("every Platform KYB read and object resolution requires the explicit live TOTP/AAL2 reviewer predicate", () => {
  assert.match(migration, /platform_kyb_reviewer_internal/);
  assert.match(migration, /platform_totp_aal2_verified_internal\(\)/);
  assert.match(migration, /current_platform_role\(\) in \('platform_owner', 'platform_admin'\)/);
  for (const name of [
    "list_platform_kyb_review_queue",
    "get_platform_kyb_review_detail",
    "get_platform_kyb_document_object",
  ]) {
    assert.match(migration, new RegExp(`create or replace function public\\.${name}`));
    assert.match(migration, new RegExp(`revoke all on function public\\.${name}`));
  }
  assert.match(migration, /PLATFORM_KYB_AAL2_REQUIRED/);
});

test("private Storage independently rechecks the same document and AAL2 authorization", () => {
  assert.match(migration, /create or replace function public\.business_verification_storage_read_allowed_internal/);
  assert.match(migration, /business_verification_document_access_internal\(document\.id, input_actor_id\)/);
  assert.match(migration, /drop policy if exists "business verification document authorized read"/);
  assert.match(migration, /create policy "business verification document authorized read"[\s\S]*for select[\s\S]*business_verification_storage_read_allowed_internal/);
  assert.doesNotMatch(migration, /storage\.objects for (insert|update|delete)/i);
});

test("review UI exposes only evidenced states, versions and audit metadata", () => {
  assert.match(page, /readPlatformKybReviewQueue/);
  assert.match(page, /readPlatformKybReviewDetail/);
  assert.match(page, /openPlatformKybDocument/);
  assert.match(page, /Vorhandene Uploads belegen weder Vollständigkeit noch Freigabefähigkeit/);
  assert.match(page, /document\.version/);
  assert.match(page, /document_events/);
  assert.doesNotMatch(page, /confirm_real_business_verification|APPROVE_REAL|VERIFY_REAL/);
  assert.doesNotMatch(page, /content_hash/);
});

test("document opening uses the dedicated AAL2 RPC and private bucket download", () => {
  assert.match(service, /\.rpc\(\s*"get_platform_kyb_document_object"/);
  assert.match(service, /descriptor\.bucket !== KYB_BUCKET/);
  assert.match(service, /storage\.from\(KYB_BUCKET\)\.download\(descriptor\.object_name\)/);
  assert.doesNotMatch(service, /createSignedUrl|createSignedUrls|getPublicUrl/);
});

test("migration is read-only for business state", () => {
  assert.doesNotMatch(migration, /update\s+public\.(restaurants|branch_subscriptions|business_verification_cases)/i);
  assert.doesNotMatch(migration, /insert\s+into\s+public\.(business_verification_decisions|branch_entitlements|branch_subscriptions)/i);
  assert.doesNotMatch(migration, /create or replace function public\.(confirm_real_business_verification|manage_business_verification)/i);
});
