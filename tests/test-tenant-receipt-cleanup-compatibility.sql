-- LOCAL ONLY. Run after the full schema and 03000 in an isolated fixture DB.
-- Never run against Staging or Production. Synthetic evidence rolls back.
\set ON_ERROR_STOP on
begin;
do $test$
declare
  actor uuid := '7b4cffff-0000-4000-8000-000000000001';
  target_ref uuid := '7b4cffff-0000-4000-8000-000000000002';
  audit_ref uuid := '7b4cffff-0000-4000-8000-000000000003';
  request_ref uuid := '7b4cffff-0000-4000-8000-000000000004';
  before_row jsonb;
begin
  if current_database() not like 'wuxuai_7b4c_%'
    or current_setting('test.local_supabase_project', true) is distinct from 'wuxuai-phase7b4d-local' then
    raise exception 'ISOLATED_LOCAL_FIXTURE_DATABASE_REQUIRED';
  end if;
  if exists (select 1 from information_schema.columns
    where table_schema='public' and table_name='platform_test_tenant_mark_requests'
      and column_name='restaurant_id') then
    raise exception 'RECEIPT_INCLUDED_IN_GENERIC_CLEANUP';
  end if;
  if not exists (select 1 from information_schema.columns
    where table_schema='public' and table_name='platform_test_tenant_mark_requests'
      and column_name='target_restaurant_ref' and udt_name='uuid' and is_nullable='NO') then
    raise exception 'RECEIPT_TARGET_NOT_BOUND';
  end if;
  insert into auth.users(id) values(actor);
  insert into public.platform_test_tenant_cleanup_audit(
    id,restaurant_id,restaurant_name,organization_id,owner_user_id,test_session_id,
    platform_admin_user_id,reason,inventory,result
  ) values(audit_ref,target_ref,'SYNTHETIC RECEIPT FIXTURE',target_ref,actor,
    'phase7b4c-receipt-fixture',actor,'Synthetic immutable receipt test','{}','MARKED');
  insert into public.platform_test_tenant_mark_requests(
    idempotency_key,actor_id,target_restaurant_ref,organization_ref,location_ref,
    operation,payload_hash,result,cleanup_audit_id
  ) values(request_ref,actor,target_ref,target_ref,target_ref,
    'MARK_TEST_ONLY_TENANT',repeat('a',64),'{}',audit_ref);
  select to_jsonb(receipt) into before_row from public.platform_test_tenant_mark_requests receipt
    where idempotency_key=request_ref;
  begin
    update public.platform_test_tenant_mark_requests set target_restaurant_ref=actor
      where idempotency_key=request_ref;
    raise exception 'RECEIPT_UPDATE_NOT_BLOCKED';
  exception when insufficient_privilege then
    if sqlerrm <> 'TEST_TENANT_MARK_REQUEST_IMMUTABLE' then raise; end if;
  end;
  begin
    delete from public.platform_test_tenant_mark_requests where idempotency_key=request_ref;
    raise exception 'RECEIPT_DELETE_NOT_BLOCKED';
  exception when insufficient_privilege then
    if sqlerrm <> 'TEST_TENANT_MARK_REQUEST_IMMUTABLE' then raise; end if;
  end;
  begin
    truncate public.platform_test_tenant_mark_requests;
    raise exception 'RECEIPT_TRUNCATE_NOT_BLOCKED';
  exception when insufficient_privilege then
    if sqlerrm <> 'TEST_TENANT_MARK_REQUEST_IMMUTABLE' then raise; end if;
  end;
  if before_row is distinct from (select to_jsonb(receipt)
    from public.platform_test_tenant_mark_requests receipt where idempotency_key=request_ref) then
    raise exception 'RECEIPT_SNAPSHOT_CHANGED';
  end if;
  if has_table_privilege('authenticated','public.platform_test_tenant_mark_requests','INSERT')
    or has_table_privilege('authenticated','public.platform_test_tenant_mark_requests','UPDATE')
    or has_table_privilege('authenticated','public.platform_test_tenant_mark_requests','DELETE')
    or has_table_privilege('anon','public.platform_test_tenant_mark_requests','SELECT') then
    raise exception 'RECEIPT_DIRECT_ACCESS_EXPOSED';
  end if;
  raise notice 'Receipt discovery, UUID binding, immutable snapshots and direct access: PASS';
end
$test$;
rollback;
