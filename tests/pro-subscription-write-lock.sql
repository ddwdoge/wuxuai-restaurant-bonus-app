-- LOCAL ONLY. Dedicated disposable DB, synthetic identities, real PostgreSQL roles.
\set ON_ERROR_STOP on
do $$ begin
  if current_database() <> 'wuxuai_subscription_lock_local' then
    raise exception 'LOCAL TEST DATABASE REQUIRED';
  end if;
end $$;
create schema auth;
create schema extensions;
create extension pgcrypto with schema extensions;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('test.actor', true), '')::uuid;
$$;
create function public.current_platform_role() returns text language sql stable as $$
  select nullif(current_setting('test.platform_role', true), '');
$$;
create table public.profiles(id uuid primary key, full_name text);
create table public.organizations(id uuid primary key default gen_random_uuid(), owner_id uuid, name text, status text);
create table public.restaurants(id uuid primary key default gen_random_uuid(), owner_id uuid,
  name text, slug text unique, status text, restaurant_type text, language text, owner_phone text,
  onboarding_status text, onboarding_checklist jsonb, organization_id uuid references public.organizations(id),
  primary_branch_id uuid, created_at timestamptz default now());
create table public.branches(id uuid primary key default gen_random_uuid(), organization_id uuid references public.organizations(id) on delete cascade,
  restaurant_id uuid unique references public.restaurants(id) on delete cascade, name text, slug text, status text);
alter table public.restaurants add foreign key (primary_branch_id) references public.branches(id) on delete set null;
create table public.branch_subscriptions(id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  branch_id uuid unique references public.branches(id) on delete cascade, status text default 'trialing',
  plan_key text default 'BASIC', subscription_status text default 'trialing', payment_status text default 'not_required',
  trial_started_at timestamptz, trial_ends_at timestamptz, current_period_ends_at timestamptz,
  current_period_end timestamptz, created_at timestamptz default now());
create table public.restaurant_members(restaurant_id uuid, organization_id uuid, branch_id uuid, user_id uuid, role text,
  unique(restaurant_id,user_id));
create table public.audit_log(id uuid default gen_random_uuid(), restaurant_id uuid, actor_type text,
  actor_id uuid, action text, target_table text, target_id uuid, metadata jsonb);
create function public.restaurant_primary_branch_id(uuid) returns uuid language sql as $$select null::uuid$$;
create function public.update_platform_restaurant_subscription_internal_v1(uuid,text,text,text,integer,text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
  raise exception 'LEGACY_WRITER_REACHED' using errcode='P0002';
end $$;
create function public.is_restaurant_admin(tenant uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.restaurants where id=tenant and owner_id=auth.uid());
$$;
create function public.is_restaurant_member(tenant uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select public.is_restaurant_admin(tenant) or exists(select 1 from public.restaurant_members where restaurant_id=tenant and user_id=auth.uid());
$$;
alter table public.branch_subscriptions enable row level security;
alter table public.branches enable row level security;
alter table public.organizations enable row level security;
alter table public.restaurants enable row level security;
create policy "branch subscriptions admin write" on public.branch_subscriptions for all
  using(exists(select 1 from public.branches b where b.id=branch_id and public.is_restaurant_admin(b.restaurant_id)))
  with check(exists(select 1 from public.branches b where b.id=branch_id and public.is_restaurant_admin(b.restaurant_id)));
create policy "branch subscriptions member select" on public.branch_subscriptions for select
  using(exists(select 1 from public.branches b where b.id=branch_id and public.is_restaurant_member(b.restaurant_id)));
create policy "branches admin write" on public.branches for all using(public.is_restaurant_admin(restaurant_id)) with check(public.is_restaurant_admin(restaurant_id));
create policy "branches member select" on public.branches for select using(public.is_restaurant_member(restaurant_id));
create policy "organizations owner" on public.organizations for all using(owner_id=auth.uid()) with check(owner_id=auth.uid());
create policy "restaurants owner" on public.restaurants for all using(owner_id=auth.uid()) with check(owner_id=auth.uid());
grant usage on schema public,auth to anon,authenticated,service_role;
grant all on all tables in schema public to anon,authenticated,service_role;
grant insert(plan_key),update(plan_key),references(plan_key) on public.branch_subscriptions to authenticated;
\ir ../supabase/migrations/20260911002000_subscription_browser_write_lock.sql

create table public.test_checks(label text primary key);
grant insert,select on public.test_checks to anon,authenticated;
create function public.test_assert(ok boolean,label text) returns void language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'FAILED: %',label; end if;
  insert into public.test_checks values(label);
end $$;
create function public.test_block(statement text,expected text,label text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then
    if sqlstate <> expected then raise; end if;
    perform public.test_assert(true,label); return;
  end;
  raise exception 'UNEXPECTED SUCCESS: %',label;
end $$;

set role authenticated;
set test.actor='10000000-0000-4000-8000-000000000001';
select public.start_restaurant_owner_trial('Synthetic Owner','WUXUAI TEST ONLY owner');
select public.start_restaurant_owner_trial('Synthetic Owner','WUXUAI TEST ONLY owner');
select public.test_assert((select count(*)=1 from public.branch_subscriptions),'one BASIC subscription after replay');
select public.test_assert((select plan_key='BASIC' and payment_status='not_required'
  and trial_ends_at=trial_started_at+interval '3 months' from public.branch_subscriptions),'canonical defaults and Owner read');

do $$ declare field text; begin
  foreach field in array array['plan_key=''PRO''','plan_key=''PREMIUM''','payment_status=''paid''',
    'subscription_status=''active''','trial_ends_at=now()+interval ''100 years''',
    'current_period_end=now()+interval ''100 years''','current_period_ends_at=now()+interval ''100 years''',
    'trial_started_at=now()'] loop
    perform public.test_block('update public.branch_subscriptions set '||field,'42501','Owner direct '||field);
  end loop;
end $$;
select public.test_block('insert into public.branch_subscriptions(plan_key) values(''PRO'')','42501','Owner direct INSERT');
select public.test_block('delete from public.branch_subscriptions','42501','Owner direct DELETE');
select public.test_block('truncate public.branch_subscriptions','42501','Owner TRUNCATE');
select public.test_block('delete from public.branches','42501','Owner cascade via branch');
select public.test_block('delete from public.organizations','42501','Owner cascade via organization');
select public.test_block('delete from public.restaurants','42501','Owner cascade via restaurant');
select public.test_block('update public.restaurants set primary_branch_id=null','42501','Owner primary-branch redirection');
select public.test_block('update public.branches set organization_id=null','42501','Owner branch-organization redirection');
select public.test_block('select public.ensure_restaurant_branch(null)','42501','internal branch RPC');
select public.test_block('select public.restaurant_primary_branch_id(null)','42501','internal branch wrapper');
select public.test_block('select public.update_platform_restaurant_subscription_internal_v1(null,null,null,null,null,null)','42501','internal legacy writer');
select public.test_block('select public.update_platform_restaurant_subscription(null,''active'',null,null,null,''Synthetic attack reason'')','42501','NULL platform role cannot reach legacy writer');
select public.test_block('select public.start_restaurant_owner_trial(input_owner_name=>''test'',input_restaurant_name=>''test'',input_plan_key=>''PRO'')','42883','tampered onboarding plan argument');
select public.test_block('select public.start_restaurant_owner_trial(input_owner_name=>''test'',input_restaurant_name=>''test'',input_payment_status=>''paid'')','42883','tampered onboarding payment argument');

reset role;
create table public.test_subscription_snapshot as select to_jsonb(s) record from public.branch_subscriptions s;
update public.branch_subscriptions set plan_key='PRO',status='active',subscription_status='active',payment_status='paid',trial_started_at=null,trial_ends_at=null;
truncate public.test_subscription_snapshot;
insert into public.test_subscription_snapshot select to_jsonb(s) from public.branch_subscriptions s;
set role authenticated;
select public.start_restaurant_owner_trial('Synthetic Owner','WUXUAI TEST ONLY owner');
reset role;
select public.test_assert((select to_jsonb(s)=t.record from public.branch_subscriptions s cross join public.test_subscription_snapshot t),'paid subscription byte-state preserved by onboarding');

-- A second real PostgreSQL identity in the synthetic schema is a foreign Owner.
set role authenticated;
set test.actor='10000000-0000-4000-8000-000000000002';
select public.start_restaurant_owner_trial('Foreign Owner','WUXUAI TEST ONLY foreign');
select public.test_assert((select count(*)=1 from public.branch_subscriptions),'foreign Owner cannot read first tenant');
select public.test_block('update public.branch_subscriptions set plan_key=''PRO''','42501','foreign Owner writes');

set test.actor='10000000-0000-4000-8000-000000000003';
select public.test_block('update public.branch_subscriptions set payment_status=''paid''','42501','Customer writes');
set test.actor='10000000-0000-4000-8000-000000000004';
select public.test_block('delete from public.branch_subscriptions','42501','Staff writes');
set test.platform_role='platform_admin';
select public.test_block('update public.branch_subscriptions set plan_key=''PRO''','42501','Platform Admin direct DML');
select public.test_block('select public.update_platform_restaurant_subscription(null,''active'',null,null,null,''short'')','22023','Admin reason mandatory');
select public.test_block('select public.update_platform_restaurant_subscription(null,''active'',''paid'',null,null,''Synthetic test reason'')','42501','Admin manual payment denied');
select public.test_block('select public.update_platform_restaurant_subscription(null,''active'',null,null,null,''Synthetic test reason'')','P0002','authorized Admin reaches existing writer');
reset role;
set role anon;
set test.actor='';
select public.test_block('insert into public.branch_subscriptions(plan_key) values(''PRO'')','42501','anon INSERT');
select public.test_block('update public.branch_subscriptions set plan_key=''PRO''','42501','anon UPDATE');
select public.test_block('delete from public.branch_subscriptions','42501','anon DELETE');
select public.test_block('select public.start_restaurant_owner_trial(''test'',''test'')','42501','anon onboarding');
reset role;

select public.test_assert(not exists(select 1 from pg_attribute a where a.attrelid='public.branch_subscriptions'::regclass
  and a.attnum>0 and not a.attisdropped and (has_column_privilege('authenticated',a.attrelid,a.attnum,'INSERT')
  or has_column_privilege('authenticated',a.attrelid,a.attnum,'UPDATE'))),'all column DML revoked');
select public.test_assert((select relrowsecurity from pg_class where oid='public.branch_subscriptions'::regclass),'RLS preserved');
select public.test_assert(has_table_privilege('service_role','public.branch_subscriptions','INSERT,UPDATE,DELETE'),'server-role grants preserved');
select count(*) as sql_checks_passed from public.test_checks;
