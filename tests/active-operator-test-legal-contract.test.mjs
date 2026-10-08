import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const sql = readFileSync(new URL('../supabase/migrations/20261008203125_active_operator_test_legal_revision.sql', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/app/App.tsx', import.meta.url), 'utf8');
const customer = readFileSync(new URL('../src/modules/customer/CustomerActiveOperatorLegalTestPage.tsx', import.meta.url), 'utf8');

test('active operator TEST_ONLY path does not replace real Legal or pending join contracts', () => {
  assert.doesNotMatch(sql, /create\s+or\s+replace\s+function\s+public\./i);
  assert.doesNotMatch(sql, /update\s+public\.(?:country_kyb_intake_policies|restaurants|branch_subscriptions|legal_document_versions)/i);
  assert.match(sql, /policy\.real_intake_status is distinct from 'BLOCKED'/);
  assert.match(sql, /environment_value is distinct from 'STAGING'/);
  assert.match(sql, /operator_review_current_internal\(r\.id,'KYB'/);
});

test('private append-only evidence and explicit RPC-only access', () => {
  assert.match(sql, /alter table public\.active_operator_test_legal_events enable row level security/);
  assert.match(sql, /alter table public\.active_operator_test_legal_consents enable row level security/);
  assert.match(sql, /revoke all on public\.active_operator_test_legal_events,[\s\S]*?from public,anon,authenticated,service_role/);
  assert.match(sql, /protect_legal_bundle_append_only\(\)/);
  assert.match(sql, /revoke all on function public\.require_active_operator_test_legal_customer_internal\(uuid,uuid\)/);
  assert.match(sql, /grant execute on function public\.get_customer_active_operator_test_legal\(text,uuid\) to authenticated/);
  assert.match(sql, /grant execute on function public\.accept_customer_active_operator_test_legal\(text,uuid,text,text,bigint,boolean,boolean,uuid\)/);
});

test('publication, read and consent all recheck exact material revision and hashes', () => {
  assert.match(sql, /p\.material_revision is distinct from revision_value/);
  assert.match(sql, /publication\.material_revision is distinct from \(context_value->>'material_revision'\)::bigint/);
  assert.match(sql, /publication\.bundle_hash is distinct from public\.at_legal_synthetic_manifest_hash_internal\(publication\.manifest\)/);
  assert.match(sql, /input_manifest->>'material_revision' is distinct from context_value->>'material_revision'/);
  assert.match(sql, /ACTIVE_OPERATOR_TEST_LEGAL_VERSION_REUSED/);
  assert.match(sql, /input_terms_accepted is distinct from true/);
  assert.match(sql, /input_privacy_acknowledged is distinct from true/);
  assert.match(sql, /or publication\.material_revision is distinct from input_material_revision/);
});

test('Customer page is isolated and obtains a fresh readback after consent', () => {
  assert.match(app, /\/customer\/test-only-operator-legal\/:slug\/:branchId/);
  assert.match(customer, /get_customer_active_operator_test_legal/);
  assert.match(customer, /accept_customer_active_operator_test_legal/);
  assert.match(customer, /await load\(\);/);
  assert.match(customer, /VITE_PLATFORM_TEST_CONTROL_ENABLED/);
});
