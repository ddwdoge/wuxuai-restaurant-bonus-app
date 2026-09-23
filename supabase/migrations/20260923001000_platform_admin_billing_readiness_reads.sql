-- Phase 7C.6B5: no provider activation path. Historical rows are never rewritten.
begin;
lock table public.restaurants, public.branch_subscriptions in share row exclusive mode;

create table if not exists public.billing_legacy_eligibility (
 subscription_id uuid primary key, restaurant_id uuid not null,
 organization_id uuid not null, branch_id uuid not null,
 subscription_status text not null, plan_key text not null,
 trial_started_at timestamptz, trial_ends_at timestamptz,
 captured_at timestamptz not null default statement_timestamp(),
 captured_by text not null default session_user
);
create table if not exists public.billing_legacy_seal (
 singleton boolean primary key default true check(singleton),
 row_count bigint not null, fingerprint text not null,
 captured_at timestamptz not null default statement_timestamp(),
 captured_by text not null default session_user
);
alter table public.billing_legacy_eligibility enable row level security;
alter table public.billing_legacy_seal enable row level security;
revoke all on public.billing_legacy_eligibility, public.billing_legacy_seal from public,anon,authenticated,service_role;

-- The seal also records an empty initial set. Replays must NEVER admit new rows.
do $$ begin
 if not exists(select 1 from public.billing_legacy_seal) then
  insert into public.billing_legacy_eligibility
   (subscription_id,restaurant_id,organization_id,branch_id,subscription_status,plan_key,trial_started_at,trial_ends_at)
  select s.id,r.id,r.organization_id,b.id,s.subscription_status,s.plan_key,s.trial_started_at,s.trial_ends_at
  from public.restaurants r join public.branches b
   on b.id=r.primary_branch_id and b.restaurant_id=r.id and b.organization_id=r.organization_id
  join public.branch_subscriptions s on s.branch_id=b.id and s.organization_id=r.organization_id
  where r.activation_status is null and s.status=s.subscription_status
   and s.subscription_status in ('active','trialing')
   and (s.subscription_status='active' or
    (s.trial_started_at is not null and isfinite(s.trial_started_at) and s.trial_started_at<=statement_timestamp()
     and s.trial_ends_at is not null and isfinite(s.trial_ends_at) and s.trial_ends_at>s.trial_started_at));
  insert into public.billing_legacy_seal(row_count,fingerprint)
  select count(*),encode(extensions.digest(coalesce(string_agg(to_jsonb(e)::text,E'\n' order by subscription_id),''),'sha256'),'hex')
  from public.billing_legacy_eligibility e;
 end if;
end $$;
create or replace function public.billing_legacy_immutable()
returns trigger language plpgsql set search_path=pg_catalog,pg_temp as $$
begin raise exception 'BILLING_LEGACY_IMMUTABLE' using errcode='42501'; end $$;
revoke all on function public.billing_legacy_immutable() from public,anon,authenticated,service_role;
do $$ declare rel text; begin
 foreach rel in array array['billing_legacy_eligibility','billing_legacy_seal'] loop
  if not exists(select 1 from pg_trigger where tgrelid=('public.'||rel)::regclass and tgname='billing_legacy_immutable') then
   execute format('create trigger billing_legacy_immutable before insert or update or delete or truncate on public.%I for each statement execute function public.billing_legacy_immutable()',rel);
  end if;
 end loop;
end $$;

-- Private transaction-bound intent; caller-supplied settings are not authority.
create table if not exists public.billing_admin_write_context (
 transaction_id bigint not null, subscription_id uuid not null, actor_id uuid not null,
 expected_trial_end timestamptz, primary key(transaction_id,subscription_id)
);
alter table public.billing_admin_write_context enable row level security;
revoke all on public.billing_admin_write_context from public,anon,authenticated,service_role;

create or replace function public.billing_admin_actions_internal(input_restaurant_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public,pg_temp as $$
declare r public.restaurants%rowtype; s public.branch_subscriptions%rowtype; e public.billing_legacy_eligibility%rowtype;
 eligible boolean; extend_allowed boolean;
begin
 select * into r from public.restaurants where id=input_restaurant_id;
 select * into s from public.branch_subscriptions where branch_id=r.primary_branch_id and organization_id=r.organization_id;
 select * into e from public.billing_legacy_eligibility where subscription_id=s.id and restaurant_id=r.id
  and organization_id=r.organization_id and branch_id=s.branch_id;
 eligible:=e.subscription_id is not null and r.activation_status is null and s.plan_key=e.plan_key;
 extend_allowed:=coalesce(eligible and e.subscription_status='trialing' and s.status='trialing' and s.subscription_status='trialing'
  and s.trial_started_at=e.trial_started_at and s.trial_started_at<=statement_timestamp()
  and isfinite(s.trial_started_at) and isfinite(s.trial_ends_at) and s.trial_ends_at>statement_timestamp()
  and e.trial_ends_at>e.trial_started_at,false);
 return jsonb_build_object('legacy_eligible',coalesce(eligible,false),'extend_trial',extend_allowed,
  'activate',false,'set_payment',false,'reduce_access',s.id is not null and r.activation_status is null,
  'reason',case when r.activation_status='pending_activation' then 'PENDING_ACTIVATION'
    when extend_allowed then 'HISTORICAL_TRIAL' when eligible then 'LEGACY_OVERRIDE' else 'PROVIDER_ACTIVATION_REQUIRED' end);
end $$;
revoke all on function public.billing_admin_actions_internal(uuid) from public,anon,authenticated,service_role;

-- Guard all writers, including SECURITY DEFINER and service-role DML.
-- Serialize on the same restaurant row as registration and administrative writes.
-- An existing binding is a lookup, never an INSERT ... ON CONFLICT attempt:
-- BEFORE INSERT guards run before conflict resolution in PostgreSQL.
create or replace function public.ensure_restaurant_branch(input_restaurant_id uuid)
returns uuid language plpgsql security definer
set search_path=pg_catalog,public,pg_temp as $$
declare
 restaurant_record public.restaurants%rowtype;
 branch_record public.branches%rowtype;
 subscription_record public.branch_subscriptions%rowtype;
 organization_id_value uuid;
begin
 select * into restaurant_record from public.restaurants
 where id=input_restaurant_id for update;
 if restaurant_record.id is null then raise exception 'restaurant not found'; end if;

 if restaurant_record.primary_branch_id is not null then
  select * into branch_record from public.branches where id=restaurant_record.primary_branch_id;
  if branch_record.id is null or branch_record.restaurant_id is distinct from restaurant_record.id
   or branch_record.organization_id is distinct from restaurant_record.organization_id then
   raise exception 'SUBSCRIPTION_TENANT_MISMATCH' using errcode='42501';
  end if;
 else
  if (select count(*) from public.branches where restaurant_id=restaurant_record.id)>1 then
   raise exception 'SUBSCRIPTION_TENANT_MISMATCH' using errcode='42501';
  end if;
  select * into branch_record from public.branches where restaurant_id=restaurant_record.id;
  if branch_record.id is not null and branch_record.organization_id is distinct from restaurant_record.organization_id then
   raise exception 'SUBSCRIPTION_TENANT_MISMATCH' using errcode='42501';
  end if;
 end if;
 if branch_record.id is not null then
  select * into subscription_record from public.branch_subscriptions where branch_id=branch_record.id;
  if subscription_record.id is not null then
   if subscription_record.organization_id is distinct from restaurant_record.organization_id then
    raise exception 'SUBSCRIPTION_TENANT_MISMATCH' using errcode='42501';
   end if;
   return branch_record.id;
  end if;
 end if;

 -- Only the existing private, transaction-bound registration authority may
 -- create a subscription. Claims, caller parameters and service role do not.
 if public.resolve_branch_creation_lifecycle_internal(input_restaurant_id)<>'PENDING_ACTIVATION' then
  raise exception 'BILLING_PROVIDER_ACTIVATION_REQUIRED' using errcode='42501';
 end if;
 organization_id_value:=restaurant_record.organization_id;
 if organization_id_value is null then
  insert into public.organizations(owner_id,name,status)
  values(restaurant_record.owner_id,restaurant_record.name,restaurant_record.status)
  returning id into organization_id_value;
  update public.restaurants set organization_id=organization_id_value where id=restaurant_record.id;
 end if;
 if branch_record.id is null then
  insert into public.branches(organization_id,restaurant_id,name,slug,status)
  values(organization_id_value,restaurant_record.id,restaurant_record.name,restaurant_record.slug,restaurant_record.status)
  returning * into branch_record;
 end if;
 update public.restaurants set primary_branch_id=branch_record.id
 where id=restaurant_record.id and primary_branch_id is distinct from branch_record.id;
 insert into public.branch_subscriptions(organization_id,branch_id,status,plan_key,subscription_status,
  payment_status,trial_started_at,trial_ends_at,current_period_ends_at,current_period_end,selected_plan)
 values(organization_id_value,branch_record.id,'pending_activation','BASIC','pending_activation',
  'not_required',null,null,null,null,'BASIC');
 return branch_record.id;
end $$;
revoke all on function public.ensure_restaurant_branch(uuid) from public,anon,authenticated;

create or replace function public.guard_billing_activation_write()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare tenant uuid; actions jsonb;
begin
 if tg_op='INSERT' then
  if new.subscription_status is distinct from 'pending_activation' or new.status is distinct from 'pending_activation'
   or new.payment_status is distinct from 'not_required' or new.trial_started_at is not null or new.trial_ends_at is not null
   or new.stripe_customer_id is not null or new.stripe_subscription_id is not null
   or new.current_period_start is not null or new.current_period_end is not null or new.current_period_ends_at is not null then
   raise exception 'BILLING_PROVIDER_ACTIVATION_REQUIRED' using errcode='42501';
  end if;
  return new;
 end if;
 if new.id is distinct from old.id or new.branch_id is distinct from old.branch_id or new.organization_id is distinct from old.organization_id
  or new.payment_status is distinct from old.payment_status
  or new.stripe_customer_id is distinct from old.stripe_customer_id or new.stripe_subscription_id is distinct from old.stripe_subscription_id
  or new.current_period_start is distinct from old.current_period_start or new.current_period_end is distinct from old.current_period_end
  or new.current_period_ends_at is distinct from old.current_period_ends_at
  or new.trial_started_at is distinct from old.trial_started_at
  or (new.plan_key is distinct from old.plan_key and new.plan_key<>'BASIC')
  or (new.subscription_status is distinct from old.subscription_status and new.subscription_status not in ('paused','cancelled','unpaid'))
  or (new.status is distinct from old.status and new.status not in ('paused','cancelled','unpaid')) then
  raise exception 'BILLING_PROVIDER_ACTIVATION_REQUIRED' using errcode='42501';
 end if;
 if new.trial_ends_at is distinct from old.trial_ends_at then
  select restaurant_id into tenant from public.branches where id=old.branch_id;
  actions:=public.billing_admin_actions_internal(tenant);
  if coalesce((actions->>'extend_trial')::boolean,false) is not true
   or new.status<>'trialing' or new.subscription_status<>'trialing' or new.plan_key is distinct from old.plan_key
   or new.trial_ends_at is null or not isfinite(new.trial_ends_at) or new.trial_ends_at<=old.trial_ends_at
   or not exists(select 1 from public.billing_admin_write_context c where c.transaction_id=txid_current()
    and c.subscription_id=old.id and c.actor_id=auth.uid() and c.expected_trial_end=new.trial_ends_at) then
   raise exception 'BILLING_HISTORICAL_TRIAL_REQUIRED' using errcode='42501';
  end if;
 end if;
 return new;
end $$;
revoke all on function public.guard_billing_activation_write() from public,anon,authenticated,service_role;
drop trigger if exists billing_activation_guard on public.branch_subscriptions;
create trigger billing_activation_guard before insert or update on public.branch_subscriptions
for each row execute function public.guard_billing_activation_write();

-- Preserve the existing confirmed request/audit implementation behind a private delegate.
do $$ begin
 if to_regprocedure('public.billing_subscription_confirmed_legacy_164(uuid,text,text,text,integer,text,text,uuid)') is null then
  alter function public.update_platform_restaurant_subscription_confirmed(uuid,text,text,text,integer,text,text,uuid)
   rename to billing_subscription_confirmed_legacy_164;
 end if;
 if to_regprocedure('public.billing_subscription_writer_legacy_164(uuid,text,text,text,integer,text)') is null then
  alter function public.update_platform_restaurant_subscription_internal_v1(uuid,text,text,text,integer,text)
   rename to billing_subscription_writer_legacy_164;
 end if;
end $$;
revoke all on function public.billing_subscription_confirmed_legacy_164(uuid,text,text,text,integer,text,text,uuid) from public,anon,authenticated,service_role;
revoke all on function public.billing_subscription_writer_legacy_164(uuid,text,text,text,integer,text) from public,anon,authenticated,service_role;

create or replace function public.update_platform_restaurant_subscription_internal_v1(
 input_restaurant_id uuid,input_subscription_status text default null,input_payment_status text default null,
 input_restaurant_status text default null,input_trial_extension_days integer default null,input_reason text default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare s public.branch_subscriptions%rowtype; actions jsonb; result jsonb;
begin
 if auth.uid() is null or coalesce(public.current_platform_role(),'') not in
  ('platform_owner','platform_admin','app_admin','super_admin','wuxuai_admin','billing_admin') then
  raise exception 'BILLING_ADMIN_FORBIDDEN' using errcode='42501'; end if;
 perform public.require_recent_platform_auth_internal();
 perform 1 from public.restaurants where id=input_restaurant_id for update;
 select s0.* into s from public.branch_subscriptions s0 join public.restaurants r
  on r.primary_branch_id=s0.branch_id and r.organization_id=s0.organization_id where r.id=input_restaurant_id for update of s0;
 actions:=public.billing_admin_actions_internal(input_restaurant_id);
 if s.id is null or input_payment_status is not null or input_restaurant_status is not null
  or (input_subscription_status is not null and input_subscription_status not in ('paused','cancelled','unpaid'))
  or (actions->>'reduce_access')::boolean is not true then
  raise exception 'BILLING_PROVIDER_ACTIVATION_REQUIRED' using errcode='42501'; end if;
 if input_trial_extension_days is not null then
  if input_subscription_status is not null or input_trial_extension_days<=0 or (actions->>'extend_trial')::boolean is not true then
   raise exception 'BILLING_HISTORICAL_TRIAL_REQUIRED' using errcode='42501'; end if;
  insert into public.billing_admin_write_context values(txid_current(),s.id,auth.uid(),s.trial_ends_at+make_interval(days=>input_trial_extension_days));
 end if;
 result:=public.billing_subscription_writer_legacy_164(input_restaurant_id,input_subscription_status,null,null,input_trial_extension_days,input_reason);
 delete from public.billing_admin_write_context where transaction_id=txid_current() and subscription_id=s.id;
 return result;
end $$;
revoke all on function public.update_platform_restaurant_subscription_internal_v1(uuid,text,text,text,integer,text) from public,anon,authenticated,service_role;

create or replace function public.update_platform_restaurant_subscription_confirmed(
 input_restaurant_id uuid,input_subscription_status text,input_payment_status text,input_restaurant_status text,
 input_trial_extension_days integer,input_reason text,input_confirmation text,input_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare actor uuid:=auth.uid(); actor_role text:=public.current_platform_role();
 s public.branch_subscriptions%rowtype; operation public.platform_admin_operations%rowtype;
 request_value jsonb; before_value jsonb; after_value jsonb; response_value jsonb;
begin
 if actor is null or coalesce(actor_role,'') not in ('platform_owner','platform_admin','app_admin','super_admin','wuxuai_admin','billing_admin') then
  raise exception 'BILLING_ADMIN_FORBIDDEN' using errcode='42501'; end if;
 perform public.require_recent_platform_auth_internal();
 if input_confirmation is distinct from 'CONFIRMED' or input_idempotency_key is null or input_restaurant_id is null
  or length(trim(coalesce(input_reason,'')))<10 or input_payment_status is not null or input_restaurant_status is not null
  or (input_subscription_status is null and input_trial_extension_days is null)
  or (input_trial_extension_days is not null and (input_trial_extension_days<=0 or input_subscription_status is not null)) then
  raise exception 'INVALID_CONFIRMED_BILLING_ACTION' using errcode='42501'; end if;
 -- Even a pre-165 idempotency key cannot advertise a newly permitted activation.
 if input_subscription_status is not null and input_subscription_status not in ('paused','cancelled','unpaid') then
  raise exception 'BILLING_PROVIDER_ACTIVATION_REQUIRED' using errcode='42501'; end if;
 perform 1 from public.restaurants where id=input_restaurant_id for update;
 -- No initialization/INSERT ON CONFLICT: this endpoint administers existing contracts only.
 select s0.* into s from public.branch_subscriptions s0 join public.restaurants r
  on r.primary_branch_id=s0.branch_id and r.organization_id=s0.organization_id
  join public.branches b on b.id=s0.branch_id and b.restaurant_id=r.id and b.organization_id=r.organization_id
  where r.id=input_restaurant_id and r.activation_status is null for update of s0;
 if s.id is null then raise exception 'BILLING_EXISTING_CONTRACT_REQUIRED' using errcode='42501'; end if;
 request_value:=jsonb_build_object('restaurant_id',input_restaurant_id,'subscription_status',input_subscription_status,
  'trial_extension_days',input_trial_extension_days,'reason',trim(input_reason));
 select * into operation from public.platform_admin_operations where platform_admin_user_id=actor
  and tenant_id=input_restaurant_id and action_type='SUBSCRIPTION_UPDATED' and idempotency_key=input_idempotency_key;
 if found then
  if operation.after_state->'subscription_request' is distinct from request_value then
   raise exception 'REQUEST_KEY_CONFLICT' using errcode='22023'; end if;
  return operation.after_state->'subscription_response';
 end if;
 before_value:=to_jsonb(s);
 response_value:=public.update_platform_restaurant_subscription_internal_v1(input_restaurant_id,input_subscription_status,null,null,input_trial_extension_days,trim(input_reason));
 select to_jsonb(x) into after_value from public.branch_subscriptions x where id=s.id;
 insert into public.platform_admin_operations(platform_admin_user_id,platform_admin_role,action_type,entity_type,entity_id,
  tenant_id,severity,reason,before_state,after_state,result,idempotency_key)
 values(actor,actor_role,'SUBSCRIPTION_UPDATED','branch_subscriptions',s.id,input_restaurant_id,'SENSITIVE',trim(input_reason),
  before_value,after_value||jsonb_build_object('subscription_request',request_value,'subscription_response',response_value),'SUCCESS',input_idempotency_key);
 return response_value;
end $$;
revoke all on function public.update_platform_restaurant_subscription_confirmed(uuid,text,text,text,integer,text,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.update_platform_restaurant_subscription_confirmed(uuid,text,text,text,integer,text,text,uuid) to authenticated;

create or replace function public.get_platform_billing_readiness(input_restaurant_id uuid default null,input_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public,pg_temp as $$
declare products jsonb; businesses jsonb;
begin
 if auth.uid() is null or coalesce(public.current_platform_role(),'') not in ('platform_owner','platform_admin') then
  raise exception 'BILLING_READINESS_FORBIDDEN' using errcode='42501'; end if;
 if input_offset is null or input_offset<0 then raise exception 'INVALID_OFFSET' using errcode='22023'; end if;
 select jsonb_agg(jsonb_build_object('test',public.resolve_billing_product_internal(code,'TEST'),
  'live',public.resolve_billing_product_internal(code,'LIVE')) order by code) into products
 from unnest(array['BASIC','PRO','OFFER_CAPACITY','CUSTOMER_CAPACITY']) code;
 select coalesce(jsonb_agg(item order by id),'[]') into businesses from (
  select r.id,jsonb_build_object('restaurant_id',r.id,'name',r.name,'country',b.country,
   'activation',public.restaurant_activation_state_internal(r.id),'subscription_status',s.subscription_status,
   'trial_status',case when s.trial_started_at is not null and s.trial_ends_at is not null then 'HISTORICAL_TRIAL' else 'NONE' end,
   'kyb_status','NOT_VERIFIED_BY_BILLING',
   'commercial',public.resolve_commercial_plan_release_internal(r.id,'PRO'),
   'actions',public.billing_admin_actions_internal(r.id)) item
  from public.restaurants r left join public.branches b on b.id=r.primary_branch_id and b.restaurant_id=r.id and b.organization_id=r.organization_id
  left join public.branch_subscriptions s on s.branch_id=b.id and s.organization_id=r.organization_id
  where input_restaurant_id is null or r.id=input_restaurant_id order by r.id limit 50 offset input_offset
 ) rows;
 return jsonb_build_object('products',products,'businesses',businesses,'offset',input_offset,
  'total',(select count(*) from public.restaurants where input_restaurant_id is null or id=input_restaurant_id),
  'pending_count',(select count(*) from public.restaurants where activation_status='pending_activation'),
  'pending_installed',to_regprocedure('public.get_restaurant_activation_state(uuid)') is not null,
  'customer_window_days',365,'live_billing','BLOCKED','provider_activation_implemented',false);
end $$;
revoke all on function public.get_platform_billing_readiness(uuid,integer) from public,anon,authenticated,service_role;
grant execute on function public.get_platform_billing_readiness(uuid,integer) to authenticated;
notify pgrst,'reload schema';
commit;
