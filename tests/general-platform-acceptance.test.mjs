import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const sql = readFileSync(new URL('../supabase/migrations/20261009154128_general_platform_customer_acceptance.sql', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../src/modules/customer/CustomerPlatformTermsPage.tsx', import.meta.url), 'utf8');
test('one atomic migration; no synthetic approval seed or receipt backfill', () => {
  assert.match(sql, /begin;[\s\S]*commit;\s*$/);
  assert.doesNotMatch(sql, /update\s+public\.platform_customer_terms_receipts|disable trigger|set_replication_role|TEST_ONLY_LOCAL/i);
  assert.equal((sql.match(/insert into public\.platform_legal_document_versions/g) ?? []).length, 1);
});
test('publication requires existing admin AAL2 guard, explicit approval, CAS and append-only events', () => {
  assert.equal((sql.match(/perform public\.require_legal_bundle_admin_internal\(\)/g) ?? []).length, 3);
  assert.match(sql, /input_external_approval_confirmed is distinct from true/);
  assert.match(sql, /request_payload is distinct from payload/);
  assert.match(sql, /PLATFORM_TERMS_PUBLICATION_STALE/);
  assert.match(sql, /before update or delete or truncate/);
});
test('general authority uses only latest event and exact document identity/hash', () => {
  assert.match(sql, /e\.event_sequence=\(select max\(event_sequence\)/);
  assert.match(sql, /e\.action='PUBLISH' and d\.document_type='platform_terms'/);
  assert.match(sql, /d\.content_sha256=encode\(extensions\.digest/);
  assert.match(sql, /r\.real_document_id=\(doc->>'document_id'\)::uuid and r\.test_document_id is null/);
});
test('receipt identity, real session, version, provider and hash stay authoritative', () => {
  assert.match(sql, /perform public\.customer_verified_session_id\(\)/);
  assert.match(sql, /r\.document_version=doc->>'version' and r\.document_sha256=doc->>'sha256'/);
  assert.match(sql, /r\.provider_snapshot=doc->>'provider_snapshot'/);
  assert.match(sql, /request_row\.auth_user_id<>auth\.uid\(\)/);
});
test('parallel repeated requests share one general decision without changing TEST_ONLY records', () => {
  assert.match(sql, /on public\.platform_customer_terms_receipts\(auth_user_id,real_document_id\)\s+where real_document_id is not null/);
  assert.match(sql, /'platform-terms-request:'/);
  assert.match(sql, /'platform-terms-acceptance:'/);
  assert.match(sql, /create table public\.platform_terms_acceptance_requests/);
});
test('existing TEST_ONLY callers choose explicit status and stay tenant-bound', () => {
  assert.match(sql, /join_customer_account_test_only_at_legal\(text,uuid,boolean,boolean,text,text,uuid\)/);
  assert.match(sql, /PLATFORM_TERMS_TEST_CALLER_SHAPE_CHANGED/);
  assert.match(sql, /restaurant_id=input_restaurant_id and test_session_id=document->>'test_session_id'/);
  assert.match(sql, /PLATFORM_TERMS_TEST_TENANT_DENIED/);
});
test('ordinary merchant wrappers retain their independent bundle gate', () => {
  const wrappers = readFileSync(new URL('../supabase/migrations/20261005170126_platform_terms_join_entrypoint_guards.sql', import.meta.url), 'utf8');
  assert.equal((wrappers.match(/perform public\.require_platform_terms_for_join_internal\(restaurant_id_value\)/g) ?? []).length, 4);
  assert.equal((wrappers.match(/perform public\.require_current_at_legal_bundle_internal\(restaurant_id_value,input_bundle_id\)/g) ?? []).length, 4);
  assert.doesNotMatch(sql, /create or replace function public\.(?:resolve_restaurant_entitlements|restaurant_registration_readiness|require_current_at_legal_bundle)/);
});
test('new tables have RLS and no runtime DML; functions have owner and explicit ACL', () => {
  for (const table of ['platform_terms_publication_events', 'platform_terms_acceptance_requests']) {
    assert.ok(sql.includes(`alter table public.${table} enable row level security`));
    assert.ok(sql.includes(`revoke all on public.${table} from public,anon,authenticated,service_role`));
  }
  assert.match(sql, /alter function %s owner to postgres/);
  assert.match(sql, /revoke all on function %s from public,anon,authenticated,service_role/);
});
test('customer explicitly selects TEST_ONLY status; displayed exact hash is not inferred', () => {
  assert.match(ui, /testScope \? "get_platform_customer_test_terms_status" : "get_platform_customer_terms_status"/);
  assert.match(ui, /SHA-256: \{status.document.sha256\}/);
  assert.match(ui, /<article data-i18n-skip="true" className="central-auth-legal-document"/);
  assert.match(ui, /receipt.document_id === document.document_id && receipt.sha256 === document.sha256/);
});
