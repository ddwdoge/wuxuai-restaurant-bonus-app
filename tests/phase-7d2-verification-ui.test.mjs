import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const admin=read('src/modules/verification/PlatformBusinessVerificationPage.tsx');
const owner=read('src/modules/verification/OwnerBusinessVerificationPage.tsx');
const service=read('src/modules/verification/businessVerificationService.ts');
const migration=read('supabase/migrations/20260924005000_country_first_business_verification_submission.sql');
const foundation=read('supabase/migrations/20260924004000_business_verification_foundation.sql');

test('admin controls derive from server read model and use only locked migration-169 mutator',()=>{
  assert.match(admin,/detail\.allowed_actions\.map/);
  assert.match(admin,/detail\.allowed_actions\.includes\(action\)/);
  assert.match(admin,/manageVerification\(/);
  assert.match(service,/\.rpc\("manage_business_verification"/);
  assert.doesNotMatch(migration,/create or replace function public\.manage_business_verification/);
  assert.match(foundation,/perform public\.require_recent_platform_auth_internal\(\)/);
  assert.match(foundation,/BUSINESS_VERIFICATION_CONFIRMATION_REQUIRED/);
  assert.match(foundation,/BUSINESS_VERIFICATION_IDEMPOTENCY_CONFLICT/);
  assert.match(admin,/readVerificationAdminDetail\(detail\.case_id\)/);
  assert.match(admin,/readVerificationQueue\(\)/);
  assert.match(admin,/ids\.current \?\?= \{ requestId: crypto\.randomUUID\(\), correlationId: crypto\.randomUUID\(\) \}/);
});

test('all six authorized actions and seven locale labels are present, real approval absent',()=>{
  for(const action of ['START_REVIEW','REJECT','SUSPEND','CORRECT_PROFILE','GRANT_TEST','REVOKE_TEST']) {
    assert.match(admin,new RegExp(action));
    assert.match(foundation,new RegExp("'"+action+"'"));
  }
  for(const locale of ['de','en','fr','it','es','zh','ko']) {
    assert.match(admin,new RegExp('  '+locale+': \\{ country:'));
    assert.match(owner,new RegExp('  '+locale+': \\{ title:'));
  }
  assert.doesNotMatch(admin,/APPROVE_REAL|VERIFY_REAL|confirm_real_business_verification/);
  assert.match(migration,/test_only,created_by/);
  assert.match(migration,/platform_test_tenant_registry/);
  assert.match(migration,/business_verification_owner_submissions/);
});

test('owner submission is pending-only and live gates remain untouched',()=>{
  assert.match(migration,/BUSINESS_VERIFICATION_PENDING_REQUIRED/);
  assert.match(migration,/public\.require_launch_country/);
  assert.match(migration,/public\.country_launch_readiness_snapshot/);
  assert.match(migration,/BUSINESS_VERIFICATION_OWNER_REQUIRED/);
  assert.match(migration,/BUSINESS_VERIFICATION_CASE_ALREADY_REVIEWED/);
  assert.match(migration,/get_business_verification_owner_status/);
  assert.match(owner,/ownerStatus\.submission_allowed/);
  assert.match(owner,/ownerStatus\?\.rejection_reason/);
  assert.doesNotMatch(migration,/stripe|trial_started_at|entitlement/i);
});
