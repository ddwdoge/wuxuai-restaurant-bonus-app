-- LOCAL ONLY; run after pro-subscription-write-lock.sql and the real legacy writer.
\set ON_ERROR_STOP on
do $$ begin
  if current_database() <> 'wuxuai_subscription_lock_local' then raise exception 'LOCAL DATABASE REQUIRED'; end if;
end $$;
alter table public.branch_subscriptions add paused_at timestamptz, add locked_at timestamptz, add lock_reason text;
alter table public.audit_log add organization_id uuid, add branch_id uuid;
create table public.platform_admin_operations (
  id uuid primary key default gen_random_uuid(), platform_admin_user_id uuid not null,
  platform_admin_role text not null, action_type text not null, entity_type text not null,
  entity_id uuid, tenant_id uuid not null references public.restaurants(id),
  severity text check(severity in ('NORMAL','SENSITIVE','CRITICAL')), reason text,
  before_state jsonb, after_state jsonb, result text check(result in ('SUCCESS','BLOCKED','FAILED')),
  idempotency_key uuid not null, unique(platform_admin_user_id,action_type,tenant_id,idempotency_key)
);
alter table public.platform_admin_operations enable row level security;
\ir ../supabase/migrations/20260911003000_subscription_admin_request_contract.sql
select id as tenant from public.restaurants where owner_id='10000000-0000-4000-8000-000000000002' \gset
select id as foreign_tenant from public.restaurants where owner_id='10000000-0000-4000-8000-000000000001' \gset
set test.target=:'tenant';
set test.foreign_target=:'foreign_tenant';
create function public.test_subscription_request(confirmation text default 'CONFIRMED', request_key uuid default '20000000-0000-4000-8000-000000000001',
  reason text default 'Synthetic support request', days integer default 14,
  payment text default null, tenant uuid default null, status text default null, restaurant_status text default null)
returns jsonb language sql security invoker as $$
  select public.update_platform_restaurant_subscription_confirmed(coalesce(tenant,current_setting('test.target')::uuid),
    status,payment,restaurant_status,days,reason,confirmation,request_key);
$$;
set role authenticated;
set test.actor='10000000-0000-4000-8000-000000000003';
set test.platform_role='';
select public.test_block('select public.test_subscription_request()','42501','confirmed API Customer blocked');
set test.actor='10000000-0000-4000-8000-000000000002';
select public.test_block('select public.test_subscription_request()','42501','confirmed API Owner blocked');
select public.test_block('select public.test_subscription_request(tenant=>current_setting(''test.foreign_target'')::uuid)','42501','confirmed API cross-tenant Owner blocked');
set test.actor='10000000-0000-4000-8000-000000000004';
select public.test_block('select public.test_subscription_request()','42501','confirmed API Staff blocked');
set test.platform_role='support_admin';
select public.test_block('select public.test_subscription_request()','42501','non-writing Platform role blocked');
set test.platform_role='platform_admin';
select public.test_block('select public.test_subscription_request(confirmation=>null)','22023','NULL confirmation blocked');
select public.test_block('select public.test_subscription_request(confirmation=>''confirmed'')','22023','case-sensitive confirmation');
select public.test_block('select public.test_subscription_request(confirmation=>''CONFIRMED '')','22023','exact confirmation');
select public.test_block('select public.test_subscription_request(request_key=>null)','22023','missing request key blocked');
select public.test_block('select public.test_subscription_request(reason=>null)','22023','missing reason blocked');
select public.test_block('select public.test_subscription_request(reason=>''short'')','22023','short reason blocked');
select public.test_block('select public.test_subscription_request(payment=>''paid'')','42501','confirmed API payment blocked');
select public.test_block('select public.test_subscription_request(restaurant_status=>''active'')','42501','confirmed API tenant lifecycle blocked');
select public.test_block('select public.test_subscription_request(days=>0)','22023','zero extension blocked');
select public.test_block('select public.test_subscription_request(status=>''invalid'')','22023','invalid status blocked');
select public.test_block('select public.test_subscription_request(tenant=>''30000000-0000-4000-8000-000000000099'')','22023','unknown tenant blocked');
select public.test_block('select public.update_platform_restaurant_subscription(null,''active'',null,null,null,''Synthetic support reason'')','42501','legacy entry point blocked');
select public.test_block('select public.update_platform_restaurant_subscription_internal_v1(null,''active'',null,null,null,''Synthetic support reason'')','42501','legacy internal remains blocked');
reset role;
create table public.test_support_before as select to_jsonb(s) state from public.branch_subscriptions s
  join public.branches b on b.id=s.branch_id where b.restaurant_id=current_setting('test.target')::uuid;
create table public.test_support_foreign as select to_jsonb(s) state from public.branch_subscriptions s
  join public.branches b on b.id=s.branch_id where b.restaurant_id=current_setting('test.foreign_target')::uuid;
set role authenticated;
select public.test_subscription_request();
select public.test_subscription_request();
select public.test_block('select public.test_subscription_request(days=>15)','22023','replay payload collision blocked');
reset role;
select public.test_assert((select count(*)=1 from public.platform_admin_operations),'support retry one immutable operation');
select public.test_assert((select count(*)=1 from public.audit_log where action='platform_subscription_updated'),'support retry one legacy audit');
select public.test_assert((select s.trial_ends_at=(t.state->>'trial_ends_at')::timestamptz+interval '14 days'
  and to_jsonb(s)-'trial_ends_at'=t.state-'trial_ends_at'
  from public.branch_subscriptions s join public.branches b on b.id=s.branch_id cross join public.test_support_before t
  where b.restaurant_id=current_setting('test.target')::uuid),'extension exactly once; other subscription fields unchanged');
select public.test_assert((select to_jsonb(s)=t.state from public.branch_subscriptions s join public.branches b on b.id=s.branch_id
  cross join public.test_support_foreign t where b.restaurant_id=current_setting('test.foreign_target')::uuid),'foreign paid subscription unchanged');
select public.test_assert((select severity='SENSITIVE' and reason='Synthetic support request'
  and platform_admin_user_id=auth.uid() and entity_id is not null and before_state is not null
  and after_state->'subscription_request' is not null and after_state->'subscription_response' is not null
  from public.platform_admin_operations),'complete actor target request before/after audit');
set role authenticated;
select public.test_subscription_request(days=>null,status=>'paused',request_key=>'20000000-0000-4000-8000-000000000002');
reset role;
select public.test_assert((select s.status='paused' and s.subscription_status='paused' and s.locked_at is not null
  and s.paused_at is not null and s.plan_key='BASIC' and s.payment_status='not_required'
  from public.branch_subscriptions s join public.branches b on b.id=s.branch_id
  where b.restaurant_id=current_setting('test.target')::uuid),'status support preserves plan/payment');
set role authenticated;
set test.actor='';
select public.test_block('select public.test_subscription_request()','42501','authenticated role without uid blocked');
reset role;
set role anon;
select public.test_block('select public.test_subscription_request()','42501','anon confirmed API blocked');
reset role;
select public.test_assert(not has_table_privilege('authenticated','public.branch_subscriptions','UPDATE'),'direct DML still revoked');
select public.test_assert((select relrowsecurity from pg_class where oid='public.branch_subscriptions'::regclass),'support RLS preserved');
select count(*) as total_sql_checks_passed from public.test_checks;
