import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const sql = readFileSync(new URL('../supabase/migrations/20261008200324_active_operator_kyb_revision_publication.sql', import.meta.url), 'utf8');
test('one atomic candidate, not a partial resolver deployment', () => {
  assert.match(sql, /begin;[\s\S]*create table public.operator_material_revisions/);
  assert.match(sql, /create or replace function public.resolve_business_verification_readiness_internal/);
  assert.match(sql, /create or replace function public.legal_operator_publication_ready_internal/);
  assert.match(sql, /commit;\s*$/);
});
test('all material source tables, old and new bindings, serialized transactional epochs', () => {
  for (const table of ['restaurants','organizations','organization_legal_profiles','branches',
    'restaurant_members','business_verification_documents','business_verification_cases','business_verification_decisions',
    'business_verified_profile_revisions','operator_owner_change_drafts'])
    assert.ok(sql.includes(`'${table}'`));
  assert.match(sql, /order by r.id for update of r/);
  assert.match(sql, /coalesce\(max\(revision\),0\)\+1/);
  assert.match(sql, /before_material is not distinct from after_material/);
  assert.match(sql, /after insert or update or delete/);
  assert.doesNotMatch(sql, /nextval|setval|disable trigger|session_replication_role/);
});
test('source version cannot be satisfied by an old matching hash', () => {
  assert.match(sql, /e.material_revision is distinct from \(select max\(revision\)/);
  assert.match(sql, /first_review.material_revision is distinct from e.material_revision/);
  assert.match(sql, /previous.material_revision is distinct from \(s->>'material_revision'\)::bigint/);
  assert.match(sql, /foreign key\(restaurant_id,material_revision\)/);
});
test('no branding, hours or subscription data enters the revision projection', () => {
  const trigger=sql.slice(sql.indexOf('create function public.record_operator_material_revision_internal'),sql.indexOf('create table public.platform_operator_review_events'));
  assert.doesNotMatch(trigger,/logo|opening_hours|trial_end|subscription|termination/);
  assert.doesNotMatch(sql,/update public\.(subscriptions|restaurant_subscriptions|restaurants|country_kyb_intake_policies|platform_admins)/);
});
test('only an active pre-upgrade BASIC tenant can receive an immutable legacy seal', () => {
  assert.match(sql,/UPGRADE_BASELINE_UNREVIEWED/);
  assert.match(sql,/create table public.operator_legacy_upgrade_seals/);
  assert.match(sql,/where r.status='active' and b.status='active' and s.plan_key='BASIC'/);
  assert.match(sql,/s\.trial_started_at<=statement_timestamp\(\) and s\.trial_ends_at>statement_timestamp\(\)/);
  assert.match(sql,/join public\.manual_basic_trial_decisions m on m\.subscription_id=s\.id/);
  assert.match(sql,/m\.starts_at=s\.trial_started_at and m\.ends_at=s\.trial_ends_at/);
  assert.match(sql,/public\.legal_operator_publication_ready_internal\(r.id,statement_timestamp\(\)\)/);
  assert.match(sql,/public\.resolve_business_verification_readiness_internal\(r.id,'TEST'\)/);
  assert.match(sql,/input_as_of>=seal.sealed_at/);
  assert.match(sql,/max\(revision\) from public.operator_material_revisions where restaurant_id=r.id\)=1/);
  assert.match(sql,/not exists\(select 1 from public.platform_operator_review_events e where e.restaurant_id=r.id\)/);
  assert.match(sql,/operator_legacy_upgrade_seals_immutable/);
  assert.doesNotMatch(sql,/insert into public\.platform_operator_review_events[\s\S]*UPGRADE_BASELINE_UNREVIEWED/);
});
test('four eyes, real existing MFA predicate, separate legal authority', () => {
  assert.match(sql,/previous.actor_id=auth.uid\(\)/);
  assert.match(sql,/perform public.require_legal_bundle_admin_internal\(\)/);
  assert.match(sql,/operator_review_legal_sources_current_internal\(s\)/);
  assert.match(sql,/'kyb_receipt_id'/);
});
test('unreviewed owner transfer is blocked on active restaurants at the table boundary', () => {
  assert.match(sql,/create function public.guard_active_operator_transfer_internal\(\)/);
  assert.match(sql,/new\.role='owner'[\s\S]*r\.status='active' and r\.owner_id is distinct from new\.user_id/);
  assert.match(sql,/is distinct from \(new\.owner_id,new\.organization_id,new\.primary_branch_id\)/);
  assert.match(sql,/create trigger guard_active_owner_member before insert or update/);
  assert.match(sql,/create trigger guard_active_restaurant_owner before update of owner_id/);
  assert.match(sql,/create trigger guard_active_organization_owner before update of owner_id/);
  assert.match(sql,/create trigger guard_active_branch_material before update/);
  assert.match(sql,/create trigger guard_active_operator_profile before update/);
});
test('no Browser DML or internal execute; new tables use RLS', () => {
  for (const table of ['operator_material_revisions','operator_owner_change_drafts',
    'platform_operator_review_events','operator_publication_events','operator_publication_permits',
    'operator_legacy_upgrade_seals']) {
    assert.ok(sql.includes(`alter table public.${table} enable row level security`));
    assert.ok(sql.includes(`revoke all on public.${table} from public,anon,authenticated,service_role`));
  }
  assert.doesNotMatch(sql,/grant (?:all|insert|update|delete|select) /i);
  assert.equal((sql.match(/grant execute on function/g)||[]).length,5);
  assert.match(sql,/revoke all on function public.get_owner_operator_change_status\(uuid\)[\s\S]*grant execute on function public.get_owner_operator_change_status\(uuid\) to authenticated/);
  assert.match(sql,/r\.owner_id is distinct from auth\.uid\(\)[\s\S]*m\.role='owner'/);
  assert.match(sql,/published_id is null then[\s\S]*'request_id',latest\.request_id/);
});
test('active Owner draft is separate from reviewed publication and exact transaction permit', () => {
  assert.match(sql,/create function public.submit_owner_operator_change_draft/);
  assert.match(sql,/r\.status<>'active'/);
  assert.match(sql,/input_expected_revision/);
  assert.match(sql,/create function public.publish_reviewed_operator_change/);
  assert.match(sql,/operator_review_current_internal\(r\.id,'KYB'/);
  assert.match(sql,/permit\.transaction_id=txid_current\(\)/);
  assert.match(sql,/permit\.profile=to_jsonb\(new\)/);
  assert.match(sql,/delete from public.operator_publication_permits/);
  assert.match(sql,/operator_publication_events_immutable/);
});
test('unchanged live A survives pending B but publication cannot reuse old A approval', () => {
  assert.match(sql,/operator_legacy_live_during_draft_internal/);
  assert.match(sql,/operator_published_live_during_draft_internal/);
  assert.match(sql,/not exists\(select 1 from public.operator_publication_events x where x.restaurant_id=r.id\)/);
  assert.match(sql,/published_live_sha256=public.operator_live_material_sha256_internal/);
  assert.match(sql,/rev\.source_table='operator_owner_change_drafts' and rev\.source_id=draft\.id/);
});
test('actual document metadata, GISA and representation are versioned', () => {
  for(const field of ['storage_bucket','storage_object_name','mime_type','byte_size','gisa_number',
    'owner_is_authorized_representative','authorized_representative_role','commercial_register_applicable'])
    assert.ok(sql.includes(`'${field}'`));
});
