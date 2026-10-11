import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL(
  "../supabase/migrations/20261011164421_test_only_kyb_review_contract.sql",
  import.meta.url,
), "utf8");
const decision = migration.match(
  /create function public\.decide_platform_test_only_kyb_review\([\s\S]+?\n\$function\$;/,
)?.[0] ?? "";
const snapshot = migration.match(
  /create function public\.test_only_kyb_review_snapshot_internal\([\s\S]+?\n\$function\$;/,
)?.[0] ?? "";
const current = migration.match(
  /create function public\.test_only_kyb_review_current_internal\([\s\S]+?\n\$function\$;/,
)?.[0] ?? "";

test("synthetic review is isolated from every real KYB and shared readiness writer", () => {
  assert.ok(decision);
  assert.doesNotMatch(migration, /create or replace function public\.resolve_business_verification_readiness_internal/i);
  assert.doesNotMatch(migration, /create or replace function public\.decide_platform_operator_review/i);
  assert.doesNotMatch(migration, /(?:insert into|update|delete from) public\.(?:business_verification_cases|business_verified_profile_revisions|business_verification_test_receipts|platform_operator_review_events|legal_operator_publication_decisions|branch_subscriptions|restaurants|commercial_pro_access_grants|basic_test_checkout_requests|customer_transactional_email_deliveries|customer_offer_email_confirmation_outbox)/i);
  assert.doesNotMatch(decision, /\bVERIFIED\b|trial_started_at\s*=|stripe_|checkout|mail/i);
  assert.match(migration, /real_kyb_verified', false/);
  assert.match(migration, /not consumed by real KYB, legal, activation, trial, PRO, checkout or mail gates/);
});

test("snapshot is exact-project, pending-only, marker-bound and frozen around exactly two current documents", () => {
  assert.match(snapshot, /project_ref' = 'mbgveqbhessaunrhfudm'/);
  assert.match(snapshot, /auth_issuer' = 'https:\/\/mbgveqbhessaunrhfudm\.supabase\.co\/auth\/v1'/);
  assert.match(snapshot, /app_origin' = 'https:\/\/staging-v2\.bonus\.wuxuaisbi\.com'/);
  assert.match(snapshot, /c\.status = 'PENDING_ACTIVATION'/);
  assert.match(snapshot, /c\.test_only/);
  assert.match(snapshot, /marker\.restaurant_name = r\.name/);
  assert.match(snapshot, /documents\.document_count = 2/);
  assert.match(snapshot, /documents\.gisa_count = 1/);
  assert.match(snapshot, /documents\.trade_license_count = 1/);
  assert.match(snapshot, /d\.status = 'UPLOADED'/);
  assert.match(snapshot, /newer\.version > d\.version/);
  assert.match(snapshot, /pending\.status = 'PENDING_UPLOAD'/);
  assert.match(snapshot, /'id', d\.id[\s\S]*'type', d\.document_type[\s\S]*'version', d\.version[\s\S]*'sha256', d\.content_sha256/);
  assert.match(snapshot, /real_intake_status[\s\S]*= 'BLOCKED'/);
  assert.match(snapshot, /file_size_limit[\s\S]*= 1/);
  assert.match(snapshot, /subscription\.trial_started_at is null/);
  assert.match(snapshot, /subscription\.stripe_subscription_id is null/);
});

test("both decisions require a live bound session and fresh AAL2 TOTP before and after locking", () => {
  assert.equal((decision.match(/project_bootstrap\.require_runtime_binding\(true\)/g) ?? []).length, 2);
  assert.equal((decision.match(/require_legal_bundle_admin_internal\(\)/g) ?? []).length, 2);
  assert.match(decision, /auth\.jwt\(\)->'amr'/);
  assert.match(decision, /method->>'method' = 'totp'/);
  assert.match(decision, /'aal', 'aal2'/);
  assert.match(decision, /'session_sha256'/);
  assert.doesNotMatch(decision, /auth\.jwt\(\)->>'session_id'[^\n]+result|session_id', auth\.jwt/i);
});

test("revision, IDs, versions and hashes stay identical across two different reviewers", () => {
  assert.match(decision, /snapshot_value->'documents' is distinct from input_documents/);
  assert.match(decision, /material_revision is distinct from input_expected_material_revision/);
  assert.match(decision, /previous\.actor_id = auth\.uid\(\)/);
  assert.match(decision, /previous\.document_manifest is distinct from input_documents/);
  assert.match(decision, /previous\.snapshot is distinct from snapshot_value/);
  assert.match(decision, /previous\.snapshot_sha256 is distinct from snapshot_sha256_value/);
  assert.match(current, /first_review\.actor_id <> approval\.actor_id/);
  assert.match(current, /first_review\.document_manifest = approval\.document_manifest/);
});

test("request replay, source races and atomic audit are fail-closed", () => {
  const requestLock = decision.indexOf("test-only-kyb-review-request:");
  const restaurantLock = decision.indexOf("for update nowait");
  const sourceLock = decision.indexOf("lock table public.organizations");
  const snapshotRead = decision.indexOf("snapshot_value := public.test_only_kyb_review_snapshot_internal");
  assert.ok(requestLock >= 0 && restaurantLock > requestLock && sourceLock > restaurantLock && snapshotRead > sourceLock);
  assert.match(decision, /TEST_ONLY_KYB_REVIEW_REPLAY_CONFLICT/);
  assert.match(decision, /TEST_ONLY_KYB_REVIEW_STALE/);
  assert.match(decision, /TEST_ONLY_KYB_REVIEW_STALE'[\s\S]*?errcode = 'P0001'/);
  assert.doesNotMatch(decision, /TEST_ONLY_KYB_REVIEW_STALE'[\s\S]*?errcode = '40001'/);
  assert.match(decision, /insert into public\.test_only_kyb_review_receipts[\s\S]+insert into public\.test_only_kyb_review_audit/);
  assert.match(migration, /test_only_kyb_review_receipts_immutable/);
  assert.match(migration, /test_only_kyb_review_audit_immutable/);
  assert.match(migration, /receipt_sha256 text not null/);
});

test("tables stay private while only the two narrow RPCs are exposed", () => {
  assert.match(migration, /alter table public\.test_only_kyb_review_receipts enable row level security/);
  assert.match(migration, /alter table public\.test_only_kyb_review_audit enable row level security/);
  assert.match(migration, /revoke all on public\.test_only_kyb_review_receipts,[\s\S]+from public, anon, authenticated, service_role/);
  assert.match(migration, /grant execute on function public\.get_platform_test_only_kyb_review\(uuid\) to authenticated/);
  assert.match(migration, /grant execute on function public\.decide_platform_test_only_kyb_review\([\s\S]+?\) to authenticated/);
  assert.doesNotMatch(migration, /grant (?:select|insert|update|delete|truncate) on/i);
  assert.doesNotMatch(migration, /create policy/i);
});
